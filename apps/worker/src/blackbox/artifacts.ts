// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { deliverablesDir } from '../paths.js';
import type {
  BlackboxRunStatus,
  BlackboxSnapshot,
  EvidenceRef,
  NormalizedExchange,
  VerifiedBlackboxFinding,
} from '../types/blackbox.js';
import { atomicWrite, ensureDirectory } from '../utils/file-io.js';

export const BLACKBOX_ARTIFACT_NAMES = [
  'traffic_inventory.json',
  'blackbox_blackboard.json',
  'blackbox_authz_findings.json',
  'blackbox_authz_evidence.md',
] as const;

const BLACKBOX_ARTIFACT_PUBLICATION_ORDER = [
  'traffic_inventory.json',
  'blackbox_authz_findings.json',
  'blackbox_authz_evidence.md',
  'blackbox_blackboard.json',
] as const satisfies readonly (typeof BLACKBOX_ARTIFACT_NAMES)[number][];

export type BlackboxArtifactName = (typeof BLACKBOX_ARTIFACT_NAMES)[number];
export type RenderedBlackboxArtifacts = Readonly<Record<BlackboxArtifactName, string>>;

export interface RenderBlackboxArtifactsInput {
  readonly snapshot: BlackboxSnapshot;
  readonly findings: readonly VerifiedBlackboxFinding[];
  readonly status: Exclude<BlackboxRunStatus, 'running'>;
  readonly failure: string | null;
}

export interface BlackboxArtifactIo {
  ensureDirectory(directoryPath: string): Promise<void>;
  atomicWrite(filePath: string, data: string): Promise<void>;
}

const DEFAULT_IO: BlackboxArtifactIo = { ensureDirectory, atomicWrite };
const NO_FINDINGS =
  'No replay-verified findings were produced. This run is not a clean assessment of unexercised routes or workflows.';

function resolveBlackboxDeliverables(
  repoPath: string,
  reportedArtifactNames: readonly BlackboxArtifactName[],
): readonly { readonly name: BlackboxArtifactName; readonly source: string }[] {
  if (!isDeepStrictEqual(reportedArtifactNames, BLACKBOX_ARTIFACT_NAMES)) {
    throw new Error('Black-box workflow returned an unexpected artifact manifest');
  }
  const sourceDirectory = deliverablesDir(repoPath);
  return BLACKBOX_ARTIFACT_NAMES.map((name) => {
    const source = path.join(sourceDirectory, name);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(source);
    } catch {
      throw new Error(`Missing black-box artifact: ${name}`);
    }
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`Black-box artifact must be a regular file: ${name}`);
    }
    return { name, source };
  });
}

export function validateBlackboxDeliverables(
  repoPath: string,
  reportedArtifactNames: readonly BlackboxArtifactName[] = BLACKBOX_ARTIFACT_NAMES,
): void {
  resolveBlackboxDeliverables(repoPath, reportedArtifactNames);
}

export function copyBlackboxDeliverables(
  repoPath: string,
  outputPath: string,
  reportedArtifactNames: readonly BlackboxArtifactName[] = BLACKBOX_ARTIFACT_NAMES,
): void {
  const copies = resolveBlackboxDeliverables(repoPath, reportedArtifactNames);

  fs.mkdirSync(outputPath, { recursive: true });
  for (const { name, source } of copies) fs.copyFileSync(source, path.join(outputPath, name));
}

function compareEvidence(left: EvidenceRef, right: EvidenceRef): number {
  return left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id);
}

function projectExchange(exchange: NormalizedExchange): Omit<NormalizedExchange, 'rawRecordRef'> {
  const { rawRecordRef: _rawRecordRef, ...projection } = exchange;
  return projection;
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function inlineJson(value: unknown): string {
  return JSON.stringify(value);
}

function inventory(snapshot: BlackboxSnapshot): readonly Omit<NormalizedExchange, 'rawRecordRef'>[] {
  return [...snapshot.exchanges]
    .sort(
      (left, right) =>
        left.routeSignature.localeCompare(right.routeSignature) ||
        left.identity.localeCompare(right.identity) ||
        left.captureSequence - right.captureSequence ||
        left.exchangeId.localeCompare(right.exchangeId),
    )
    .map(projectExchange);
}

function blackboardProjection(
  snapshot: BlackboxSnapshot,
  status: Exclude<BlackboxRunStatus, 'running'>,
  failure: string | null,
): object {
  return {
    schemaVersion: snapshot.schemaVersion,
    revision: snapshot.revision + 1,
    targetOrigin: snapshot.targetOrigin,
    runStatus: status,
    failure,
    identities: [...snapshot.identities]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(({ name, role, authenticated }) => ({ name, role, authenticated })),
    exchanges: [...snapshot.exchanges]
      .sort((left, right) => left.exchangeId.localeCompare(right.exchangeId))
      .map(projectExchange),
    resources: [...snapshot.resources]
      .sort((left, right) => left.resourceId.localeCompare(right.resourceId))
      .map((resource) => ({ ...resource, evidence: [...resource.evidence].sort(compareEvidence) })),
    transitions: [...snapshot.transitions].sort((left, right) => left.transitionId.localeCompare(right.transitionId)),
    hypotheses: [...snapshot.hypotheses]
      .sort((left, right) => left.hypothesisId.localeCompare(right.hypothesisId))
      .map((hypothesis) => ({ ...hypothesis, evidence: [...hypothesis.evidence].sort(compareEvidence) })),
    actions: [...snapshot.actions].sort((left, right) => left.actionId.localeCompare(right.actionId)),
    candidateProofs: [...snapshot.candidateProofs].sort((left, right) =>
      left.candidateId.localeCompare(right.candidateId),
    ),
    verifications: [...snapshot.verifications]
      .sort((left, right) => left.verificationId.localeCompare(right.verificationId))
      .map((verification) => ({
        ...verification,
        freshStateRefs: verification.freshStateRefs
          .map(({ identity }) => ({ identity, fresh: true as const }))
          .sort((left, right) => left.identity.localeCompare(right.identity)),
      })),
    tasks: [...snapshot.tasks]
      .sort((left, right) => left.taskId.localeCompare(right.taskId))
      .map((task) => ({ ...task, evidence: [...task.evidence].sort(compareEvidence) })),
    rejectedTasks: [...snapshot.rejectedTasks].sort((left, right) => left.task.taskId.localeCompare(right.task.taskId)),
  };
}

function exchangeLine(exchange: NormalizedExchange | undefined): string {
  if (!exchange) return 'missing normalized evidence';
  return `HTTP ${exchange.responseStatus}; fingerprint ${exchange.responseFingerprint}; ${exchange.method} ${exchange.path} as ${exchange.identity}`;
}

function evidenceMarkdown(
  snapshot: BlackboxSnapshot,
  findings: readonly VerifiedBlackboxFinding[],
  status: Exclude<BlackboxRunStatus, 'running'>,
  failure: string | null,
): string {
  const lines = ['# Black-box authorization evidence', '', `Status: ${status}`, ''];
  if (failure) lines.push(`Failure: ${failure}`, '');
  if (status !== 'complete') {
    lines.push('The run was incomplete. No clean-assessment conclusion was produced.', '');
  } else if (findings.length === 0) {
    lines.push(NO_FINDINGS, '');
  }

  const exchanges = new Map(snapshot.exchanges.map((exchange) => [exchange.exchangeId, exchange]));
  for (const finding of findings) {
    lines.push(
      `## ${finding.findingId}`,
      '',
      `Impact: ${finding.impactStatement}`,
      `Victim: ${finding.victimIdentity}`,
      `Attacker: ${finding.attackerIdentity}`,
      `Verifier result: ${finding.verifierResultId}`,
      '',
      'Replay sequence:',
      '',
    );
    for (const [index, step] of finding.replaySequence.steps.entries()) {
      lines.push(
        `${index + 1}. ${step.stepId}: ${step.actor} replays ${step.sourceExchangeId}; mutations ${inlineJson(step.mutations)}`,
      );
    }
    lines.push(`Proof: ${inlineJson(finding.replaySequence.proofCondition)}`);

    const baseline = exchanges.get(finding.baselineExchangeId);
    lines.push('', 'Normalized response comparisons:', '');
    for (const exchangeId of finding.attackExchangeIds) {
      lines.push(
        `- ${finding.baselineExchangeId} (${exchangeLine(baseline)}) -> ${exchangeId} (${exchangeLine(exchanges.get(exchangeId))})`,
      );
    }
    for (const exchangeId of finding.verificationExchangeIds) {
      lines.push(
        `- ${finding.baselineExchangeId} (${exchangeLine(baseline)}) -> ${exchangeId} (${exchangeLine(exchanges.get(exchangeId))})`,
      );
    }
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

export function renderBlackboxArtifacts(input: RenderBlackboxArtifactsInput): RenderedBlackboxArtifacts {
  const findings = [...input.findings].sort((left, right) => left.findingId.localeCompare(right.findingId));
  return {
    'traffic_inventory.json': json(inventory(input.snapshot)),
    'blackbox_blackboard.json': json(blackboardProjection(input.snapshot, input.status, input.failure)),
    'blackbox_authz_findings.json': json(findings),
    'blackbox_authz_evidence.md': evidenceMarkdown(input.snapshot, findings, input.status, input.failure),
  };
}

export async function publishBlackboxArtifacts(
  repoPath: string,
  artifacts: RenderedBlackboxArtifacts,
  io: BlackboxArtifactIo = DEFAULT_IO,
): Promise<readonly BlackboxArtifactName[]> {
  const deliverablesDirectory = path.resolve(repoPath, '.shannon', 'deliverables');
  await io.ensureDirectory(deliverablesDirectory);
  // The blackboard projection is the set's commit marker. Write it only after
  // every companion artifact has been atomically replaced so resume cannot
  // accept a partially published terminal set.
  for (const name of BLACKBOX_ARTIFACT_PUBLICATION_ORDER) {
    await io.atomicWrite(path.join(deliverablesDirectory, name), artifacts[name]);
  }
  return [...BLACKBOX_ARTIFACT_NAMES];
}
