// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import { isDeepStrictEqual, types } from 'node:util';
import { observationLimits } from './limits.js';
import type {
  InputAvailability,
  ObservationDiagnostic,
  ObservationInput,
  ObservationLimits,
  ObservationResult,
  ObservedExchange,
  ObservedIdentity,
  ObservedResource,
  RecordedCategoryItem,
  RecordedFacts,
  RecordedTransition,
  SourceKind,
  SourceManifest,
  SourceRef,
} from './types.js';

type RecordData = Record<string, unknown>;
type Predicate = (value: unknown) => boolean;
export const nativeExchangeId = (value: unknown): value is string =>
  typeof value === 'string' && /^ex_[a-f0-9]{24}$/.test(value);
export const record = (value: unknown): value is RecordData =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length <= 16_384;
const id = (value: unknown): value is string => text(value) && value.length > 0 && value.length <= 1024;
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const bool: Predicate = (value) => typeof value === 'boolean';
const oneOf =
  (...choices: readonly unknown[]): Predicate =>
  (value) =>
    choices.includes(value);
const nullable =
  (valid: Predicate): Predicate =>
  (value) =>
    value === null || valid(value);
const optional =
  (valid: Predicate): Predicate =>
  (value) =>
    value === undefined || valid(value);
const array =
  (valid: Predicate): Predicate =>
  (value) =>
    Array.isArray(value) && value.every(valid);
const shape =
  (fields: Record<string, Predicate>): Predicate =>
  (value) =>
    record(value) && Object.entries(fields).every(([key, valid]) => valid(value[key]));
const strings = array(text);
const ids = array(id);
const provenance = shape({
  actor: oneOf('blackbox-recon', 'blackbox-analysis', 'blackbox-action', 'blackbox-verifier', 'orchestrator'),
  taskId: id,
  baseRevision: integer,
});
const evidence = array(shape({ kind: oneOf('exchange', 'resource', 'transition', 'action', 'proof'), id }));
const party = oneOf('customer', 'application', 'users');
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
const condition: Predicate = (value) =>
  record(value) &&
  ((value.type === 'body_contains' && text(value.marker)) ||
    (value.type === 'json_pointer_equals' && text(value.pointer) && Object.hasOwn(value, 'value')) ||
    (value.type === 'persistent_state' && id(value.verificationSourceExchangeId) && text(value.marker)));
const planFields = {
  steps: array(shape({ stepId: id, sourceExchangeId: id, actor: id, mutations: array(mutation) })),
  proofCondition: condition,
};
const plan = shape(planFields);
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
const task = shape({
  taskId: id,
  kind: oneOf('recon', 'analysis', 'action'),
  objective: text,
  evidence,
  identityLease: nullable(id),
  hypothesisId: nullable(id),
  status: oneOf('pending', 'running', 'completed', 'failed', 'rejected'),
  replayPlan: optional(plan),
});
const verification: Predicate = (value) =>
  shape({
    verificationId: id,
    candidateId: id,
    freshStateRefs: array(shape({ identity: id, fresh: oneOf(true) })),
    replayActionIds: ids,
    replayExchangeIds: ids,
    observation,
    failureReason: nullable(text),
    verdict: oneOf('verified', 'disproved', 'blocked'),
  })(value) &&
  record(value) &&
  (value.verdict !== 'verified' ||
    (text(value.demonstratedAction) && text(value.concreteEffect) && party(value.affectedParty)));
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
  affectedParty: party,
  impactStatement: text,
  preconditions: strings,
  verifierResultId: id,
});
const collections: Record<string, { key: string; valid: Predicate }> = {
  identities: { key: 'name', valid: shape({ name: id, role: text, authenticated: bool }) },
  exchanges: {
    key: 'exchangeId',
    valid: shape({
      exchangeId: nativeExchangeId,
      routeSignature: id,
      method: id,
      origin: id,
      path: text,
      queryKeys: strings,
      bodyShape: text,
      requestContentType: nullable(text),
      candidateObjectReferences: strings,
      provenance,
    }),
  },
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
      fromState: text,
      toState: text,
      triggerExchangeId: id,
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
      affectedParty: party,
      preconditions: strings,
      provenance,
    }),
  },
  verifications: { key: 'verificationId', valid: verification },
  tasks: { key: 'taskId', valid: task },
  rejectedTasks: { key: 'taskId', valid: shape({ task, reason: text }) },
};

export class ObservationValidationError extends Error {
  constructor(readonly code: 'resource-limit' | 'invalid-required-input') {
    super('Saved observation input could not be validated.');
  }
}
export function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
export function sourceRefs(refs: readonly SourceRef[]): SourceRef[] {
  return [
    ...new Map(
      refs.map((ref) => [
        JSON.stringify([ref.source, ref.pointer, ref.exchangeId ?? '']),
        {
          source: ref.source,
          pointer: ref.pointer,
          ...(ref.exchangeId === undefined ? {} : { exchangeId: ref.exchangeId }),
        },
      ]),
    ).values(),
  ].sort((a, b) =>
    compare(`${a.source}\0${a.pointer}\0${a.exchangeId ?? ''}`, `${b.source}\0${b.pointer}\0${b.exchangeId ?? ''}`),
  );
}
export function diagnostic(code: string, sources: readonly SourceRef[]): ObservationDiagnostic {
  const messages: Record<string, string> = {
    'invalid-required-input': 'A required native observation envelope is missing or invalid.',
    'invalid-optional-input': 'Optional recorded findings are invalid; their count is unavailable.',
    'invalid-record': 'A saved record is malformed and was isolated from supported observations.',
    'conflicting-record': 'Copies of a saved identifier disagree; that record was isolated.',
    'missing-overlap': 'An exchange is present in only one required export; the shared inventory is incomplete.',
    'unattributed-identity': 'The saved identity is absent or is not declared by a usable identity record.',
    'invalid-response-metadata': 'Recorded response metadata is invalid; usable response evidence is unavailable.',
    'invalid-capture-sequence': 'Recorded capture ordering is unavailable for this record.',
    'missing-reference': 'A saved reference has no usable referenced record in these inputs.',
    'conflicting-reference': 'A saved reference names a conflicting record in these inputs.',
    'input-read-failed': 'A requested input could not be read or validated; its evidence is unavailable.',
    'invalid-run-metadata': 'Recorded run termination metadata is malformed and remains unavailable.',
    'resource-limit': 'Saved observations exceed the enforced resource bounds.',
    'workflow-reference-problem': 'Some recorded workflow references or sequence associations are unresolved.',
  };
  return {
    code,
    message: messages[code] ?? 'The saved observation could not be interpreted completely.',
    sources: sourceRefs(sources),
  };
}

/** Reject executable object features, cycles and oversized graphs before inspecting any supplied field. */
export function boundGraph(value: unknown, limits: ObservationLimits): void {
  let nodes = 0;
  let bytes = 0;
  const active = new Set<object>();
  const visit = (item: unknown, depth: number): void => {
    if (++nodes > limits.maxNodes || depth > limits.maxDepth) throw new ObservationValidationError('resource-limit');
    if (typeof item === 'string') {
      bytes += Buffer.byteLength(item) + 2;
      if (bytes > limits.maxTotalBytes) throw new ObservationValidationError('resource-limit');
      return;
    }
    if (item === null || typeof item === 'boolean' || item === undefined) return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (typeof item !== 'object' || types.isProxy(item) || active.has(item))
      throw new ObservationValidationError('invalid-required-input');
    const prototype = Object.getPrototypeOf(item);
    if (prototype !== null && prototype !== Object.prototype && !(Array.isArray(item) && prototype === Array.prototype))
      throw new ObservationValidationError('invalid-required-input');
    active.add(item);
    if (Object.getOwnPropertySymbols(item).length > 0) throw new ObservationValidationError('invalid-required-input');
    const descriptors = Object.getOwnPropertyDescriptors(item);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (Array.isArray(item) && key === 'length') continue;
      if (!('value' in descriptor) || !descriptor.enumerable)
        throw new ObservationValidationError('invalid-required-input');
      bytes += Buffer.byteLength(key) + 3;
      if (bytes > limits.maxTotalBytes) throw new ObservationValidationError('resource-limit');
      visit(descriptor.value, depth + 1);
    }
    active.delete(item);
  };
  visit(value, 0);
}

interface IndexedRecord {
  readonly value: RecordData;
  readonly sources: SourceRef[];
}
interface Index {
  readonly valid: Map<string, IndexedRecord>;
  readonly conflicts: Map<string, SourceRef[]>;
  readonly countedConflicts?: Set<string>;
}
export interface ValidatedResourceContext {
  readonly resourceId: string;
  readonly ownerIdentity: string;
  readonly linkedExchangeIds: readonly string[];
  readonly resourceSources: readonly SourceRef[];
  readonly exchangeSources: readonly {
    readonly exchangeId: string;
    readonly sources: readonly SourceRef[];
  }[];
}
export interface ValidatedObservation {
  readonly identities: ObservedIdentity[];
  readonly exchanges: ObservedExchange[];
  readonly resources: ObservedResource[];
  readonly resourceContexts: ValidatedResourceContext[];
  readonly transitions: RecordedTransition[];
  readonly conflictedExchangeIds: string[];
  readonly conflictedResourceIds: string[];
  readonly conflictedTransitionIds: string[];
  readonly diagnostics: ObservationDiagnostic[];
  readonly recorded: RecordedFacts;
  readonly sources: SourceManifest[];
  readonly inputs: ObservationResult['inputs'];
  readonly duplicates: number;
  readonly conflicts: number;
  readonly rejectedRecords: number;
}
export function emptyRecorded(): RecordedFacts {
  return {
    runStatus: 'unknown',
    failureRecorded: null,
    termination: { state: 'unavailable', code: null, source: null, sources: [] },
    findings: { availability: 'unavailable', count: null, sources: [] },
    hypotheses: [],
    candidates: [],
    verifications: [],
    tasks: [],
    rejectedTasks: [],
  };
}

export function validateObservation(input: ObservationInput, limits: ObservationLimits): ValidatedObservation {
  boundGraph(input, limits);
  if (!record(input) || !Array.isArray(input.traffic) || !record(input.blackboard))
    throw new ObservationValidationError('invalid-required-input');
  const board = input.blackboard;
  if (
    board.schemaVersion !== 1 ||
    !integer(board.revision) ||
    !id(board.targetOrigin) ||
    !['running', 'complete', 'incomplete', 'failed'].includes(String(board.runStatus)) ||
    !(board.failure === null || text(board.failure))
  )
    throw new ObservationValidationError('invalid-required-input');
  for (const name of Object.keys(collections))
    if (!Array.isArray(board[name])) throw new ObservationValidationError('invalid-required-input');
  if (input.rawRequested !== undefined && typeof input.rawRequested !== 'boolean')
    throw new ObservationValidationError('invalid-required-input');
  if (input.rawRecords !== undefined && !Array.isArray(input.rawRecords))
    throw new ObservationValidationError('invalid-required-input');
  const total =
    input.traffic.length +
    Object.keys(collections).reduce((sum, name) => sum + (board[name] as unknown[]).length, 0) +
    (Array.isArray(input.findings) ? input.findings.length : 0);
  if (total > limits.maxRecords) throw new ObservationValidationError('resource-limit');
  let selectedBytes = 0;
  for (const document of [input.traffic, input.blackboard, input.findings])
    if (document !== undefined) {
      const bytes = Buffer.byteLength(JSON.stringify(document));
      if (bytes > limits.maxNativeBytes) throw new ObservationValidationError('resource-limit');
      selectedBytes += bytes;
    }
  for (const item of input.rawRecords ?? [])
    if (record(item) && item.document !== undefined) {
      const bytes = Buffer.byteLength(JSON.stringify(item.document));
      if (bytes > limits.maxRawBytes) throw new ObservationValidationError('resource-limit');
      selectedBytes += bytes;
    }
  if (selectedBytes > limits.maxTotalBytes) throw new ObservationValidationError('resource-limit');
  const diagnostics: ObservationDiagnostic[] = [];
  let duplicates = 0;
  let conflicts = 0;
  let rejectedRecords = 0;
  const index = (
    values: unknown[],
    source: SourceKind,
    prefix: string,
    descriptor: { key: string; valid: Predicate },
    nested = false,
  ): Index => {
    const valid = new Map<string, IndexedRecord>();
    const conflicted = new Map<string, SourceRef[]>();
    const invalidIds = new Set<string>();
    for (let position = 0; position < values.length; position++) {
      const value = values[position];
      const refs: SourceRef[] = [{ source, pointer: `${prefix}/${position}` }];
      const object = record(value) ? (nested && record(value.task) ? value.task : value) : null;
      const identifier = object?.[descriptor.key];
      if (!descriptor.valid(value) || !record(value) || !id(identifier)) {
        rejectedRecords++;
        diagnostics.push(diagnostic('invalid-record', refs));
        if (id(identifier)) {
          invalidIds.add(identifier);
          conflicted.set(identifier, [...(conflicted.get(identifier) ?? []), ...refs]);
        }
        continue;
      }
      const previous = valid.get(identifier);
      if (previous) {
        if (isDeepStrictEqual(previous.value, value)) {
          duplicates++;
          previous.sources.push(...refs);
        } else {
          conflicted.set(identifier, [...(conflicted.get(identifier) ?? []), ...previous.sources, ...refs]);
        }
      } else valid.set(identifier, { value, sources: refs });
    }
    const originallyValid = new Set(valid.keys());
    for (const [identifier, refs] of conflicted) {
      const previous = valid.get(identifier);
      if (previous) refs.push(...previous.sources);
      valid.delete(identifier);
      if (!invalidIds.has(identifier) || previous) diagnostics.push(diagnostic('conflicting-record', refs));
    }
    const countedConflicts = new Set(
      [...conflicted.keys()].filter((identifier) => !invalidIds.has(identifier) || originallyValid.has(identifier)),
    );
    conflicts += countedConflicts.size;
    return { valid, conflicts: conflicted, countedConflicts };
  };
  const indexes = new Map<string, Index>();
  for (const [name, descriptor] of Object.entries(collections))
    indexes.set(name, index(board[name] as unknown[], 'blackboard', `/${name}`, descriptor, name === 'rejectedTasks'));
  const descriptor = collections.exchanges;
  if (!descriptor) throw new ObservationValidationError('invalid-required-input');
  const traffic = index(input.traffic, 'traffic', '', descriptor);
  const exported = indexes.get('exchanges');
  if (!exported) throw new ObservationValidationError('invalid-required-input');
  conflicts -= (traffic.countedConflicts?.size ?? 0) + (exported.countedConflicts?.size ?? 0);
  const exchangeConflictIds = new Set([...(traffic.countedConflicts ?? []), ...(exported.countedConflicts ?? [])]);
  const exchangeIndex: Index = { valid: new Map(), conflicts: new Map([...traffic.conflicts, ...exported.conflicts]) };
  const allIds = new Set([...traffic.valid.keys(), ...exported.valid.keys(), ...exchangeIndex.conflicts.keys()]);
  if (allIds.size > limits.maxExchanges) throw new ObservationValidationError('resource-limit');
  for (const exchangeId of [...allIds].sort(compare)) {
    const left = traffic.valid.get(exchangeId);
    const right = exported.valid.get(exchangeId);
    const refs = [
      ...(left?.sources ?? []),
      ...(right?.sources ?? []),
      ...(exchangeIndex.conflicts.get(exchangeId) ?? []),
    ];
    if (exchangeIndex.conflicts.has(exchangeId)) {
      if (left || right) {
        exchangeConflictIds.add(exchangeId);
        diagnostics.push(diagnostic('conflicting-record', refs));
      }
      continue;
    }
    if (left && right && !isDeepStrictEqual(left.value, right.value)) {
      exchangeConflictIds.add(exchangeId);
      exchangeIndex.conflicts.set(exchangeId, refs);
      diagnostics.push(diagnostic('conflicting-record', refs));
      continue;
    }
    const accepted = left ?? right;
    if (!accepted) continue;
    if (!left || !right) diagnostics.push(diagnostic('missing-overlap', refs));
    exchangeIndex.valid.set(exchangeId, { value: accepted.value, sources: sourceRefs(refs) });
  }
  conflicts += exchangeConflictIds.size;
  indexes.set('exchanges', exchangeIndex);
  const identityIndex = indexes.get('identities') ?? { valid: new Map(), conflicts: new Map() };
  if (identityIndex.valid.size + identityIndex.conflicts.size > limits.maxIdentities)
    throw new ObservationValidationError('resource-limit');
  const identities = new Map<string, ObservedIdentity>();
  for (const { value, sources } of identityIndex.valid.values()) {
    const name = value.name as string;
    const key = name === 'anonymous' ? 'anonymous' : `named:${name}`;
    identities.set(key, {
      key,
      kind: name === 'anonymous' ? 'anonymous' : 'named',
      name,
      role: value.role as string,
      authenticated: value.authenticated as boolean,
      sources: sourceRefs(sources),
    });
  }
  const identity = (
    name: unknown,
    sources: readonly SourceRef[],
  ): { identityKey: string; recordedIdentity: string | null } => {
    const recordedIdentity = id(name) ? name : null;
    const key =
      name === 'anonymous'
        ? 'anonymous'
        : recordedIdentity && identities.has(`named:${recordedIdentity}`)
          ? `named:${recordedIdentity}`
          : 'unattributed';
    if (!identities.has(key))
      identities.set(key, {
        key,
        kind: key === 'anonymous' ? 'anonymous' : 'unattributed',
        name: key === 'anonymous' ? 'anonymous' : null,
        role: null,
        authenticated: null,
        sources: sourceRefs(sources),
      });
    else if (key === 'anonymous' || key === 'unattributed') {
      const previous = identities.get(key);
      if (previous) identities.set(key, { ...previous, sources: sourceRefs([...previous.sources, ...sources]) });
    }
    if (key === 'unattributed') diagnostics.push(diagnostic('unattributed-identity', sources));
    return { identityKey: key, recordedIdentity };
  };
  const capture = (value: unknown, sources: readonly SourceRef[]): number | null => {
    if (integer(value) && value > 0) return value;
    diagnostics.push(diagnostic('invalid-capture-sequence', sources));
    return null;
  };
  const exchanges: ObservedExchange[] = [];
  for (const [exchangeId, { value, sources }] of exchangeIndex.valid) {
    let safeMetadata = true;
    try {
      const origin = new URL(value.origin as string);
      safeMetadata =
        ['http:', 'https:'].includes(origin.protocol) &&
        !origin.username &&
        !origin.password &&
        origin.origin === value.origin &&
        /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value.method as string) &&
        (value.method as string).length <= 32 &&
        (value.path as string).startsWith('/') &&
        !/[?#\r\n]/.test(value.path as string);
    } catch {
      safeMetadata = false;
    }
    if (!safeMetadata) {
      rejectedRecords++;
      diagnostics.push(diagnostic('invalid-record', sources));
      exchangeIndex.valid.delete(exchangeId);
      continue;
    }
    const validStatus =
      integer(value.responseStatus) &&
      (value.responseStatus === 0 || (value.responseStatus >= 100 && value.responseStatus <= 599));
    const fingerprint =
      typeof value.responseFingerprint === 'string' && /^sha256:[a-f0-9]{64}$/.test(value.responseFingerprint)
        ? value.responseFingerprint
        : null;
    const responseValid = validStatus && fingerprint !== null && nullable(text)(value.responseContentType);
    if (!responseValid) diagnostics.push(diagnostic('invalid-response-metadata', sources));
    const savedProvenance = value.provenance as RecordData;
    exchanges.push({
      exchangeId,
      routeSignature: value.routeSignature as string,
      ...identity(value.identity, sources),
      captureSequence: capture(value.captureSequence, sources),
      method: value.method as string,
      origin: value.origin as string,
      path: value.path as string,
      responseStatus: validStatus ? (value.responseStatus as number) : null,
      normalizedResponse: !responseValid ? 'invalid' : value.responseStatus === 0 ? 'unavailable' : 'usable',
      responseFingerprint: fingerprint,
      provenance: {
        actor: savedProvenance.actor as string,
        taskId: savedProvenance.taskId as string,
        baseRevision: savedProvenance.baseRevision as number,
      },
      raw: { availability: 'not-supplied', association: 'not-assessed', response: 'unknown', sources: [] },
      sources,
    });
  }
  if (new Set(exchanges.map((item) => item.routeSignature)).size > limits.maxRoutes)
    throw new ObservationValidationError('resource-limit');
  const resources: ObservedResource[] = [...(indexes.get('resources')?.valid.values() ?? [])].map(
    ({ value, sources }) => ({
      resourceId: value.resourceId as string,
      ownerIdentity: value.ownerIdentity as string | null,
      sources: sourceRefs(sources),
    }),
  );
  const transitionIndex = indexes.get('transitions');
  if ((transitionIndex?.valid.size ?? 0) + (transitionIndex?.conflicts.size ?? 0) > limits.maxTransitions)
    throw new ObservationValidationError('resource-limit');
  const transitions: RecordedTransition[] = [...(transitionIndex?.valid.values() ?? [])].map(({ value, sources }) => ({
    transitionId: value.transitionId as string,
    ...identity(value.identity, sources),
    fromState: value.fromState as string,
    toState: value.toState as string,
    triggerExchangeId: value.triggerExchangeId as string,
    captureSequence: capture(value.captureSequence, sources),
    resourceId: value.resourceId as string | null,
    sources: sourceRefs(sources),
  }));
  const known = (kind: string, identifier: unknown, sources: readonly SourceRef[]): boolean => {
    if (identifier === null || identifier === undefined) return true;
    const referenceIndex = indexes.get(kind);
    if (id(identifier) && referenceIndex?.valid.has(identifier)) return true;
    diagnostics.push(
      diagnostic(
        id(identifier) && referenceIndex?.conflicts.has(identifier) ? 'conflicting-reference' : 'missing-reference',
        sources,
      ),
    );
    return false;
  };
  const inspectReferences = (value: RecordData, sources: readonly SourceRef[]): boolean => {
    let valid = true;
    const check = (kind: string, identifier: unknown): void => {
      if (!known(kind, identifier, sources)) valid = false;
    };
    if (Array.isArray(value.evidence))
      for (const ref of value.evidence)
        if (record(ref))
          check(
            (
              {
                exchange: 'exchanges',
                resource: 'resources',
                transition: 'transitions',
                action: 'actions',
                proof: 'candidateProofs',
              } as Record<string, string>
            )[String(ref.kind)] ?? '',
            ref.id,
          );
    for (const [field, kind] of [
      ['hypothesisId', 'hypotheses'],
      ['candidateId', 'candidateProofs'],
      ['victimResourceId', 'resources'],
      ['baselineExchangeId', 'exchanges'],
      ['verificationSourceExchangeId', 'exchanges'],
      ['actionId', 'actions'],
      ['verifierResultId', 'verifications'],
    ] as const)
      if (field !== 'actionId' || !Object.hasOwn(value, 'sequence'))
        if (Object.hasOwn(value, field)) check(kind, value[field]);
    for (const field of ['exchangeIds', 'replayExchangeIds', 'attackExchangeIds', 'verificationExchangeIds'] as const)
      if (Array.isArray(value[field])) for (const ref of value[field]) check('exchanges', ref);
    if (Array.isArray(value.replayActionIds)) for (const ref of value.replayActionIds) check('actions', ref);
    const checkIdentity = (name: unknown): void => {
      if (name === 'anonymous' || name === null || name === undefined) return;
      if (id(name) && identityIndex.valid.has(name)) return;
      valid = false;
      diagnostics.push(
        diagnostic(
          id(name) && identityIndex.conflicts.has(name) ? 'conflicting-reference' : 'unattributed-identity',
          sources,
        ),
      );
    };
    for (const field of ['ownerIdentity', 'victimIdentity', 'attackerIdentity', 'identityLease', 'actor'])
      if (Object.hasOwn(value, field)) checkIdentity(value[field]);
    if (Array.isArray(value.freshStateRefs))
      for (const ref of value.freshStateRefs) if (record(ref)) checkIdentity(ref.identity);
    const savedPlan = (candidate: unknown): void => {
      if (!record(candidate)) return;
      if (Array.isArray(candidate.steps))
        for (const step of candidate.steps)
          if (record(step)) {
            check('exchanges', step.sourceExchangeId);
            checkIdentity(step.actor);
          }
      if (record(candidate.proofCondition) && candidate.proofCondition.type === 'persistent_state')
        check('exchanges', candidate.proofCondition.verificationSourceExchangeId);
    };
    savedPlan(value.sequence);
    savedPlan(value.replaySequence);
    savedPlan(value.replayPlan);
    if (record(value.observation)) {
      for (const field of ['baselineExchangeId', 'verificationExchangeId'])
        if (Object.hasOwn(value.observation, field)) check('exchanges', value.observation[field]);
      if (Array.isArray(value.observation.controlExchangeIds))
        for (const ref of value.observation.controlExchangeIds) check('exchanges', ref);
      if (Object.hasOwn(value.observation, 'observedTransitionId'))
        check('transitions', value.observation.observedTransitionId);
      if (record(value.observation.condition) && value.observation.condition.type === 'persistent_state')
        check('exchanges', value.observation.condition.verificationSourceExchangeId);
    }
    return valid;
  };
  for (const [name, indexed] of indexes) {
    if (['identities', 'exchanges', 'transitions'].includes(name)) continue;
    for (const item of indexed.valid.values()) {
      const value = name === 'rejectedTasks' && record(item.value.task) ? item.value.task : item.value;
      // A record's own ID is not a reference to a different category.
      const projected = { ...value };
      const key = collections[name]?.key;
      if (key) delete projected[key];
      inspectReferences(projected, item.sources);
    }
  }
  const exchangeSources = new Map(exchanges.map((exchange) => [exchange.exchangeId, exchange.sources]));
  const resourceContexts: ValidatedResourceContext[] = [];
  for (const { value, sources: resourceSources } of indexes.get('resources')?.valid.values() ?? []) {
    const ownerIdentity = value.ownerIdentity;
    if (typeof ownerIdentity !== 'string' || (ownerIdentity !== 'anonymous' && !identityIndex.valid.has(ownerIdentity)))
      continue;
    const linkedExchangeIds = [
      ...new Set(
        (value.evidence as RecordData[])
          .filter((reference) => reference.kind === 'exchange' && exchangeSources.has(reference.id as string))
          .map((reference) => reference.id as string),
      ),
    ].sort(compare);
    if (linkedExchangeIds.length === 0) continue;
    resourceContexts.push({
      resourceId: value.resourceId as string,
      ownerIdentity,
      linkedExchangeIds,
      resourceSources: sourceRefs(resourceSources),
      exchangeSources: linkedExchangeIds.map((exchangeId) => ({
        exchangeId,
        sources: sourceRefs(exchangeSources.get(exchangeId) ?? []),
      })),
    });
  }
  const category = (name: string, state: string | null): RecordedCategoryItem[] =>
    [...(indexes.get(name)?.valid.entries() ?? [])]
      .map(([identifier, item]) => ({
        id: identifier,
        state: state === null ? 'recorded' : name === 'rejectedTasks' ? 'rejected' : String(item.value[state]),
        sources: sourceRefs(item.sources),
      }))
      .sort((a, b) => compare(a.id, b.id));
  let findingState: RecordedFacts['findings'] = { availability: 'unavailable', count: null, sources: [] };
  let findingsAvailability: InputAvailability = input.findings === undefined ? 'not-supplied' : 'invalid';
  if (input.findings !== undefined) {
    if (Array.isArray(input.findings)) {
      const previousRejected = rejectedRecords;
      const indexed = index(input.findings, 'findings', '', { key: 'findingId', valid: finding });
      const valid =
        rejectedRecords === previousRejected &&
        indexed.conflicts.size === 0 &&
        [...indexed.valid.values()].map((item) => inspectReferences(item.value, item.sources)).every(Boolean);
      if (valid) {
        findingState = {
          availability: 'known',
          count: indexed.valid.size,
          sources: [{ source: 'findings', pointer: '' }],
        };
        findingsAvailability = 'available';
      }
    }
    if (findingsAvailability === 'invalid')
      diagnostics.push(diagnostic('invalid-optional-input', [{ source: 'findings', pointer: '' }]));
  }
  let termination: RecordedFacts['termination'] = { state: 'unavailable', code: null, source: null, sources: [] };
  if (board.runMetadata !== undefined) {
    const metadata = board.runMetadata;
    const states = [
      'completed',
      'limit_reached',
      'uncertain_execution',
      'prerequisite_failed',
      'verification_state_missing',
      'component_error',
      'interrupted',
      'execution_error',
      'unknown',
    ];
    if (
      record(metadata) &&
      metadata.schemaVersion === 1 &&
      id(metadata.currentAttemptId) &&
      (metadata.resultAttemptId === null || id(metadata.resultAttemptId)) &&
      Array.isArray(metadata.attempts)
    ) {
      const selectedId = metadata.resultAttemptId ?? metadata.currentAttemptId;
      const attempts = metadata.attempts
        .map((value, position) => ({ value, position }))
        .filter(({ value }) => record(value) && value.attemptId === selectedId);
      const selected = attempts.length === 1 ? attempts[0] : undefined;
      if (selected && record(selected.value) && selected.value.termination === null)
        termination = {
          state: 'unavailable',
          code: null,
          source: null,
          sources: [{ source: 'blackboard', pointer: `/runMetadata/attempts/${selected.position}/termination` }],
        };
      else if (
        selected &&
        record(selected.value) &&
        record(selected.value.termination) &&
        states.includes(String(selected.value.termination.code)) &&
        ['workflow', 'temporal', 'worker'].includes(String(selected.value.termination.source))
      )
        termination = {
          state: 'recorded',
          code: selected.value.termination.code as string,
          source: selected.value.termination.source as string,
          sources: [{ source: 'blackboard', pointer: `/runMetadata/attempts/${selected.position}/termination` }],
        };
      else
        termination = {
          state: 'invalid',
          code: null,
          source: null,
          sources: [{ source: 'blackboard', pointer: '/runMetadata' }],
        };
    } else
      termination = {
        state: 'invalid',
        code: null,
        source: null,
        sources: [{ source: 'blackboard', pointer: '/runMetadata' }],
      };
    if (termination.state === 'invalid') diagnostics.push(diagnostic('invalid-run-metadata', termination.sources));
  }
  const sources: SourceManifest[] = [];
  if (input.sources !== undefined) {
    if (!Array.isArray(input.sources)) throw new ObservationValidationError('invalid-required-input');
    const names: Record<string, string> = {
      traffic: 'traffic_inventory.json',
      blackboard: 'blackbox_blackboard.json',
      findings: 'blackbox_authz_findings.json',
    };
    for (const manifest of input.sources) {
      if (
        !record(manifest) ||
        !['available', 'missing', 'invalid', 'not-supplied'].includes(String(manifest.availability)) ||
        !(
          manifest.sha256 === null ||
          (typeof manifest.sha256 === 'string' && /^[a-f0-9]{64}$/.test(manifest.sha256))
        ) ||
        !(manifest.bytes === null || integer(manifest.bytes)) ||
        (manifest.source === 'raw'
          ? !nativeExchangeId(manifest.exchangeId) || manifest.file !== `${manifest.exchangeId}.json`
          : !Object.hasOwn(names, String(manifest.source)) || manifest.file !== names[String(manifest.source)])
      )
        throw new ObservationValidationError('invalid-required-input');
      sources.push({
        source: manifest.source as SourceKind,
        file: manifest.file as string,
        availability: manifest.availability as InputAvailability,
        sha256: manifest.sha256 as string | null,
        bytes: manifest.bytes as number | null,
        ...(manifest.source === 'raw' ? { exchangeId: manifest.exchangeId as string } : {}),
      });
    }
    const findingManifest = sources.find((item) => item.source === 'findings');
    if (input.findings === undefined && findingManifest)
      findingsAvailability = findingManifest.availability === 'available' ? 'invalid' : findingManifest.availability;
  }
  if (input.inputDiagnostics !== undefined) {
    if (!Array.isArray(input.inputDiagnostics)) throw new ObservationValidationError('invalid-required-input');
    for (const issue of input.inputDiagnostics) {
      if (
        !record(issue) ||
        !['missing-input', 'invalid-input', 'input-limit', 'unsafe-input', 'read-failed'].includes(
          String(issue.code),
        ) ||
        !record(issue.source) ||
        !['traffic', 'blackboard', 'findings', 'raw'].includes(String(issue.source.source)) ||
        issue.source.pointer !== '' ||
        (issue.source.source === 'raw' && !nativeExchangeId(issue.source.exchangeId))
      )
        throw new ObservationValidationError('invalid-required-input');
      if (issue.code === 'input-limit') throw new ObservationValidationError('resource-limit');
      if (issue.source.source === 'traffic' || issue.source.source === 'blackboard')
        throw new ObservationValidationError('invalid-required-input');
      diagnostics.push(
        diagnostic('input-read-failed', [
          {
            source: issue.source.source as SourceKind,
            pointer: '',
            ...(issue.source.source === 'raw' ? { exchangeId: issue.source.exchangeId as string } : {}),
          },
        ]),
      );
      if (issue.source.source === 'findings') {
        findingsAvailability = 'invalid';
        findingState = { availability: 'unavailable', count: null, sources: [] };
      }
    }
  }
  return {
    identities: [...identities.values()].sort((a, b) => compare(a.key, b.key)),
    exchanges: exchanges.sort((a, b) => compare(a.exchangeId, b.exchangeId)),
    resources: resources.sort((a, b) => compare(a.resourceId, b.resourceId)),
    resourceContexts: resourceContexts.sort((a, b) => compare(a.resourceId, b.resourceId)),
    transitions: transitions.sort((a, b) => compare(a.transitionId, b.transitionId)),
    conflictedExchangeIds: [...exchangeIndex.conflicts.keys()].sort(compare),
    conflictedResourceIds: [...(indexes.get('resources')?.conflicts.keys() ?? [])].sort(compare),
    conflictedTransitionIds: [...(transitionIndex?.conflicts.keys() ?? [])].sort(compare),
    diagnostics,
    recorded: {
      runStatus: board.runStatus as RecordedFacts['runStatus'],
      failureRecorded: board.failure !== null,
      termination,
      findings: findingState,
      hypotheses: category('hypotheses', 'status'),
      candidates: category('candidateProofs', null),
      verifications: category('verifications', 'verdict'),
      tasks: category('tasks', 'status'),
      rejectedTasks: category('rejectedTasks', 'status'),
    },
    sources: sources.sort((a, b) => compare(`${a.source}\0${a.file}`, `${b.source}\0${b.file}`)),
    inputs: {
      traffic: 'available',
      blackboard: 'available',
      findings: findingsAvailability,
      rawRequested: input.rawRequested === true,
    },
    duplicates,
    conflicts,
    rejectedRecords,
  };
}

/** Only validated, nonconflicting native identifiers may select optional raw filenames. */
export function selectRawExchangeIds(
  traffic: unknown,
  blackboard: unknown,
  overrides?: Partial<ObservationLimits>,
): readonly string[] {
  const limits = observationLimits(overrides);
  try {
    return validateObservation({ traffic, blackboard }, limits)
      .exchanges.map((item) => item.exchangeId)
      .filter(nativeExchangeId)
      .sort(compare);
  } catch (error) {
    if (error instanceof ObservationValidationError) return [];
    throw error;
  }
}
