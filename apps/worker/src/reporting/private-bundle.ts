// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { isDeepStrictEqual } from 'node:util';
import { type BlackboxRunSummaryInput, renderBlackboxRunSummary } from '../blackbox/run-summary.js';
import { type BundleIssue, type JsonRecord, PRIVATE_FILES, type PrivateBundleData } from './bundle-types.js';

type Predicate = (value: unknown) => boolean;
const record = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text: Predicate = (value) => typeof value === 'string';
const id: Predicate = (value) => typeof value === 'string' && value.length > 0;
const bool: Predicate = (value) => typeof value === 'boolean';
const integer: Predicate = (value) => Number.isSafeInteger(value) && (value as number) >= 0;
const oneOf =
  (...values: readonly unknown[]): Predicate =>
  (value) =>
    values.includes(value);
const nullable =
  (predicate: Predicate): Predicate =>
  (value) =>
    value === null || predicate(value);
const optional =
  (predicate: Predicate): Predicate =>
  (value) =>
    value === undefined || predicate(value);
const array =
  (predicate: Predicate): Predicate =>
  (value) =>
    Array.isArray(value) && value.every(predicate);
const shape =
  (fields: Readonly<Record<string, Predicate>>): Predicate =>
  (value) =>
    record(value) && Object.entries(fields).every(([field, predicate]) => predicate(value[field]));
const strings = array(text);
const ids = array(id);
const affectedParty = oneOf('customer', 'application', 'users');
const provenance = shape({
  actor: oneOf('blackbox-recon', 'blackbox-analysis', 'blackbox-action', 'blackbox-verifier', 'orchestrator'),
  taskId: id,
  baseRevision: integer,
});
const evidence = array(shape({ kind: oneOf('exchange', 'resource', 'transition', 'action', 'proof'), id }));
const mutation: Predicate = (value) => {
  if (!record(value)) return false;
  switch (value.type) {
    case 'set_path':
      return text(value.path);
    case 'set_query':
    case 'set_header':
    case 'set_form_field':
      return text(value.name) && text(value.value);
    case 'remove_query':
    case 'remove_header':
      return text(value.name);
    case 'set_json_pointer':
      return text(value.pointer) && Object.hasOwn(value, 'value');
    default:
      return false;
  }
};
const condition: Predicate = (value) => {
  if (!record(value)) return false;
  switch (value.type) {
    case 'body_contains':
      return text(value.marker);
    case 'json_pointer_equals':
      return text(value.pointer) && Object.hasOwn(value, 'value');
    case 'persistent_state':
      return id(value.verificationSourceExchangeId) && text(value.marker);
    default:
      return false;
  }
};
const planFields = {
  steps: array(shape({ stepId: id, sourceExchangeId: id, actor: id, mutations: array(mutation) })),
  proofCondition: condition,
};
const replayPlan = shape(planFields);
const sequence = shape({ ...planFields, actionId: id });
const observation = nullable(
  shape({
    condition,
    passed: bool,
    baselineExchangeId: optional(id),
    baselinePassed: optional(bool),
    controlExchangeIds: optional(ids),
    controlPassed: optional(bool),
    proofSourceRequestDigest: optional(text),
    proofSentRequestDigest: optional(text),
    observedMarkerDigest: nullable(text),
    observedTransitionId: nullable(id),
    verificationExchangeId: nullable(id),
  }),
);
const exchange = shape({
  exchangeId: id,
  routeSignature: text,
  identity: id,
  captureSequence: integer,
  method: text,
  origin: text,
  path: text,
  queryKeys: strings,
  bodyShape: text,
  requestContentType: nullable(text),
  responseStatus: integer,
  responseContentType: nullable(text),
  responseFingerprint: text,
  candidateObjectReferences: strings,
  provenance,
});
const task = shape({
  taskId: id,
  kind: oneOf('recon', 'analysis', 'action'),
  objective: text,
  evidence,
  identityLease: nullable(id),
  hypothesisId: nullable(id),
  status: oneOf('pending', 'running', 'completed', 'failed', 'rejected'),
  replayPlan: optional(replayPlan),
});
const verification: Predicate = (value) => {
  if (
    !shape({
      verificationId: id,
      candidateId: id,
      freshStateRefs: array(shape({ identity: id, fresh: oneOf(true) })),
      replayActionIds: ids,
      replayExchangeIds: ids,
      observation,
      failureReason: nullable(text),
      verdict: oneOf('verified', 'disproved', 'blocked'),
    })(value)
  )
    return false;
  const item = value as JsonRecord;
  return (
    item.verdict !== 'verified' ||
    (text(item.demonstratedAction) && text(item.concreteEffect) && affectedParty(item.affectedParty))
  );
};
const collections: Readonly<Record<string, { readonly key: string; readonly valid: Predicate }>> = {
  identities: { key: 'name', valid: shape({ name: id, role: text, authenticated: bool }) },
  exchanges: { key: 'exchangeId', valid: exchange },
  resources: {
    key: 'resourceId',
    valid: shape({
      resourceId: id,
      resourceType: text,
      objectReferences: strings,
      ownerIdentity: nullable(id),
      visibility: oneOf('private', 'role-scoped', 'public', 'unknown'),
      evidence,
      provenance,
    }),
  },
  transitions: {
    key: 'transitionId',
    valid: shape({
      transitionId: id,
      identity: id,
      fromState: text,
      toState: text,
      triggerExchangeId: id,
      captureSequence: integer,
      resourceId: nullable(id),
      provenance,
    }),
  },
  hypotheses: {
    key: 'hypothesisId',
    valid: shape({
      hypothesisId: id,
      kind: oneOf('horizontal', 'vertical', 'workflow'),
      summary: text,
      preconditions: strings,
      attackerCapability: text,
      evidence,
      priority: oneOf('high', 'medium', 'low'),
      status: oneOf('open', 'queued', 'tested', 'verified', 'disproved', 'blocked', 'no_demonstrated_impact'),
      provenance,
    }),
  },
  actions: {
    key: 'actionId',
    valid: shape({
      actionId: id,
      hypothesisId: id,
      sequence,
      status: oneOf('completed', 'needs_fresh_actor_request', 'delivery_unknown', 'failed'),
      exchangeIds: ids,
      observation,
      provenance,
    }),
  },
  candidateProofs: {
    key: 'candidateId',
    valid: shape({
      candidateId: id,
      hypothesisId: id,
      victimIdentity: id,
      attackerIdentity: id,
      victimResourceId: id,
      baselineExchangeId: id,
      actionId: id,
      verificationSourceExchangeId: id,
      demonstratedAction: text,
      concreteEffect: text,
      affectedParty,
      preconditions: strings,
      provenance,
    }),
  },
  verifications: { key: 'verificationId', valid: verification },
  tasks: { key: 'taskId', valid: task },
};
const finding = shape({
  findingId: id,
  hypothesisId: id,
  victimIdentity: id,
  attackerIdentity: id,
  baselineExchangeId: id,
  attackExchangeIds: ids,
  verificationExchangeIds: ids,
  replaySequence: sequence,
  demonstratedAction: text,
  concreteEffect: text,
  affectedParty,
  impactStatement: text,
  preconditions: strings,
  verifierResultId: id,
});
const timestamp: Predicate = (value) => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return false;
  return new Date(value).toISOString() === value;
};
const digest: Predicate = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const revision: Predicate = (value) => typeof value === 'string' && /^[0-9a-f]{40,64}$/.test(value);
const termination = nullable(
  shape({
    code: oneOf(
      'completed',
      'limit_reached',
      'uncertain_execution',
      'prerequisite_failed',
      'verification_state_missing',
      'component_error',
      'interrupted',
      'execution_error',
      'unknown',
    ),
    source: oneOf('workflow', 'temporal', 'worker'),
  }),
);
const metadataShape = shape({
  schemaVersion: oneOf(1),
  runId: id,
  historyComplete: bool,
  currentAttemptId: id,
  resultAttemptId: nullable(id),
  attempts: array(
    shape({
      attemptId: id,
      workflowId: id,
      resumedFromAttemptId: nullable(id),
      startedAt: timestamp,
      endedAt: nullable(timestamp),
      configuredModel: nullable(text),
      termination,
      code: shape({ revision: nullable(revision), dirty: nullable(bool), sha256: nullable(digest) }),
    }),
  ),
});

/** Checks passive exported records only. It never replays or promotes a finding. */
export function validatePrivateBundle(files: Readonly<Record<string, string>>): {
  issues: BundleIssue[];
  data?: PrivateBundleData;
} {
  const issues: BundleIssue[] = [];
  const issue = (code: string, file: string, location: string, message: string): void => {
    issues.push({ code, file, location, message });
  };
  const parsed: Record<string, unknown> = {};
  for (const file of PRIVATE_FILES) {
    if (!Object.hasOwn(files, file) || typeof files[file] !== 'string') {
      issue('missing_artifact', file, '', 'A required artifact is missing.');
      continue;
    }
    if (file.endsWith('.json')) {
      try {
        parsed[file] = JSON.parse(files[file] as string);
      } catch {
        issue('invalid_json', file, '', 'An artifact is not valid JSON.');
      }
    }
  }
  if (issues.length > 0) return { issues };
  const inventoryFile = PRIVATE_FILES[0];
  const boardFile = PRIVATE_FILES[1];
  const findingsFile = PRIVATE_FILES[2];
  const markdownFile = PRIVATE_FILES[3];
  const board = parsed[boardFile];
  if (
    !shape({
      schemaVersion: oneOf(1),
      revision: integer,
      targetOrigin: id,
      runStatus: oneOf('complete', 'incomplete', 'failed'),
      failure: nullable(text),
      rejectedTasks: array(shape({ task, reason: text })),
    })(board)
  ) {
    issue('invalid_shape', boardFile, '', 'The blackboard has an unsupported or malformed structure.');
    return { issues };
  }
  const blackboard = board as JsonRecord;
  for (const [name, descriptor] of Object.entries(collections)) {
    if (!array(descriptor.valid)(blackboard[name])) {
      issue('invalid_shape', boardFile, name, 'A collection contains missing or malformed records.');
    }
  }
  if (!array(exchange)(parsed[inventoryFile]))
    issue('invalid_shape', inventoryFile, '', 'The inventory contains missing or malformed records.');
  if (!array(finding)(parsed[findingsFile]))
    issue('invalid_shape', findingsFile, '', 'The findings contain missing or malformed records.');
  if (blackboard.runMetadata !== undefined && !metadataShape(blackboard.runMetadata))
    issue('invalid_provenance', boardFile, 'runMetadata', 'Recorded run provenance has a malformed structure.');
  if (issues.length > 0) return { issues };

  const inventory = parsed[inventoryFile] as JsonRecord[];
  const findings = parsed[findingsFile] as JsonRecord[];
  const markdown = files[markdownFile] as string;
  const indexes = new Map<string, Map<unknown, JsonRecord>>();
  const index = (values: readonly JsonRecord[], key: string, name: string, file: string): Map<unknown, JsonRecord> => {
    const result = new Map<unknown, JsonRecord>();
    for (const [position, item] of values.entries()) {
      if (result.has(item[key]))
        issue('duplicate_id', file, `${name}[${position}]`, 'An authoritative identifier is duplicated.');
      result.set(item[key], item);
    }
    return result;
  };
  for (const [name, descriptor] of Object.entries(collections))
    indexes.set(name, index(blackboard[name] as JsonRecord[], descriptor.key, name, boardFile));
  const inventoryIndex = index(inventory, 'exchangeId', '', inventoryFile);
  index(findings, 'findingId', '', findingsFile);
  const exchanges = indexes.get('exchanges') as Map<unknown, JsonRecord>;
  if (
    inventory.length !== exchanges.size ||
    [...exchanges].some(([exchangeId, item]) => !isDeepStrictEqual(item, inventoryIndex.get(exchangeId)))
  )
    issue('inventory_mismatch', inventoryFile, '', 'Inventory and blackboard exchanges do not match.');
  for (const [position, item] of (blackboard.exchanges as JsonRecord[]).entries()) {
    if (item.origin !== blackboard.targetOrigin)
      issue('origin_mismatch', boardFile, `exchanges[${position}].origin`, 'Recorded origins do not agree.');
  }
  const ref = (value: unknown, collection: string, file: string, location: string, anonymous = false): void => {
    if (value === null || value === undefined || (anonymous && value === 'anonymous')) return;
    if (!indexes.get(collection)?.has(value))
      issue('dangling_reference', file, location, 'A recorded reference has no matching record.');
  };
  const refs = (values: unknown, collection: string, file: string, location: string): void => {
    if (Array.isArray(values))
      values.forEach((value, position) => {
        ref(value, collection, file, `${location}[${position}]`);
      });
  };
  const evidenceRefs = (values: unknown, location: string): void => {
    const kinds: Readonly<Record<string, string>> = {
      exchange: 'exchanges',
      resource: 'resources',
      transition: 'transitions',
      action: 'actions',
      proof: 'candidateProofs',
    };
    for (const [position, item] of (values as JsonRecord[]).entries())
      ref(item.id, kinds[item.kind as string] as string, boardFile, `${location}[${position}].id`);
  };
  const conditionRefs = (value: JsonRecord, file: string, location: string): void => {
    if (value.type === 'persistent_state')
      ref(value.verificationSourceExchangeId, 'exchanges', file, `${location}.verificationSourceExchangeId`);
  };
  const planRefs = (value: JsonRecord, file: string, location: string): void => {
    const seen = new Set<unknown>();
    for (const [position, step] of (value.steps as JsonRecord[]).entries()) {
      if (seen.has(step.stepId))
        issue('duplicate_id', file, `${location}.steps[${position}]`, 'A replay step identifier is duplicated.');
      seen.add(step.stepId);
      ref(step.sourceExchangeId, 'exchanges', file, `${location}.steps[${position}].sourceExchangeId`);
      ref(step.actor, 'identities', file, `${location}.steps[${position}].actor`, true);
    }
    conditionRefs(value.proofCondition as JsonRecord, file, `${location}.proofCondition`);
  };
  const observationRefs = (value: unknown, location: string): void => {
    if (!record(value)) return;
    ref(value.baselineExchangeId, 'exchanges', boardFile, `${location}.baselineExchangeId`);
    refs(value.controlExchangeIds, 'exchanges', boardFile, `${location}.controlExchangeIds`);
    ref(value.observedTransitionId, 'transitions', boardFile, `${location}.observedTransitionId`);
    ref(value.verificationExchangeId, 'exchanges', boardFile, `${location}.verificationExchangeId`);
    conditionRefs(value.condition as JsonRecord, boardFile, `${location}.condition`);
  };
  for (const [name] of Object.entries(collections)) {
    for (const [position, item] of (blackboard[name] as JsonRecord[]).entries()) {
      const location = `${name}[${position}]`;
      if (name === 'exchanges' || name === 'transitions')
        ref(item.identity, 'identities', boardFile, `${location}.identity`, true);
      if (name === 'resources' || name === 'hypotheses' || name === 'tasks')
        evidenceRefs(item.evidence, `${location}.evidence`);
      if (name === 'resources') ref(item.ownerIdentity, 'identities', boardFile, `${location}.ownerIdentity`, true);
      if (name === 'transitions') {
        ref(item.triggerExchangeId, 'exchanges', boardFile, `${location}.triggerExchangeId`);
        ref(item.resourceId, 'resources', boardFile, `${location}.resourceId`);
      }
      if (name === 'actions' || name === 'candidateProofs' || name === 'tasks')
        ref(item.hypothesisId, 'hypotheses', boardFile, `${location}.hypothesisId`);
      if (name === 'actions') {
        const replay = item.sequence as JsonRecord;
        if (replay.actionId !== item.actionId)
          issue(
            'reference_mismatch',
            boardFile,
            `${location}.sequence.actionId`,
            'An action and its sequence disagree.',
          );
        planRefs(replay, boardFile, `${location}.sequence`);
        refs(item.exchangeIds, 'exchanges', boardFile, `${location}.exchangeIds`);
        observationRefs(item.observation, `${location}.observation`);
      }
      if (name === 'candidateProofs') {
        ref(item.victimIdentity, 'identities', boardFile, `${location}.victimIdentity`, true);
        ref(item.attackerIdentity, 'identities', boardFile, `${location}.attackerIdentity`, true);
        ref(item.victimResourceId, 'resources', boardFile, `${location}.victimResourceId`);
        ref(item.baselineExchangeId, 'exchanges', boardFile, `${location}.baselineExchangeId`);
        ref(item.verificationSourceExchangeId, 'exchanges', boardFile, `${location}.verificationSourceExchangeId`);
        ref(item.actionId, 'actions', boardFile, `${location}.actionId`);
      }
      if (name === 'verifications') {
        ref(item.candidateId, 'candidateProofs', boardFile, `${location}.candidateId`);
        refs(item.replayExchangeIds, 'exchanges', boardFile, `${location}.replayExchangeIds`);
        for (const [statePosition, state] of (item.freshStateRefs as JsonRecord[]).entries())
          ref(state.identity, 'identities', boardFile, `${location}.freshStateRefs[${statePosition}].identity`, true);
        // Verifier action IDs and provenance task IDs can be ephemeral, unpersisted identifiers.
        observationRefs(item.observation, `${location}.observation`);
      }
      if (name === 'tasks') {
        ref(item.identityLease, 'identities', boardFile, `${location}.identityLease`, true);
        if (record(item.replayPlan)) planRefs(item.replayPlan, boardFile, `${location}.replayPlan`);
      }
    }
  }
  for (const [position, item] of findings.entries()) {
    const location = `[${position}]`;
    ref(item.hypothesisId, 'hypotheses', findingsFile, `${location}.hypothesisId`);
    ref(item.victimIdentity, 'identities', findingsFile, `${location}.victimIdentity`, true);
    ref(item.attackerIdentity, 'identities', findingsFile, `${location}.attackerIdentity`, true);
    ref(item.baselineExchangeId, 'exchanges', findingsFile, `${location}.baselineExchangeId`);
    refs(item.attackExchangeIds, 'exchanges', findingsFile, `${location}.attackExchangeIds`);
    refs(item.verificationExchangeIds, 'exchanges', findingsFile, `${location}.verificationExchangeIds`);
    ref(item.verifierResultId, 'verifications', findingsFile, `${location}.verifierResultId`);
    const replay = item.replaySequence as JsonRecord;
    planRefs(replay, findingsFile, `${location}.replaySequence`);
    ref(replay.actionId, 'actions', findingsFile, `${location}.replaySequence.actionId`);
    const result = indexes.get('verifications')?.get(item.verifierResultId);
    const candidate = result && indexes.get('candidateProofs')?.get(result.candidateId);
    const action = candidate && indexes.get('actions')?.get(candidate.actionId);
    if (
      result &&
      (result.verdict !== 'verified' ||
        ['demonstratedAction', 'concreteEffect', 'affectedParty'].some((field) => result[field] !== item[field]) ||
        !isDeepStrictEqual(result.replayExchangeIds, item.verificationExchangeIds))
    )
      issue('finding_mismatch', findingsFile, location, 'A finding disagrees with its recorded verifier result.');
    if (
      candidate &&
      (['hypothesisId', 'victimIdentity', 'attackerIdentity', 'baselineExchangeId', 'affectedParty'].some(
        (field) => candidate[field] !== item[field],
      ) ||
        !isDeepStrictEqual(candidate.preconditions, item.preconditions))
    )
      issue('finding_mismatch', findingsFile, location, 'A finding disagrees with its recorded candidate.');
    if (
      action &&
      (!isDeepStrictEqual(action.sequence, replay) || !isDeepStrictEqual(action.exchangeIds, item.attackExchangeIds))
    )
      issue('finding_mismatch', findingsFile, location, 'A finding disagrees with its recorded action.');
  }
  if (record(blackboard.runMetadata)) {
    const metadata = blackboard.runMetadata;
    const attempts = metadata.attempts as JsonRecord[];
    const attemptIndex = index(attempts, 'attemptId', 'runMetadata.attempts', boardFile);
    const parents = new Map<unknown, JsonRecord>();
    for (const [position, attempt] of attempts.entries()) {
      if (parents.has(attempt.resumedFromAttemptId))
        issue(
          'invalid_provenance',
          boardFile,
          `runMetadata.attempts[${position}]`,
          'Attempt lineage branches or has multiple roots.',
        );
      parents.set(attempt.resumedFromAttemptId, attempt);
      if ((attempt.endedAt === null) !== (attempt.termination === null))
        issue(
          'invalid_provenance',
          boardFile,
          `runMetadata.attempts[${position}]`,
          'Attempt ending and termination must be recorded together.',
        );
    }
    const visited = new Set<unknown>();
    let current = parents.get(null);
    let latest: JsonRecord | undefined;
    while (current && !visited.has(current.attemptId)) {
      visited.add(current.attemptId);
      latest = current;
      current = parents.get(current.attemptId);
    }
    if (current || visited.size !== attempts.length || latest?.attemptId !== metadata.currentAttemptId)
      issue(
        'invalid_provenance',
        boardFile,
        'runMetadata',
        'Attempt lineage is missing, cyclic, or inconsistent with the latest attempt.',
      );
    if (metadata.resultAttemptId !== null) {
      const result = attemptIndex.get(metadata.resultAttemptId);
      if (!result || result.endedAt === null || !record(result.termination))
        issue(
          'invalid_provenance',
          boardFile,
          'runMetadata.resultAttemptId',
          'Result attribution lacks a recorded terminal attempt.',
        );
      else if (
        result.termination.source !== 'workflow' ||
        (blackboard.runStatus === 'complete') !== (result.termination.code === 'completed')
      )
        issue(
          'invalid_provenance',
          boardFile,
          'runMetadata.resultAttemptId',
          'Result attribution disagrees with the recorded outcome.',
        );
    }
  }
  const normalizedMarkdown = markdown.replace(/\r\n/g, '\n');
  if (!normalizedMarkdown.startsWith(`# Black-box authorization evidence\n\nStatus: ${blackboard.runStatus}\n`))
    issue('markdown_mismatch', markdownFile, '', 'The evidence heading or status disagrees with the blackboard.');
  if (
    typeof blackboard.failure === 'string' &&
    blackboard.failure.length > 0 &&
    !normalizedMarkdown.includes(`Failure: ${blackboard.failure.replace(/\r\n/g, '\n')}\n`)
  )
    issue('markdown_mismatch', markdownFile, '', 'The evidence report omits the recorded failure.');
  for (const [position, item] of findings.entries()) {
    if (
      !normalizedMarkdown.includes(`## ${item.findingId}\n`) ||
      !normalizedMarkdown.includes(`Verifier result: ${item.verifierResultId}\n`)
    )
      issue(
        'markdown_mismatch',
        markdownFile,
        `findings[${position}]`,
        'The evidence report omits a finding or verifier reference.',
      );
  }
  if (findings.length === 0 && !normalizedMarkdown.includes('No replay-verified findings were produced.'))
    issue('markdown_mismatch', markdownFile, '', 'The evidence report omits the no-findings outcome.');
  if (normalizedMarkdown.includes('## Run summary\n')) {
    const input = {
      ...blackboard,
      status: blackboard.runStatus,
      findingCount: findings.length,
      candidateCount: (blackboard.candidateProofs as JsonRecord[]).length,
      rejectedTaskCount: (blackboard.rejectedTasks as JsonRecord[]).length,
    } as unknown as BlackboxRunSummaryInput;
    if (!normalizedMarkdown.includes(renderBlackboxRunSummary(input)))
      issue(
        'markdown_mismatch',
        markdownFile,
        '',
        'The recorded summary or execution provenance disagrees with the JSON artifacts.',
      );
  } else if (
    blackboard.runMetadata !== undefined ||
    normalizedMarkdown.includes('### Recorded execution provenance\n')
  ) {
    issue(
      'markdown_mismatch',
      markdownFile,
      '',
      'The evidence report and JSON do not provide consistent execution provenance.',
    );
  }
  return issues.length > 0 ? { issues } : { issues, data: { blackboard, inventory, findings, markdown } };
}
