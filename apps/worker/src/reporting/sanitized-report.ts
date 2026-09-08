// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { isDeepStrictEqual } from 'node:util';
import type { BundleIssue, JsonRecord, PrivateBundleData } from './bundle-types.js';

const RUN_STATUSES = ['running', 'complete', 'incomplete', 'failed'] as const;
const HYPOTHESIS_STATUSES = [
  'open',
  'queued',
  'tested',
  'verified',
  'disproved',
  'blocked',
  'no_demonstrated_impact',
] as const;
const TASK_STATUSES = ['pending', 'running', 'completed', 'failed', 'rejected'] as const;
const VERDICTS = ['verified', 'disproved', 'blocked'] as const;
const EVIDENCE_KINDS = ['exchange', 'resource', 'transition', 'action', 'proof'] as const;
const HYPOTHESIS_KINDS = ['horizontal', 'vertical', 'workflow'] as const;
const TASK_KINDS = ['recon', 'analysis', 'action'] as const;
const TERMINATIONS = [
  'completed',
  'limit_reached',
  'uncertain_execution',
  'prerequisite_failed',
  'verification_state_missing',
  'component_error',
  'interrupted',
  'execution_error',
  'unknown',
] as const;
const TERMINATION_SOURCES = ['workflow', 'temporal', 'worker'] as const;
const LIMITATIONS = {
  privateDetails: 'omitted',
  aliases: 'local-to-this-bundle',
  coverage: 'unknown',
  securityConclusion: 'not-established',
  authenticity: 'not-established',
} as const;

function invalidSource(): never {
  throw new Error('The source cannot be represented as a sanitized summary.');
}

function record(value: unknown): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return invalidSource();
  return value as JsonRecord;
}

function records(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return invalidSource();
  return value.map(record);
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return invalidSource();
  return value.map(string);
}

function string(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return invalidSource();
  return value;
}

function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') return invalidSource();
  return value;
}

function choice<const T extends readonly string[]>(value: unknown, allowed: T): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) return invalidSource();
  return value;
}

function aliases(values: readonly string[], prefix: string): Map<string, string> {
  return new Map([...new Set(values)].sort().map((value, index) => [value, `${prefix}-${index + 1}`]));
}

function reference(mapping: ReadonlyMap<string, string>, value: unknown): string {
  return mapping.get(string(value)) ?? invalidSource();
}

function optionalReference(mapping: ReadonlyMap<string, string>, value: unknown): string | null {
  return value === null ? null : reference(mapping, value);
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function ordered(values: readonly JsonRecord[], key: string): JsonRecord[] {
  const result = [...values].sort((left, right) => {
    const a = string(left[key]);
    const b = string(right[key]);
    return a < b ? -1 : a > b ? 1 : 0;
  });
  if (new Set(result.map((value) => string(value[key]))).size !== result.length) return invalidSource();
  return result;
}

function project(data: PrivateBundleData) {
  const board = data.blackboard;
  const configured = ordered(records(board.identities), 'name');
  const exchanges = ordered(records(board.exchanges), 'exchangeId');
  const resources = ordered(records(board.resources), 'resourceId');
  const transitions = ordered(records(board.transitions), 'transitionId');
  const actions = ordered(records(board.actions), 'actionId');
  const candidates = ordered(records(board.candidateProofs), 'candidateId');
  const hypotheses = ordered(records(board.hypotheses), 'hypothesisId');
  const tasks = ordered(records(board.tasks), 'taskId');
  const verifications = ordered(records(board.verifications), 'verificationId');
  const findings = ordered(data.findings, 'findingId');
  const identityNames = configured.map((identity) => string(identity.name));
  for (const value of [...exchanges, ...transitions]) identityNames.push(string(value.identity));
  for (const value of resources) if (value.ownerIdentity !== null) identityNames.push(string(value.ownerIdentity));
  for (const value of tasks) if (value.identityLease !== null) identityNames.push(string(value.identityLease));
  for (const value of [...candidates, ...findings])
    identityNames.push(string(value.victimIdentity), string(value.attackerIdentity));
  for (const value of verifications) {
    for (const state of records(value.freshStateRefs)) identityNames.push(string(state.identity));
  }
  const identityMap = aliases(identityNames, 'identity');
  const routeMap = aliases(
    exchanges.map((exchange) => string(exchange.routeSignature)),
    'route',
  );
  const hypothesisMap = aliases(
    hypotheses.map((value) => string(value.hypothesisId)),
    'hypothesis',
  );
  const verificationMap = aliases(
    verifications.map((value) => string(value.verificationId)),
    'verification',
  );
  const evidenceGroups = [
    ['exchange', 'exchangeId', exchanges],
    ['resource', 'resourceId', resources],
    ['transition', 'transitionId', transitions],
    ['action', 'actionId', actions],
    ['proof', 'candidateId', candidates],
  ] as const;
  const evidenceMap = new Map<string, string>();
  for (const [kind, key, entries] of evidenceGroups) {
    for (const entry of entries)
      evidenceMap.set(JSON.stringify([kind, string(entry[key])]), `evidence-${evidenceMap.size + 1}`);
  }
  const evidenceRef = (kind: string, id: unknown): string => reference(evidenceMap, JSON.stringify([kind, string(id)]));
  const evidenceRefs = (value: unknown): string[] =>
    distinct(records(value).map((ref) => evidenceRef(choice(ref.kind, EVIDENCE_KINDS), ref.id)));
  const exchangeRefs = (value: unknown): string[] => distinct(strings(value).map((id) => evidenceRef('exchange', id)));
  const configuredByName = new Map(configured.map((identity) => [string(identity.name), identity]));
  const observedIdentities = new Set(exchanges.map((exchange) => string(exchange.identity)));
  const identities = [...identityMap].map(([name, id]) => {
    const source = configuredByName.get(name);
    return {
      id,
      configured: source !== undefined,
      authenticated: source === undefined ? null : bool(source.authenticated),
      observed: observedIdentities.has(name),
    };
  });
  const evidence = evidenceGroups.flatMap(([kind, key, entries]) =>
    entries.map((entry) => {
      let identity: string | null = null;
      let route: string | null = null;
      let references: string[] = [];
      if (kind === 'exchange') {
        identity = reference(identityMap, entry.identity);
        route = reference(routeMap, entry.routeSignature);
      } else if (kind === 'resource') {
        identity = optionalReference(identityMap, entry.ownerIdentity);
        references = evidenceRefs(entry.evidence);
      } else if (kind === 'transition') {
        identity = reference(identityMap, entry.identity);
        references = [evidenceRef('exchange', entry.triggerExchangeId)];
        if (entry.resourceId !== null) references.push(evidenceRef('resource', entry.resourceId));
      } else if (kind === 'action') {
        references = exchangeRefs(entry.exchangeIds);
        for (const step of records(record(entry.sequence).steps))
          references.push(evidenceRef('exchange', step.sourceExchangeId));
      } else {
        references = [
          evidenceRef('resource', entry.victimResourceId),
          evidenceRef('exchange', entry.baselineExchangeId),
          evidenceRef('action', entry.actionId),
          evidenceRef('exchange', entry.verificationSourceExchangeId),
        ];
      }
      return { id: evidenceRef(kind, entry[key]), kind, identity, route, references: distinct(references) };
    }),
  );
  const result = {
    schemaVersion: 1 as const,
    kind: 'sanitized-summary' as const,
    limitations: LIMITATIONS,
    run: {
      status: choice(board.runStatus, RUN_STATUSES),
      failureRecorded: typeof board.failure === 'string' && board.failure.length > 0,
    },
    routes: [...routeMap.values()],
    rejectedProposals: records(board.rejectedTasks).map((_value, index) => `rejected-proposal-${index + 1}`),
    identities,
    evidence,
    hypotheses: hypotheses.map((value) => ({
      id: reference(hypothesisMap, value.hypothesisId),
      kind: choice(value.kind, HYPOTHESIS_KINDS),
      status: choice(value.status, HYPOTHESIS_STATUSES),
      evidence: evidenceRefs(value.evidence),
    })),
    tasks: tasks.map((value, index) => ({
      id: `task-${index + 1}`,
      kind: choice(value.kind, TASK_KINDS),
      status: choice(value.status, TASK_STATUSES),
      identity: optionalReference(identityMap, value.identityLease),
      hypothesis: optionalReference(hypothesisMap, value.hypothesisId),
      evidence: evidenceRefs(value.evidence),
    })),
    verifications: verifications.map((value) => ({
      id: reference(verificationMap, value.verificationId),
      candidate: evidenceRef('proof', value.candidateId),
      verdict: choice(value.verdict, VERDICTS),
      evidence: exchangeRefs(value.replayExchangeIds),
      identities: distinct(records(value.freshStateRefs).map((state) => reference(identityMap, state.identity))),
    })),
    findings: findings.map((value, index) => ({
      id: `finding-${index + 1}`,
      hypothesis: reference(hypothesisMap, value.hypothesisId),
      victim: reference(identityMap, value.victimIdentity),
      attacker: reference(identityMap, value.attackerIdentity),
      evidence: distinct([
        evidenceRef('exchange', value.baselineExchangeId),
        ...exchangeRefs(value.attackExchangeIds),
        ...exchangeRefs(value.verificationExchangeIds),
      ]),
      verifier: reference(verificationMap, value.verifierResultId),
      outcome: 'verified' as const,
    })),
    provenance: projectProvenance(board.runMetadata),
  };
  return { ...result, counts: deriveCounts(result) };
}

function projectProvenance(value: unknown) {
  if (value === undefined)
    return {
      available: false,
      run: null,
      historyComplete: null,
      currentAttempt: null,
      resultAttempt: null,
      attempts: [],
    };
  const metadata = record(value);
  string(metadata.runId);
  const attempts = ordered(records(metadata.attempts), 'attemptId');
  const attemptMap = aliases(
    attempts.map((attempt) => string(attempt.attemptId)),
    'attempt',
  );
  return {
    available: true,
    run: 'run-1',
    historyComplete: bool(metadata.historyComplete),
    currentAttempt: reference(attemptMap, metadata.currentAttemptId),
    resultAttempt: optionalReference(attemptMap, metadata.resultAttemptId),
    attempts: attempts.map((attempt) => {
      const code = record(attempt.code);
      const termination = attempt.termination === null ? null : record(attempt.termination);
      return {
        id: reference(attemptMap, attempt.attemptId),
        parent: optionalReference(attemptMap, attempt.resumedFromAttemptId),
        availability: {
          workflowId: typeof attempt.workflowId === 'string',
          startedAt: typeof attempt.startedAt === 'string',
          endedAt: typeof attempt.endedAt === 'string',
          codeRevision: typeof code.revision === 'string',
          codeDigest: typeof code.sha256 === 'string',
          codeDirtyState: typeof code.dirty === 'boolean',
          configuredModel: typeof attempt.configuredModel === 'string',
        },
        termination:
          termination === null
            ? null
            : {
                reason: choice(termination.code, TERMINATIONS),
                source: choice(termination.source, TERMINATION_SOURCES),
              },
      };
    }),
  };
}

type Summary = ReturnType<typeof project>;
interface CountInput {
  readonly identities: readonly { readonly configured: boolean; readonly authenticated: boolean | null }[];
  readonly evidence: readonly {
    readonly kind: string;
    readonly identity: string | null;
    readonly route: string | null;
  }[];
  readonly routes: readonly string[];
  readonly rejectedProposals: readonly string[];
  readonly hypotheses: readonly { readonly status: string }[];
  readonly tasks: readonly { readonly status: string }[];
  readonly verifications: readonly { readonly verdict: string }[];
  readonly findings: readonly unknown[];
}

function deriveCounts(summary: CountInput) {
  const exchanges = summary.evidence.filter((entry) => entry.kind === 'exchange');
  return {
    observed: {
      configuredIdentities: summary.identities.filter((entry) => entry.configured).length,
      configuredAuthenticatedIdentities: summary.identities.filter((entry) => entry.authenticated === true).length,
      identitiesWithTraffic: new Set(exchanges.map((entry) => entry.identity)).size,
      trafficRecords: exchanges.length,
      routeGroups: summary.routes.length,
      routeIdentityPairs: new Set(exchanges.map((entry) => JSON.stringify([entry.route, entry.identity]))).size,
      resources: summary.evidence.filter((entry) => entry.kind === 'resource').length,
      transitions: summary.evidence.filter((entry) => entry.kind === 'transition').length,
      actions: summary.evidence.filter((entry) => entry.kind === 'action').length,
      candidateProofs: summary.evidence.filter((entry) => entry.kind === 'proof').length,
      hypotheses: summary.hypotheses.length,
      tasks: summary.tasks.length,
      verifications: summary.verifications.length,
      findings: summary.findings.length,
      rejectedProposals: summary.rejectedProposals.length,
    },
    unresolved: {
      hypotheses: summary.hypotheses.filter((entry) => ['open', 'queued', 'tested', 'blocked'].includes(entry.status))
        .length,
      pendingOrRunningTasks: summary.tasks.filter((entry) => entry.status === 'pending' || entry.status === 'running')
        .length,
      blockedVerifications: summary.verifications.filter((entry) => entry.verdict === 'blocked').length,
    },
  };
}

function renderMarkdown(summary: Summary): string {
  const lines = [
    '# Sanitized artifact summary',
    '',
    'Private details are omitted. Aliases apply only within this bundle.',
    'Counts describe saved records; total application coverage is unknown.',
    'Run completion and zero findings do not establish that an application is secure.',
    'This summary cannot reproduce or independently substantiate findings. Authenticity is not established.',
    '',
    `Run status: ${summary.run.status}. Failure detail recorded: ${summary.run.failureRecorded ? 'yes' : 'no'}.`,
    '',
    '| Observed records | Count |',
    '| --- | ---: |',
    ...Object.entries(summary.counts.observed).map(([key, value]) => `| ${key} | ${value} |`),
    '',
    '| Unresolved records | Count |',
    '| --- | ---: |',
    ...Object.entries(summary.counts.unresolved).map(([key, value]) => `| ${key} | ${value} |`),
    '',
    '## Findings',
    '',
    ...(summary.findings.length === 0
      ? ['No reportable findings were recorded.']
      : summary.findings.map(
          (finding) =>
            `- ${finding.id}: ${finding.outcome}; verifier ${finding.verifier}; evidence ${finding.evidence.join(', ')}.`,
        )),
    '',
    '## Provenance',
    '',
    ...(summary.provenance.available
      ? [
          `Run: ${summary.provenance.run}; current attempt: ${summary.provenance.currentAttempt}; result attempt: ${summary.provenance.resultAttempt ?? 'not recorded'}.`,
          `Attempt history complete: ${summary.provenance.historyComplete ? 'yes' : 'no'}.`,
          ...summary.provenance.attempts.map(
            (attempt) =>
              `- ${attempt.id}; parent: ${attempt.parent ?? 'none'}; termination: ${attempt.termination === null ? 'not recorded' : `${attempt.termination.reason} (${attempt.termination.source})`}.`,
          ),
        ]
      : ['Execution provenance was not recorded.']),
    '',
    'The JSON companion contains the alias graph and provenance availability flags. Configuration values, timestamps, requests, proof values and narratives are omitted.',
    '',
  ];
  return lines.join('\n');
}

/** Constructs a new allowlisted view; it never edits or copies a source artifact. */
export function buildSanitizedArtifacts(
  data: PrivateBundleData,
): Readonly<Record<'report.json' | 'report.md', string>> {
  const summary = project(data);
  const files = { 'report.json': `${JSON.stringify(summary, null, 2)}\n`, 'report.md': renderMarkdown(summary) };
  if (validateSanitizedArtifacts(files).length > 0) return invalidSource();
  return files;
}

type Check = (value: unknown) => boolean;
const boolean: Check = (value) => typeof value === 'boolean';
const count: Check = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const literal =
  (expected: unknown): Check =>
  (value) =>
    value === expected;
const oneOf =
  (values: readonly string[]): Check =>
  (value) =>
    typeof value === 'string' && values.includes(value);
const nullable =
  (check: Check): Check =>
  (value) =>
    value === null || check(value);
const array =
  (check: Check): Check =>
  (value) =>
    Array.isArray(value) && value.every(check);
const alias =
  (prefix: string): Check =>
  (value) =>
    typeof value === 'string' && new RegExp(`^${prefix}-[1-9][0-9]*$`).test(value);
const object =
  (fields: Readonly<Record<string, Check>>): Check =>
  (value) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const source = value as JsonRecord;
    return (
      Object.keys(source).length === Object.keys(fields).length &&
      Object.entries(fields).every(([key, check]) => Object.hasOwn(source, key) && check(source[key]))
    );
  };
const identityAlias = alias('identity');
const evidenceAlias = alias('evidence');
const hypothesisAlias = alias('hypothesis');
const attemptAlias = alias('attempt');
const countFields = (keys: readonly string[]) => Object.fromEntries(keys.map((key) => [key, count]));
const shape = object({
  schemaVersion: literal(1),
  kind: literal('sanitized-summary'),
  limitations: object(Object.fromEntries(Object.entries(LIMITATIONS).map(([key, value]) => [key, literal(value)]))),
  run: object({ status: oneOf(RUN_STATUSES), failureRecorded: boolean }),
  routes: array(alias('route')),
  rejectedProposals: array(alias('rejected-proposal')),
  identities: array(
    object({ id: identityAlias, configured: boolean, authenticated: nullable(boolean), observed: boolean }),
  ),
  evidence: array(
    object({
      id: evidenceAlias,
      kind: oneOf(EVIDENCE_KINDS),
      identity: nullable(identityAlias),
      route: nullable(alias('route')),
      references: array(evidenceAlias),
    }),
  ),
  hypotheses: array(
    object({
      id: hypothesisAlias,
      kind: oneOf(HYPOTHESIS_KINDS),
      status: oneOf(HYPOTHESIS_STATUSES),
      evidence: array(evidenceAlias),
    }),
  ),
  tasks: array(
    object({
      id: alias('task'),
      kind: oneOf(TASK_KINDS),
      status: oneOf(TASK_STATUSES),
      identity: nullable(identityAlias),
      hypothesis: nullable(hypothesisAlias),
      evidence: array(evidenceAlias),
    }),
  ),
  verifications: array(
    object({
      id: alias('verification'),
      candidate: evidenceAlias,
      verdict: oneOf(VERDICTS),
      evidence: array(evidenceAlias),
      identities: array(identityAlias),
    }),
  ),
  findings: array(
    object({
      id: alias('finding'),
      hypothesis: hypothesisAlias,
      victim: identityAlias,
      attacker: identityAlias,
      evidence: array(evidenceAlias),
      verifier: alias('verification'),
      outcome: literal('verified'),
    }),
  ),
  provenance: object({
    available: boolean,
    run: nullable(literal('run-1')),
    historyComplete: nullable(boolean),
    currentAttempt: nullable(attemptAlias),
    resultAttempt: nullable(attemptAlias),
    attempts: array(
      object({
        id: attemptAlias,
        parent: nullable(attemptAlias),
        availability: object({
          workflowId: boolean,
          startedAt: boolean,
          endedAt: boolean,
          codeRevision: boolean,
          codeDigest: boolean,
          codeDirtyState: boolean,
          configuredModel: boolean,
        }),
        termination: nullable(object({ reason: oneOf(TERMINATIONS), source: oneOf(TERMINATION_SOURCES) })),
      }),
    ),
  }),
  counts: object({
    observed: object(
      countFields([
        'configuredIdentities',
        'configuredAuthenticatedIdentities',
        'identitiesWithTraffic',
        'trafficRecords',
        'routeGroups',
        'routeIdentityPairs',
        'resources',
        'transitions',
        'actions',
        'candidateProofs',
        'hypotheses',
        'tasks',
        'verifications',
        'findings',
        'rejectedProposals',
      ]),
    ),
    unresolved: object(countFields(['hypotheses', 'pendingOrRunningTasks', 'blockedVerifications'])),
  }),
});

function consistent(summary: Summary): boolean {
  const sequential = (values: readonly string[], prefix: string) =>
    values.every((value, index) => value === `${prefix}-${index + 1}`);
  for (const [entries, prefix] of [
    [summary.identities, 'identity'],
    [summary.evidence, 'evidence'],
    [summary.hypotheses, 'hypothesis'],
    [summary.tasks, 'task'],
    [summary.verifications, 'verification'],
    [summary.findings, 'finding'],
    [summary.provenance.attempts, 'attempt'],
  ] as const) {
    if (
      !sequential(
        entries.map((entry) => entry.id),
        prefix,
      )
    )
      return false;
  }
  if (!sequential(summary.routes, 'route')) return false;
  if (!sequential(summary.rejectedProposals, 'rejected-proposal')) return false;
  const identities = new Set(summary.identities.map((entry) => entry.id));
  const evidence = new Map(summary.evidence.map((entry) => [entry.id, entry]));
  const hypotheses = new Set(summary.hypotheses.map((entry) => entry.id));
  const routes = new Set(summary.routes);
  const refsExist = (values: readonly string[]) =>
    new Set(values).size === values.length && values.every((value) => evidence.has(value));
  for (const entry of summary.evidence) {
    if (!refsExist(entry.references) || (entry.identity !== null && !identities.has(entry.identity))) return false;
    if (entry.kind === 'exchange') {
      if (entry.identity === null || entry.route === null || !routes.has(entry.route) || entry.references.length !== 0)
        return false;
    } else if (entry.route !== null) return false;
    if ((entry.kind === 'action' || entry.kind === 'proof') && entry.identity !== null) return false;
    if (entry.kind === 'transition' && entry.identity === null) return false;
    const referencedKinds = entry.references.map((ref) => evidence.get(ref)?.kind);
    if (
      entry.kind === 'transition' &&
      (referencedKinds.filter((kind) => kind === 'exchange').length !== 1 ||
        referencedKinds.filter((kind) => kind === 'resource').length > 1 ||
        referencedKinds.some((kind) => kind !== 'exchange' && kind !== 'resource'))
    )
      return false;
    if (entry.kind === 'action' && referencedKinds.some((kind) => kind !== 'exchange')) return false;
    if (
      entry.kind === 'proof' &&
      (referencedKinds.filter((kind) => kind === 'resource').length !== 1 ||
        referencedKinds.filter((kind) => kind === 'action').length !== 1 ||
        referencedKinds.filter((kind) => kind === 'exchange').length < 1 ||
        referencedKinds.filter((kind) => kind === 'exchange').length > 2 ||
        referencedKinds.some((kind) => kind !== 'resource' && kind !== 'action' && kind !== 'exchange'))
    )
      return false;
  }
  const exchanges = summary.evidence.filter((entry) => entry.kind === 'exchange');
  const usedRoutes = new Set(exchanges.map((entry) => entry.route));
  if (usedRoutes.size !== routes.size || summary.routes.some((route) => !usedRoutes.has(route))) return false;
  for (const identity of summary.identities) {
    if (
      identity.configured !== (identity.authenticated !== null) ||
      identity.observed !== exchanges.some((entry) => entry.identity === identity.id)
    )
      return false;
  }
  for (const entry of summary.hypotheses) if (!refsExist(entry.evidence)) return false;
  for (const entry of summary.tasks) {
    if (
      !refsExist(entry.evidence) ||
      (entry.identity !== null && !identities.has(entry.identity)) ||
      (entry.hypothesis !== null && !hypotheses.has(entry.hypothesis))
    )
      return false;
  }
  const verifications = new Map(summary.verifications.map((entry) => [entry.id, entry]));
  for (const entry of summary.verifications) {
    if (
      evidence.get(entry.candidate)?.kind !== 'proof' ||
      !refsExist(entry.evidence) ||
      entry.evidence.some((ref) => evidence.get(ref)?.kind !== 'exchange') ||
      new Set(entry.identities).size !== entry.identities.length ||
      entry.identities.some((identity) => !identities.has(identity))
    )
      return false;
  }
  for (const entry of summary.findings) {
    const verifier = verifications.get(entry.verifier);
    if (
      !hypotheses.has(entry.hypothesis) ||
      !identities.has(entry.victim) ||
      !identities.has(entry.attacker) ||
      entry.evidence.length === 0 ||
      !refsExist(entry.evidence) ||
      entry.evidence.some((ref) => evidence.get(ref)?.kind !== 'exchange') ||
      verifier?.verdict !== 'verified' ||
      verifier.evidence.some((ref) => !entry.evidence.includes(ref))
    )
      return false;
  }
  const provenance = summary.provenance;
  if (!provenance.available) {
    if (
      provenance.run !== null ||
      provenance.historyComplete !== null ||
      provenance.currentAttempt !== null ||
      provenance.resultAttempt !== null ||
      provenance.attempts.length !== 0
    )
      return false;
  } else {
    const attempts = new Map(provenance.attempts.map((attempt) => [attempt.id, attempt]));
    if (
      provenance.run !== 'run-1' ||
      provenance.historyComplete === null ||
      provenance.currentAttempt === null ||
      !attempts.has(provenance.currentAttempt) ||
      (provenance.resultAttempt !== null && !attempts.has(provenance.resultAttempt))
    )
      return false;
    const children = new Map<string | null, (typeof provenance.attempts)[number]>();
    for (const attempt of provenance.attempts) {
      if (children.has(attempt.parent) || attempt.availability.endedAt !== (attempt.termination !== null)) return false;
      children.set(attempt.parent, attempt);
    }
    const visited = new Set<string>();
    let current = children.get(null);
    let latest: string | null = null;
    while (current !== undefined && !visited.has(current.id)) {
      visited.add(current.id);
      latest = current.id;
      current = children.get(current.id);
    }
    if (current !== undefined || visited.size !== attempts.size || latest !== provenance.currentAttempt) return false;
    if (provenance.resultAttempt !== null) {
      const result = attempts.get(provenance.resultAttempt);
      if (
        result === undefined ||
        !result.availability.endedAt ||
        result.termination === null ||
        result.termination.source !== 'workflow' ||
        (summary.run.status === 'complete') !== (result.termination.reason === 'completed')
      )
        return false;
    }
  }
  return isDeepStrictEqual(summary.counts, deriveCounts(summary));
}

/** Validates the public allowlist and its internal references without using source evidence. */
export function validateSanitizedArtifacts(files: Readonly<Record<string, string>>): BundleIssue[] {
  const issue = (code: string, file: string, message: string): BundleIssue[] => [{ code, file, message }];
  if (typeof files['report.json'] !== 'string')
    return issue('missing_artifact', 'report.json', 'The sanitized JSON companion is missing.');
  if (typeof files['report.md'] !== 'string')
    return issue('missing_artifact', 'report.md', 'The sanitized Markdown companion is missing.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(files['report.json']);
  } catch {
    return issue('malformed_json', 'report.json', 'The sanitized JSON companion is malformed.');
  }
  if (!shape(parsed))
    return issue(
      'invalid_sanitized_schema',
      'report.json',
      'The sanitized JSON companion does not match the allowlisted schema.',
    );
  const summary = parsed as Summary;
  if (files['report.json'] !== `${JSON.stringify(summary, null, 2)}\n`)
    return issue(
      'noncanonical_sanitized_json',
      'report.json',
      'The sanitized JSON companion is not in canonical form.',
    );
  if (!consistent(summary))
    return issue(
      'inconsistent_sanitized_summary',
      'report.json',
      'The sanitized counts, aliases or references are inconsistent.',
    );
  if (files['report.md'] !== renderMarkdown(summary))
    return issue(
      'inconsistent_sanitized_markdown',
      'report.md',
      'The sanitized Markdown companion does not match the canonical summary.',
    );
  return [];
}
