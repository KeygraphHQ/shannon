// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { containsCredentialSyntax } from '../ai/sensitive-redaction.js';
import type {
  BlackboxActionResult,
  BlackboxResource,
  BlackboxSnapshot,
  CandidateProof,
  DeterministicProofObservation,
  EvidenceRef,
  NormalizedExchange,
  ProofCondition,
  VerifiedBlackboxFinding,
} from '../types/blackbox.js';
import { normalizeTargetOrigin } from './scope-guard.js';

const SHA256_DIGEST = /^[a-f0-9]{64}$/;
const SPECULATIVE_LANGUAGE =
  /\b(?:may|might|possibly|potential(?:ly)?|appears?|seems?|theoretical(?:ly)?|could\s+lead)\b/i;
const GENERIC_INFORMATION_EFFECT =
  /^(?:(?:(?:some|sensitive|private|confidential)\s+)?(?:information|data|details|metadata)(?:(?:\s+(?:was|were|is|are))?\s+(?:exposed|disclosed|revealed|visible|returned)|\s+(?:exposure|disclosure|leak(?:age)?))|(?:exposure|disclosure|leak(?:age)?)\s+of\s+(?:(?:some|sensitive|private|confidential)\s+)?(?:information|data|details|metadata))\.?$/i;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new Error('Proof values must be finite JSON values');
      return JSON.stringify(value);
    case 'string':
      return JSON.stringify(value);
    case 'object':
      if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
      return `{${Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
        .join(',')}}`;
    default:
      throw new Error('Proof values must be JSON serializable');
  }
}

function proofDigest(condition: ProofCondition): string {
  switch (condition.type) {
    case 'body_contains':
    case 'persistent_state':
      return sha256(condition.marker);
    case 'json_pointer_equals':
      return sha256(canonicalJson(condition.value));
  }
}

function uniqueIndex<T>(records: readonly T[], idOf: (record: T) => string): Map<string, T> | null {
  const result = new Map<string, T>();
  for (const record of records) {
    const id = idOf(record);
    if (result.has(id)) return null;
    result.set(id, record);
  }
  return result;
}

function exactArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function decodedPathSegments(pathname: string): ReadonlySet<string> {
  const segments = new Set<string>();
  for (const segment of pathname.split('/')) {
    if (segment.length === 0) continue;
    try {
      segments.add(decodeURIComponent(segment));
    } catch {
      segments.add(segment);
    }
  }
  return segments;
}

function groundedObjectReferences(exchange: NormalizedExchange): ReadonlySet<string> {
  return new Set([...exchange.candidateObjectReferences, ...decodedPathSegments(exchange.path)]);
}

function groundsAnyObjectReference(exchange: NormalizedExchange, references: readonly string[]): boolean {
  const grounded = groundedObjectReferences(exchange);
  return references.some((reference) => grounded.has(reference));
}

function targetExchange(
  exchanges: ReadonlyMap<string, NormalizedExchange>,
  exchangeId: string,
  targetOrigin: string,
): NormalizedExchange | null {
  const exchange = exchanges.get(exchangeId);
  return exchange?.origin === targetOrigin ? exchange : null;
}

function evidenceExists(snapshot: BlackboxSnapshot, reference: EvidenceRef, targetOrigin: string): boolean {
  switch (reference.kind) {
    case 'exchange':
      return snapshot.exchanges.some(
        ({ exchangeId, origin }) => exchangeId === reference.id && origin === targetOrigin,
      );
    case 'resource':
      return snapshot.resources.some(({ resourceId }) => resourceId === reference.id);
    case 'transition':
      return snapshot.transitions.some(({ transitionId }) => transitionId === reference.id);
    case 'action':
      return snapshot.actions.some(({ actionId }) => actionId === reference.id);
    case 'proof':
      return snapshot.candidateProofs.some(({ candidateId }) => candidateId === reference.id);
  }
}

function safeImpactText(value: string): boolean {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim() || /[\r\n]/.test(value)) return false;
  if (SPECULATIVE_LANGUAGE.test(value)) return false;
  return !containsCredentialSyntax(value);
}

function safeImpact(demonstratedAction: string, concreteEffect: string, preconditions: readonly string[]): boolean {
  if (!safeImpactText(demonstratedAction) || !safeImpactText(concreteEffect)) return false;
  if (/^could\b/i.test(demonstratedAction) || GENERIC_INFORMATION_EFFECT.test(concreteEffect)) return false;
  return preconditions.every((precondition) => safeImpactText(precondition));
}

function validObservation(
  observation: DeterministicProofObservation | null,
  condition: ProofCondition,
  baselineExchangeId: string,
  baselinePassed: boolean,
  finalExchangeId: string,
): observation is DeterministicProofObservation {
  if (!observation?.passed || observation.verificationExchangeId !== finalExchangeId) return false;
  if (observation.baselineExchangeId !== baselineExchangeId || observation.baselinePassed !== baselinePassed) {
    return false;
  }
  if (
    !observation.controlExchangeIds ||
    observation.controlPassed !== false ||
    new Set(observation.controlExchangeIds).size !== observation.controlExchangeIds.length
  ) {
    return false;
  }
  if (
    typeof observation.proofSourceRequestDigest !== 'string' ||
    typeof observation.proofSentRequestDigest !== 'string' ||
    !SHA256_DIGEST.test(observation.proofSourceRequestDigest) ||
    observation.proofSourceRequestDigest !== observation.proofSentRequestDigest
  ) {
    return false;
  }
  if (!isDeepStrictEqual(observation.condition, condition) || observation.observedTransitionId !== null) return false;
  try {
    return (
      typeof observation.observedMarkerDigest === 'string' &&
      SHA256_DIGEST.test(observation.observedMarkerDigest) &&
      observation.observedMarkerDigest === proofDigest(condition)
    );
  } catch {
    return false;
  }
}

function validControlEvidence(
  snapshot: BlackboxSnapshot,
  observation: DeterministicProofObservation,
  condition: ProofCondition,
  baseline: NormalizedExchange,
  exchanges: ReadonlyMap<string, NormalizedExchange>,
  resources: ReadonlyMap<string, BlackboxResource>,
  victimResourceId: string,
  requirePeerControl: boolean,
  targetOrigin: string,
): boolean {
  const controlIds = observation.controlExchangeIds;
  if (!controlIds) return false;
  if (condition.type === 'persistent_state') return controlIds.length === 0;
  if (controlIds.length === 0) return false;
  const victimResource = resources.get(victimResourceId);
  const baselineReferences = new Set([
    ...baseline.candidateObjectReferences,
    ...(victimResource?.objectReferences ?? []),
    ...decodedPathSegments(baseline.path),
  ]);
  if (requirePeerControl && baselineReferences.size === 0) return false;
  const controls = controlIds.map((exchangeId) => targetExchange(exchanges, exchangeId, targetOrigin));
  if (
    !controls.every(
      (control) =>
        control !== null &&
        control.exchangeId !== baseline.exchangeId &&
        control.routeSignature === baseline.routeSignature &&
        control.identity !== baseline.identity &&
        control.provenance.actor === 'blackbox-recon' &&
        control.responseStatus >= 100 &&
        control.responseStatus < 600,
    )
  ) {
    return false;
  }
  if (!requirePeerControl) return true;
  return controls.some((control) => {
    if (!control || control.responseStatus < 200 || control.responseStatus >= 300) return false;
    const groundedReferences = groundedObjectReferences(control);
    return [...resources.values()].some((resource) => {
      const peerOnlyReferences = resource.objectReferences.filter((reference) => !baselineReferences.has(reference));
      return (
        resource.resourceId !== victimResourceId &&
        resource.ownerIdentity === control.identity &&
        (resource.visibility === 'private' || resource.visibility === 'role-scoped') &&
        resource.provenance.actor === 'blackbox-recon' &&
        peerOnlyReferences.length > 0 &&
        peerOnlyReferences.some((reference) => groundedReferences.has(reference)) &&
        resource.evidence.some(({ id, kind }) => id === control.exchangeId && kind === 'exchange') &&
        resource.evidence.every((reference) => evidenceExists(snapshot, reference, targetOrigin))
      );
    });
  });
}

function requiresPeerOwnershipControl(
  snapshot: BlackboxSnapshot,
  candidate: CandidateProof,
  resource: BlackboxResource,
): boolean {
  if (resource.visibility !== 'private' && resource.visibility !== 'role-scoped') return false;
  if (candidate.attackerIdentity === 'anonymous') return resource.visibility === 'private';
  const victimRole = snapshot.identities.find(({ name }) => name === candidate.victimIdentity)?.role;
  const attackerRole = snapshot.identities.find(({ name }) => name === candidate.attackerIdentity)?.role;
  return (
    candidate.attackerIdentity !== candidate.victimIdentity &&
    victimRole !== undefined &&
    attackerRole !== undefined &&
    victimRole === attackerRole
  );
}

/**
 * Validate the control evidence attached to an action candidate before it is promoted.
 * Persistent-state proofs intentionally remain valid with no controls.
 */
export function hasValidBlackboxControlEvidence(
  snapshot: BlackboxSnapshot,
  candidate: CandidateProof,
  action: BlackboxActionResult,
  targetOrigin: string,
): boolean {
  const normalizedOrigin = normalizeTargetOrigin(targetOrigin);
  if (snapshot.targetOrigin !== normalizedOrigin || !action.observation) return false;
  const exchanges = uniqueIndex(snapshot.exchanges, ({ exchangeId }) => exchangeId);
  const resources = uniqueIndex(snapshot.resources, ({ resourceId }) => resourceId);
  const hypothesis = snapshot.hypotheses.find(({ hypothesisId }) => hypothesisId === candidate.hypothesisId);
  const resource = resources?.get(candidate.victimResourceId);
  const baseline = exchanges && targetExchange(exchanges, candidate.baselineExchangeId, normalizedOrigin);
  if (!exchanges || !resources || !hypothesis || !resource || !baseline) return false;
  return validControlEvidence(
    snapshot,
    action.observation,
    action.sequence.proofCondition,
    baseline,
    exchanges,
    resources,
    candidate.victimResourceId,
    requiresPeerOwnershipControl(snapshot, candidate, resource),
    normalizedOrigin,
  );
}

function expectedReplayActors(
  action: BlackboxActionResult,
  exchanges: ReadonlyMap<string, NormalizedExchange>,
  targetOrigin: string,
): readonly (string | 'anonymous')[] | null {
  const actors: (string | 'anonymous')[] = action.sequence.steps.map(({ actor }) => actor);
  if (action.sequence.proofCondition.type === 'persistent_state') {
    const source = targetExchange(exchanges, action.sequence.proofCondition.verificationSourceExchangeId, targetOrigin);
    if (!source) return null;
    actors.unshift(source.identity);
    actors.push(source.identity);
  }
  return actors;
}

function replayExchanges(
  exchangeIds: readonly string[],
  expectedActors: readonly (string | 'anonymous')[],
  exchanges: ReadonlyMap<string, NormalizedExchange>,
  targetOrigin: string,
  provenanceActor: 'blackbox-action' | 'blackbox-verifier',
  provenanceTaskId: string,
): readonly NormalizedExchange[] | null {
  if (exchangeIds.length !== expectedActors.length || new Set(exchangeIds).size !== exchangeIds.length) return null;
  const result: NormalizedExchange[] = [];
  for (const [index, exchangeId] of exchangeIds.entries()) {
    const exchange = targetExchange(exchanges, exchangeId, targetOrigin);
    if (
      !exchange ||
      exchange.identity !== expectedActors[index] ||
      exchange.provenance.actor !== provenanceActor ||
      exchange.provenance.taskId !== provenanceTaskId
    ) {
      return null;
    }
    result.push(exchange);
  }
  return result;
}

function validFreshStates(
  snapshot: BlackboxSnapshot,
  verificationId: string,
  expectedActors: readonly (string | 'anonymous')[],
  refs: readonly { readonly identity: string; readonly stateRef: string }[],
): boolean {
  const required = [...new Set(expectedActors.filter((identity) => identity !== 'anonymous'))].sort();
  const identities = refs.map(({ identity }) => identity).sort();
  if (!exactArray(identities, required)) return false;
  if (new Set(refs.map(({ stateRef }) => stateRef)).size !== refs.length) return false;
  const captured = new Set(snapshot.identities.flatMap(({ stateRef }) => (stateRef === null ? [] : [stateRef])));
  return refs.every(({ identity, stateRef }) => {
    const expected = `.shannon/blackbox/verification-runs/${verificationId}/.shannon/blackbox/identities/${identity}/storage-state.json`;
    return stateRef === expected && !captured.has(stateRef);
  });
}

/**
 * Promote only host-linked, independently replayed impact evidence. Invalid
 * candidates remain blackboard evidence but never become reportable findings.
 */
export function collectVerifiedFindings(
  snapshot: BlackboxSnapshot,
  targetOrigin: string,
): readonly VerifiedBlackboxFinding[] {
  const normalizedOrigin = normalizeTargetOrigin(targetOrigin);
  if (snapshot.targetOrigin !== normalizedOrigin) return [];

  const exchanges = uniqueIndex(snapshot.exchanges, ({ exchangeId }) => exchangeId);
  const resources = uniqueIndex(snapshot.resources, ({ resourceId }) => resourceId);
  const hypotheses = uniqueIndex(snapshot.hypotheses, ({ hypothesisId }) => hypothesisId);
  const actions = uniqueIndex(snapshot.actions, ({ actionId }) => actionId);
  const tasks = uniqueIndex(snapshot.tasks, ({ taskId }) => taskId);
  const candidates = uniqueIndex(snapshot.candidateProofs, ({ candidateId }) => candidateId);
  const verificationsById = uniqueIndex(snapshot.verifications, ({ verificationId }) => verificationId);
  const identities = uniqueIndex(snapshot.identities, ({ name }) => name);
  if (
    !exchanges ||
    !resources ||
    !hypotheses ||
    !actions ||
    !tasks ||
    !candidates ||
    !verificationsById ||
    !identities
  ) {
    return [];
  }

  const findings: VerifiedBlackboxFinding[] = [];
  for (const candidate of candidates.values()) {
    const hypothesis = hypotheses.get(candidate.hypothesisId);
    const resource = resources.get(candidate.victimResourceId);
    const baseline = targetExchange(exchanges, candidate.baselineExchangeId, normalizedOrigin);
    const action = actions.get(candidate.actionId);
    const task = tasks.get(candidate.actionId);
    const verifications = snapshot.verifications.filter(({ candidateId }) => candidateId === candidate.candidateId);
    if (
      !hypothesis ||
      hypothesis.status !== 'verified' ||
      !hypothesis.evidence.every((reference) => evidenceExists(snapshot, reference, normalizedOrigin)) ||
      !resource ||
      !baseline ||
      !action ||
      !task
    ) {
      continue;
    }
    if (verifications.length !== 1) continue;
    const verification = verifications[0];
    if (!verification || verification.verdict !== 'verified' || verification.failureReason !== null) continue;

    if (
      candidate.victimIdentity === 'anonymous' ||
      candidate.attackerIdentity === candidate.victimIdentity ||
      !snapshot.identities.some(({ name, authenticated }) => name === candidate.victimIdentity && authenticated) ||
      (candidate.attackerIdentity !== 'anonymous' &&
        !snapshot.identities.some(({ name, authenticated }) => name === candidate.attackerIdentity && authenticated))
    ) {
      continue;
    }
    if (
      resource.ownerIdentity !== candidate.victimIdentity ||
      (resource.visibility !== 'private' && resource.visibility !== 'role-scoped') ||
      baseline.identity !== candidate.victimIdentity ||
      baseline.provenance.actor !== 'blackbox-recon' ||
      resource.provenance.actor !== 'blackbox-recon' ||
      !resource.evidence.some(({ id, kind }) => id === baseline.exchangeId && kind === 'exchange') ||
      (resource.objectReferences.length > 0 && !groundsAnyObjectReference(baseline, resource.objectReferences)) ||
      !resource.evidence.every((reference) => evidenceExists(snapshot, reference, normalizedOrigin))
    ) {
      continue;
    }

    const approvedPlan = { steps: action.sequence.steps, proofCondition: action.sequence.proofCondition };
    if (
      task.kind !== 'action' ||
      task.status !== 'completed' ||
      task.hypothesisId !== candidate.hypothesisId ||
      !task.replayPlan ||
      !isDeepStrictEqual(task.replayPlan, approvedPlan) ||
      !task.evidence.some(({ id, kind }) => id === baseline.exchangeId && kind === 'exchange') ||
      !task.evidence.every((reference) => evidenceExists(snapshot, reference, normalizedOrigin)) ||
      action.actionId !== action.sequence.actionId ||
      action.hypothesisId !== candidate.hypothesisId ||
      action.status !== 'completed' ||
      action.provenance.actor !== 'blackbox-action' ||
      action.provenance.taskId !== action.actionId ||
      candidate.provenance.actor !== 'blackbox-action' ||
      candidate.provenance.taskId !== action.actionId ||
      !action.sequence.steps.every(
        ({ sourceExchangeId, actor }) =>
          targetExchange(exchanges, sourceExchangeId, normalizedOrigin) !== null &&
          (actor === 'anonymous' || identities.get(actor)?.authenticated === true),
      ) ||
      !action.sequence.steps.some(
        ({ sourceExchangeId, actor }) =>
          sourceExchangeId === baseline.exchangeId && actor === candidate.attackerIdentity,
      )
    ) {
      continue;
    }

    const expectedActors = expectedReplayActors(action, exchanges, normalizedOrigin);
    if (!expectedActors) continue;
    const attackExchanges = replayExchanges(
      action.exchangeIds,
      expectedActors,
      exchanges,
      normalizedOrigin,
      'blackbox-action',
      action.actionId,
    );
    const verificationExchanges = replayExchanges(
      verification.replayExchangeIds,
      expectedActors,
      exchanges,
      normalizedOrigin,
      'blackbox-verifier',
      verification.verificationId,
    );
    if (!attackExchanges || !verificationExchanges || attackExchanges.length === 0) continue;
    if (action.exchangeIds.some((exchangeId) => verification.replayExchangeIds.includes(exchangeId))) continue;
    if (
      !attackExchanges.every(
        (exchange, index) => exchange.routeSignature === verificationExchanges[index]?.routeSignature,
      )
    ) {
      continue;
    }

    const actionProofExchangeId = action.exchangeIds.at(-1);
    const verificationProofExchangeId = verification.replayExchangeIds.at(-1);
    if (!actionProofExchangeId || !verificationProofExchangeId) continue;
    const persistentProof = action.sequence.proofCondition.type === 'persistent_state';
    const proofSourceId = persistentProof
      ? action.sequence.proofCondition.verificationSourceExchangeId
      : candidate.baselineExchangeId;
    const proofSource = targetExchange(exchanges, proofSourceId, normalizedOrigin);
    const actionProofExchange = attackExchanges.at(-1);
    const verificationProofExchange = verificationExchanges.at(-1);
    const actionProofBaseline = persistentProof ? attackExchanges[0] : proofSource;
    const verificationProofBaseline = persistentProof ? verificationExchanges[0] : proofSource;
    const explicitImpactStep = action.sequence.steps.at(-1);
    if (
      !proofSource ||
      !actionProofBaseline ||
      !verificationProofBaseline ||
      !actionProofExchange ||
      !verificationProofExchange ||
      !explicitImpactStep ||
      proofSource.responseStatus < 200 ||
      proofSource.responseStatus >= 300 ||
      actionProofBaseline.responseStatus < 200 ||
      actionProofBaseline.responseStatus >= 300 ||
      verificationProofBaseline.responseStatus < 200 ||
      verificationProofBaseline.responseStatus >= 300 ||
      actionProofExchange.responseStatus < 200 ||
      actionProofExchange.responseStatus >= 300 ||
      verificationProofExchange.responseStatus < 200 ||
      verificationProofExchange.responseStatus >= 300 ||
      (!persistentProof &&
        (explicitImpactStep.actor !== candidate.attackerIdentity ||
          explicitImpactStep.sourceExchangeId !== candidate.baselineExchangeId ||
          actionProofExchange.identity !== candidate.attackerIdentity ||
          verificationProofExchange.identity !== candidate.attackerIdentity ||
          actionProofExchange.routeSignature !== baseline.routeSignature ||
          verificationProofExchange.routeSignature !== baseline.routeSignature ||
          (resource.objectReferences.length > 0 &&
            !groundsAnyObjectReference(actionProofExchange, resource.objectReferences)) ||
          (resource.objectReferences.length > 0 &&
            !groundsAnyObjectReference(verificationProofExchange, resource.objectReferences)))) ||
      (persistentProof &&
        (proofSource.identity !== candidate.victimIdentity ||
          action.sequence.steps.some(({ actor }) => actor !== candidate.attackerIdentity) ||
          explicitImpactStep.actor !== candidate.attackerIdentity ||
          actionProofExchange.responseFingerprint === actionProofBaseline.responseFingerprint ||
          verificationProofExchange.responseFingerprint === verificationProofBaseline.responseFingerprint)) ||
      candidate.verificationSourceExchangeId !== actionProofExchangeId ||
      !validObservation(
        action.observation,
        action.sequence.proofCondition,
        actionProofBaseline.exchangeId,
        !persistentProof,
        actionProofExchangeId,
      ) ||
      !validObservation(
        verification.observation,
        action.sequence.proofCondition,
        verificationProofBaseline.exchangeId,
        !persistentProof,
        verificationProofExchangeId,
      ) ||
      !hasValidBlackboxControlEvidence(snapshot, candidate, action, normalizedOrigin) ||
      !validControlEvidence(
        snapshot,
        verification.observation,
        action.sequence.proofCondition,
        verificationProofBaseline,
        exchanges,
        resources,
        candidate.victimResourceId,
        requiresPeerOwnershipControl(snapshot, candidate, resource),
        normalizedOrigin,
      ) ||
      !exactArray(action.observation.controlExchangeIds ?? [], verification.observation.controlExchangeIds ?? []) ||
      action.observation.observedMarkerDigest !== verification.observation.observedMarkerDigest
    ) {
      continue;
    }

    if (
      !exactArray(verification.replayActionIds, [action.actionId]) ||
      !validFreshStates(snapshot, verification.verificationId, expectedActors, verification.freshStateRefs) ||
      // NOTE: the activity layer binds this from the candidate proof, so a divergence here means
      // the snapshot was not built by that path. The promotion still refuses to guess between them.
      verification.affectedParty !== candidate.affectedParty ||
      !safeImpact(candidate.demonstratedAction, candidate.concreteEffect, candidate.preconditions) ||
      !safeImpact(verification.demonstratedAction, verification.concreteEffect, candidate.preconditions)
    ) {
      continue;
    }

    const findingId = `finding_${sha256(`${candidate.candidateId}\0${verification.verificationId}\0${action.actionId}`).slice(0, 24)}`;
    findings.push({
      findingId,
      hypothesisId: candidate.hypothesisId,
      victimIdentity: candidate.victimIdentity,
      attackerIdentity: candidate.attackerIdentity,
      baselineExchangeId: candidate.baselineExchangeId,
      attackExchangeIds: [...action.exchangeIds],
      verificationExchangeIds: [...verification.replayExchangeIds],
      replaySequence: structuredClone(action.sequence),
      demonstratedAction: verification.demonstratedAction,
      concreteEffect: verification.concreteEffect,
      affectedParty: verification.affectedParty,
      impactStatement: `As an attacker, I could ${verification.demonstratedAction}, causing ${verification.concreteEffect} to ${verification.affectedParty}.`,
      preconditions: [...candidate.preconditions],
      verifierResultId: verification.verificationId,
    });
  }

  return findings.sort((left, right) => left.findingId.localeCompare(right.findingId));
}
