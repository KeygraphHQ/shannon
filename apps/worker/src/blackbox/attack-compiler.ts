// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { createHash } from 'node:crypto';
import type {
  BlackboxHypothesis,
  BlackboxResource,
  BlackboxSnapshot,
  EvidenceRef,
  NormalizedExchange,
  PlannerTask,
} from '../types/blackbox.js';

export interface CompiledAuthorizationAttacks {
  readonly hypotheses: readonly BlackboxHypothesis[];
  readonly tasks: readonly PlannerTask[];
}

interface AttackCandidate {
  readonly boundaryKey: string;
  readonly digest: string;
  readonly hypothesis: BlackboxHypothesis;
  readonly task: PlannerTask;
  readonly visibilityRank: number;
  readonly methodRank: number;
  readonly markerLength: number;
  readonly resourceId: string;
}

const READ_OPERATIONS = new Set(['get', 'read', 'fetch', 'view', 'list', 'search', 'query', 'lookup', 'download']);
const WRITE_OPERATIONS = new Set([
  'create',
  'update',
  'delete',
  'remove',
  'set',
  'patch',
  'put',
  'archive',
  'restore',
  'invite',
  'reset',
  'change',
  'rotate',
  'revoke',
  'grant',
  'transfer',
  'upload',
]);

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function safeResourceType(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^A-Za-z0-9 _-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim();
  return normalized || 'resource';
}

function readSafe(exchange: NormalizedExchange): boolean {
  const method = exchange.method.toUpperCase();
  if (method === 'GET') return true;
  if (method !== 'POST') return false;
  const operation = exchange.path.split('/').filter(Boolean).at(-1) ?? '';
  const tokens = operation
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((token) => token.toLowerCase());
  return tokens.some((token) => READ_OPERATIONS.has(token)) && !tokens.some((token) => WRITE_OPERATIONS.has(token));
}

function decodedPathSegments(path: string): ReadonlySet<string> {
  const segments = new Set<string>();
  for (const segment of path.split('/')) {
    if (!segment) continue;
    try {
      segments.add(decodeURIComponent(segment));
    } catch {
      segments.add(segment);
    }
  }
  return segments;
}

function groundedReferences(exchange: NormalizedExchange, resource: BlackboxResource): string[] {
  const observed = new Set([...exchange.candidateObjectReferences, ...decodedPathSegments(exchange.path)]);
  return [...new Set(resource.objectReferences)]
    .filter(
      (reference) =>
        reference.length > 0 &&
        reference.length <= 512 &&
        reference === reference.trim() &&
        !/[\r\n]/.test(reference) &&
        observed.has(reference),
    )
    .sort((left, right) => right.length - left.length || compareText(left, right));
}

function directlyEvidences(resource: BlackboxResource, exchangeId: string): boolean {
  return resource.evidence.some(({ id, kind }) => id === exchangeId && kind === 'exchange');
}

function evidenceFor(
  source: NormalizedExchange,
  control: NormalizedExchange,
  victimResource: BlackboxResource,
  peerResource: BlackboxResource | null,
): EvidenceRef[] {
  const evidence: EvidenceRef[] = [
    { id: source.exchangeId, kind: 'exchange' },
    { id: control.exchangeId, kind: 'exchange' },
    { id: victimResource.resourceId, kind: 'resource' },
    ...(peerResource ? [{ id: peerResource.resourceId, kind: 'resource' as const }] : []),
  ];
  return evidence.sort((left, right) => compareText(left.kind, right.kind) || compareText(left.id, right.id));
}

function priorReplayExists(snapshot: BlackboxSnapshot, resourceId: string, actor: string): boolean {
  return snapshot.tasks.some(
    ({ kind, evidence, replayPlan }) =>
      kind === 'action' &&
      evidence.some((reference) => reference.kind === 'resource' && reference.id === resourceId) &&
      replayPlan?.steps.some((step) => step.actor === actor && step.mutations.length === 0) === true,
  );
}

function candidateOrder(left: AttackCandidate, right: AttackCandidate): number {
  return (
    left.visibilityRank - right.visibilityRank ||
    left.methodRank - right.methodRank ||
    right.markerLength - left.markerLength ||
    compareText(right.resourceId, left.resourceId) ||
    compareText(left.digest, right.digest)
  );
}

/**
 * Turn already-grounded ownership and route evidence into bounded identity-swap replays.
 * The replay and verifier remain responsible for proving impact; this compiler only
 * removes the model's need to rediscover the authorization-test template.
 */
export function compileAuthorizationAttacks(snapshot: BlackboxSnapshot, limit = 2): CompiledAuthorizationAttacks {
  if (snapshot.runStatus !== 'running' || !Number.isInteger(limit) || limit < 1) {
    return { hypotheses: [], tasks: [] };
  }

  const boundedLimit = Math.min(limit, 6);
  const authenticated = new Map(
    snapshot.identities.filter(({ authenticated }) => authenticated).map((identity) => [identity.name, identity]),
  );
  if (authenticated.size < 2) return { hypotheses: [], tasks: [] };

  const existingTaskIds = new Set([
    ...snapshot.tasks.map(({ taskId }) => taskId),
    ...snapshot.rejectedTasks.map(({ task }) => task.taskId),
  ]);
  const existingHypotheses = new Map(snapshot.hypotheses.map((hypothesis) => [hypothesis.hypothesisId, hypothesis]));
  const exchanges = [...snapshot.exchanges].sort((left, right) => compareText(left.exchangeId, right.exchangeId));
  const resources = [...snapshot.resources].sort((left, right) => compareText(left.resourceId, right.resourceId));
  const candidates: AttackCandidate[] = [];

  for (const victimResource of resources) {
    if (
      (victimResource.visibility !== 'private' && victimResource.visibility !== 'role-scoped') ||
      victimResource.ownerIdentity === null ||
      victimResource.provenance.actor !== 'blackbox-recon'
    ) {
      continue;
    }
    const victim = authenticated.get(victimResource.ownerIdentity);
    if (!victim) continue;

    const sources = exchanges.filter(
      (exchange) =>
        exchange.identity === victim.name &&
        exchange.origin === snapshot.targetOrigin &&
        exchange.provenance.actor === 'blackbox-recon' &&
        exchange.responseStatus >= 200 &&
        exchange.responseStatus < 300 &&
        exchange.responseStatus !== 204 &&
        readSafe(exchange) &&
        directlyEvidences(victimResource, exchange.exchangeId) &&
        groundedReferences(exchange, victimResource).length > 0,
    );

    for (const source of sources) {
      const marker = groundedReferences(source, victimResource)[0];
      if (!marker) continue;
      const controls = exchanges.filter(
        (exchange) =>
          exchange.identity !== victim.name &&
          authenticated.has(exchange.identity) &&
          exchange.origin === snapshot.targetOrigin &&
          exchange.routeSignature === source.routeSignature &&
          exchange.provenance.actor === 'blackbox-recon' &&
          exchange.responseStatus >= 200 &&
          exchange.responseStatus < 300,
      );

      for (const control of controls) {
        if (control.identity === 'anonymous') continue;
        const attacker = authenticated.get(control.identity);
        if (!attacker) continue;
        const controlReferences = new Set([...control.candidateObjectReferences, ...decodedPathSegments(control.path)]);
        if (controlReferences.has(marker)) continue;
        const sameRole = attacker.role === victim.role;
        if (!sameRole) continue;
        const baselineReferences = new Set([
          ...source.candidateObjectReferences,
          ...victimResource.objectReferences,
          ...decodedPathSegments(source.path),
        ]);
        const peerResource =
          resources.find(
            (resource) =>
              resource.resourceId !== victimResource.resourceId &&
              resource.ownerIdentity === attacker.name &&
              (resource.visibility === 'private' || resource.visibility === 'role-scoped') &&
              resource.provenance.actor === 'blackbox-recon' &&
              directlyEvidences(resource, control.exchangeId) &&
              groundedReferences(control, resource).some((reference) => !baselineReferences.has(reference)),
          ) ?? null;
        if (!peerResource) continue;

        const key = [
          victimResource.resourceId,
          source.exchangeId,
          victim.name,
          attacker.name,
          source.routeSignature,
        ].join('\0');
        const idDigest = digest(key);
        const hypothesisId = `hyp_authz_${idDigest}`;
        const taskId = `action_authz_${idDigest}`;
        if (
          existingTaskIds.has(taskId) ||
          existingHypotheses.has(hypothesisId) ||
          priorReplayExists(snapshot, victimResource.resourceId, attacker.name)
        ) {
          continue;
        }

        const evidence = evidenceFor(source, control, victimResource, peerResource);
        const resourceType = safeResourceType(victimResource.resourceType);
        const hypothesis: BlackboxHypothesis = {
          hypothesisId,
          kind: 'horizontal',
          summary: `An authenticated peer may read a victim-owned ${victimResource.visibility} ${resourceType}.`,
          preconditions: ['The victim and attacker hold distinct authenticated identities.'],
          attackerCapability: `Replay the victim ${resourceType} request with the attacker identity.`,
          evidence,
          priority: 'high',
          status: 'open',
          provenance: { actor: 'orchestrator', taskId: 'authorization-compiler', baseRevision: snapshot.revision },
        };
        const task: PlannerTask = {
          taskId,
          kind: 'action',
          objective: `Replay the victim ${resourceType} request as ${attacker.name} and prove whether it discloses victim-owned data.`,
          evidence,
          identityLease: attacker.name,
          hypothesisId,
          status: 'pending',
          replayPlan: {
            steps: [
              {
                stepId: `step_authz_${idDigest}`,
                sourceExchangeId: source.exchangeId,
                actor: attacker.name,
                mutations: [],
              },
            ],
            proofCondition: { type: 'body_contains', marker },
          },
        };
        candidates.push({
          boundaryKey: [source.routeSignature, attacker.name].join('\0'),
          digest: idDigest,
          hypothesis,
          task,
          visibilityRank: victimResource.visibility === 'private' ? 0 : 1,
          methodRank: source.method.toUpperCase() === 'GET' ? 0 : 1,
          markerLength: marker.length,
          resourceId: victimResource.resourceId,
        });
      }
    }
  }

  candidates.sort(candidateOrder);
  const selected: AttackCandidate[] = [];
  const selectedBoundaries = new Set<string>();
  for (const candidate of candidates) {
    if (selectedBoundaries.has(candidate.boundaryKey)) continue;
    selectedBoundaries.add(candidate.boundaryKey);
    selected.push(candidate);
    if (selected.length === boundedLimit) break;
  }

  return {
    hypotheses: selected.map(({ hypothesis }) => hypothesis),
    tasks: selected.map(({ task }) => task),
  };
}
