// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual, promisify } from 'node:util';
import { writePlaywrightStealthConfig } from '../ai/playwright-config-writer.js';
import { redactSensitive } from '../ai/sensitive-redaction.js';
import { AuditSession } from '../audit/index.js';
import { normalizeBlackboxConfig, parseConfig } from '../config-parser.js';
import { createActivityLogger } from '../temporal/activity-logger.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import type {
  BlackboardStore,
  BlackboxActionResult,
  BlackboxRunStatus,
  BlackboxSnapshot,
  BlackboxVerificationAttempt,
  EvidenceRef,
  NormalizedExchange,
  PlannerTask,
  ProofCondition,
  ReplaySequence,
  VerificationResult,
  WorkerContribution,
} from '../types/blackbox.js';
import type { Config, NormalizedBlackboxConfig, SuccessCondition } from '../types/config.js';
import { BlackboxAgentRunner, type RedactedBlackboxSlice, type RedactedIdentityContext } from './agent-runner.js';
import type { PlannerBatch } from './agents.js';
import {
  BLACKBOX_ARTIFACT_NAMES,
  type BlackboxArtifactName,
  publishBlackboxArtifacts,
  renderBlackboxArtifacts,
} from './artifacts.js';
import { FileBlackboardStore } from './blackboard.js';
import {
  BurpMcpClient,
  type BurpMcpSettings,
  type BurpToolClient,
  type HistorySnapshot,
  readTargetHistory,
} from './burp-client.js';
import { collectVerifiedFindings } from './finding-validator.js';
import { type CaptureIndexEntry, FileIdentityStateResolver, type IdentityStateResolver } from './identity-state.js';
import {
  FileReplayRawStore,
  type ReplayOutcome,
  type ReplayRawStore,
  ReplayService,
  type ReplayServiceOptions,
} from './replay-service.js';
import {
  type BlackboxSchedulerSnapshot,
  decideRunCompletion,
  type ScheduledWave,
  validateAndScheduleWave,
} from './scheduler.js';
import { normalizeTargetOrigin } from './scope-guard.js';
import { createBlackboxTools } from './tools.js';
import { diffHistory, normalizeCapturedTraffic, normalizeRawExchange } from './traffic-normalizer.js';

const execFileAsync = promisify(execFile);
const DEFAULT_BURP_MCP_URL = 'http://host.docker.internal:9876';
const DEFAULT_BURP_MCP_HOST_HEADER = '127.0.0.1:9876';
const AUTH_SUCCESS_MARKER = '__SHANNON_AUTH_OK__';
const AUTH_FAILURE_MARKER = '__SHANNON_AUTH_FAILED__';
const SHA256_DIGEST = /^[a-f0-9]{64}$/;

type Awaitable<T> = T | Promise<T>;

export interface BlackboxActivityInput {
  readonly webUrl: string;
  readonly repoPath: '/target' | string;
  readonly configPath: string;
  readonly workspace: string;
  readonly workflowId: string;
  readonly auditDir: string;
  readonly outputPath?: string;
  readonly promptDir?: string;
}

export interface BlackboxWorkerActivityInput extends BlackboxActivityInput {
  readonly task: PlannerTask;
  readonly revision: number;
}

export interface BlackboxVerifierActivityInput extends BlackboxActivityInput {
  readonly candidateId: string;
  readonly revision: number;
}

export interface BlackboxPreflightResult {
  readonly targetOrigin: string;
  readonly targetUrl: string;
  readonly blackboardPath: string;
  readonly revision: number;
  readonly identities: readonly {
    readonly name: string;
    readonly role: string;
    readonly stateRef: string;
  }[];
}

export interface IdentityCaptureResult {
  readonly identity: string;
  readonly authenticated: boolean;
  readonly successEvidence: string | null;
  readonly failureReason: string | null;
  readonly exchangeIds: readonly string[];
  readonly revision: number;
}

export interface BrowserCommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export interface BlackboxFileSystem {
  readFile(filePath: string, encoding: 'utf8'): Promise<string | Buffer>;
  mkdir(directoryPath: string, options: { readonly recursive: true }): Promise<unknown>;
}

interface BlackboxIdentityState extends IdentityStateResolver {
  writeCaptureIndex(identity: string, entries: readonly CaptureIndexEntry[]): Promise<void>;
}

interface BlackboxAgentRunnerLike {
  run: BlackboxAgentRunner['run'];
}

interface BlackboxAuditSessionLike {
  initialize(workflowId?: string): Promise<void>;
}

interface BlackboxReplayServiceLike {
  replay: ReplayService['replay'];
}

export interface BlackboxActivityDependencies {
  readonly parseConfig: (configPath: string, mode: 'blackbox') => Awaitable<Config>;
  readonly createBurpClient: (settings: BurpMcpSettings) => BurpToolClient;
  readonly writePlaywrightConfig: typeof writePlaywrightStealthConfig;
  readonly createBlackboardStore: (repoPath: string) => BlackboardStore;
  readonly runBrowserCommand: (
    file: string,
    arguments_: readonly string[],
    options: { readonly cwd: string },
  ) => Promise<BrowserCommandResult>;
  readonly createAgentRunner: (input: BlackboxActivityInput) => BlackboxAgentRunnerLike;
  readonly createAuditSession: (input: BlackboxActivityInput) => BlackboxAuditSessionLike;
  readonly logger?: ActivityLogger;
  readonly readEnvironment: () => Readonly<Record<string, string | undefined>>;
  readonly fileSystem: BlackboxFileSystem;
  readonly createIdentityStateResolver: (repoPath: string, identities: readonly string[]) => BlackboxIdentityState;
  readonly createReplayRawStore: (repoPath: string) => ReplayRawStore;
  readonly createReplayService: (options: ReplayServiceOptions) => BlackboxReplayServiceLike;
  readonly publishArtifacts: typeof publishBlackboxArtifacts;
}

export type BlackboxWorkflowInput = BlackboxActivityInput;

export interface BlackboxTaskState {
  readonly taskId: string;
  readonly status: PlannerTask['status'];
  readonly identityLease: PlannerTask['identityLease'];
}

export interface RegisterWaveInput extends BlackboxActivityInput {
  readonly revision: number;
  readonly waveNumber: number;
  readonly batch: PlannerBatch;
  readonly wave: ScheduledWave;
  readonly operationKey: string;
}

export interface RegisteredWave {
  readonly revision: number;
  readonly wave: ScheduledWave;
  readonly tasks: readonly BlackboxTaskState[];
}

export interface StartTasksInput extends BlackboxActivityInput {
  readonly revision: number;
  readonly taskIds: readonly string[];
  readonly operationKey: string;
}

export interface TaskTransitionResult {
  readonly revision: number;
  readonly tasks: readonly BlackboxTaskState[];
}

export interface SettleTasksInput extends BlackboxActivityInput {
  readonly baseRevision: number;
  readonly contributions: readonly WorkerContribution[];
  readonly failures: readonly { readonly taskId: string; readonly reason: string }[];
  readonly operationKey: string;
}

export interface SettledTasksResult extends TaskTransitionResult {
  readonly candidateIds: readonly string[];
}

export interface RecordVerificationInput extends BlackboxActivityInput {
  readonly revision: number;
  readonly attempt: BlackboxVerificationAttempt;
  readonly operationKey: string;
}

export interface RecordVerificationFailureInput extends BlackboxActivityInput {
  readonly revision: number;
  readonly candidateId: string;
  readonly reason: string;
  readonly operationKey: string;
}

export interface EvaluateProgressInput extends BlackboxActivityInput {
  readonly revision: number;
  readonly waveNumber: number;
  readonly plannerStop: boolean;
}

export interface EvaluateProgressResult {
  readonly decision: 'continue' | 'complete' | 'incomplete';
  readonly revision: number;
}

export interface FinalizeBlackboxInput extends BlackboxActivityInput {
  readonly revision: number;
  readonly status: Exclude<BlackboxRunStatus, 'running'>;
  readonly failure?: string;
  readonly operationKey: string;
}

export interface BlackboxWorkflowResult {
  readonly status: Exclude<BlackboxRunStatus, 'running'>;
  readonly revision: number;
  readonly failure: string | null;
  readonly verifiedCandidateIds: readonly string[];
  readonly findingCount: number;
  readonly artifactNames: readonly BlackboxArtifactName[];
}

export interface BlackboxActivityApi {
  preflightBlackbox(input: BlackboxActivityInput): Promise<BlackboxPreflightResult>;
  captureAnonymous(input: BlackboxActivityInput): Promise<IdentityCaptureResult>;
  captureIdentity(input: BlackboxActivityInput, identityName: string): Promise<IdentityCaptureResult>;
  readPlannerSnapshot(input: BlackboxActivityInput): Promise<BlackboxSchedulerSnapshot>;
  runBlackboxPlanner(input: BlackboxActivityInput, revision: number): Promise<PlannerBatch>;
  runBlackboxRecon(input: BlackboxWorkerActivityInput): Promise<WorkerContribution>;
  runBlackboxAnalysis(input: BlackboxWorkerActivityInput): Promise<WorkerContribution>;
  runBlackboxAction(input: BlackboxWorkerActivityInput): Promise<WorkerContribution>;
  runBlackboxVerifier(input: BlackboxVerifierActivityInput): Promise<BlackboxVerificationAttempt>;
  registerPlannedWave(input: RegisterWaveInput): Promise<RegisteredWave>;
  startBlackboxTasks(input: StartTasksInput): Promise<TaskTransitionResult>;
  settleBlackboxTasks(input: SettleTasksInput): Promise<SettledTasksResult>;
  recordBlackboxVerification(input: RecordVerificationInput): Promise<number>;
  recordBlackboxVerificationFailure(input: RecordVerificationFailureInput): Promise<number>;
  evaluateBlackboxProgress(input: EvaluateProgressInput): Promise<EvaluateProgressResult>;
  finalizeBlackboxRun(input: FinalizeBlackboxInput): Promise<BlackboxWorkflowResult>;
}

interface TargetContext {
  readonly targetOrigin: string;
  readonly targetUrl: string;
  readonly config: NormalizedBlackboxConfig;
  readonly configuredSecrets: readonly string[];
}

interface RuntimeContext extends TargetContext {
  readonly burpSettings: BurpMcpSettings;
  readonly proxyUrl: string;
}

function productionAuditSession(input: BlackboxActivityInput): AuditSession {
  return new AuditSession({
    id: input.workspace,
    webUrl: input.webUrl,
    repoPath: input.repoPath,
    outputPath: input.auditDir,
  });
}

const DEFAULT_DEPENDENCIES: BlackboxActivityDependencies = {
  parseConfig,
  createBurpClient: (settings) => new BurpMcpClient(settings),
  writePlaywrightConfig: writePlaywrightStealthConfig,
  createBlackboardStore: (repoPath) => new FileBlackboardStore(repoPath),
  async runBrowserCommand(file, arguments_, options) {
    const result = await execFileAsync(file, [...arguments_], { cwd: options.cwd });
    return { stdout: String(result.stdout), stderr: String(result.stderr), exitCode: 0 };
  },
  createAgentRunner: (input) =>
    new BlackboxAgentRunner({
      syntheticRoot: input.repoPath,
      ...(input.promptDir ? { promptDirectory: input.promptDir } : {}),
    }),
  createAuditSession: productionAuditSession,
  readEnvironment: () => process.env,
  fileSystem: fs,
  createIdentityStateResolver: (repoPath, identities) =>
    new FileIdentityStateResolver({ targetRoot: repoPath, identities }),
  createReplayRawStore: (repoPath) => new FileReplayRawStore(rawDirectory(repoPath)),
  createReplayService: (options) => new ReplayService(options),
  publishArtifacts: publishBlackboxArtifacts,
};

function collectStrings(value: unknown, result: string[] = []): string[] {
  if (typeof value === 'string') {
    if (value.length > 0) result.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, result);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, result);
  }
  return result;
}

function stateRef(identity: string): string {
  return `.shannon/blackbox/identities/${identity}/storage-state.json`;
}

function statePath(repoPath: string, identity: string): string {
  return path.resolve(repoPath, '.shannon', 'blackbox', 'identities', identity, 'storage-state.json');
}

function rawDirectory(repoPath: string): string {
  return path.resolve(repoPath, '.shannon', 'blackbox', 'raw');
}

function validateUrl(value: string, label: string, allowedProtocols: ReadonlySet<string>): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (!allowedProtocols.has(parsed.protocol) || parsed.hostname.length === 0 || parsed.username || parsed.password) {
    throw new Error(`${label} is invalid`);
  }
  return parsed;
}

function resolveBurpSettings(environment: Readonly<Record<string, string | undefined>>): {
  readonly settings: BurpMcpSettings;
  readonly proxyUrl: string;
} {
  const proxyUrl = environment.SHANNON_BURP_PROXY_URL?.trim();
  if (!proxyUrl) throw new Error('SHANNON_BURP_PROXY_URL is required for black-box mode');
  validateUrl(proxyUrl, 'SHANNON_BURP_PROXY_URL', new Set(['http:']));

  const url = environment.SHANNON_BURP_MCP_URL?.trim() || DEFAULT_BURP_MCP_URL;
  validateUrl(url, 'SHANNON_BURP_MCP_URL', new Set(['http:', 'https:']));
  const hostHeader = environment.SHANNON_BURP_MCP_HOST_HEADER?.trim() || DEFAULT_BURP_MCP_HOST_HEADER;
  if (/[^\x21-\x7e]/.test(hostHeader) || /[/?#@]/.test(hostHeader)) {
    throw new Error('SHANNON_BURP_MCP_HOST_HEADER is invalid');
  }
  return { settings: { url, hostHeader }, proxyUrl };
}

async function loadTargetContext(
  dependencies: BlackboxActivityDependencies,
  input: BlackboxActivityInput,
): Promise<TargetContext> {
  const parsed = await dependencies.parseConfig(input.configPath, 'blackbox');
  const config = normalizeBlackboxConfig(parsed);
  const target = validateUrl(input.webUrl, 'Target URL', new Set(['http:', 'https:']));
  const targetOrigin = normalizeTargetOrigin(target.href);
  const configuredSecrets = [
    ...new Set(config.identities.flatMap(({ authentication }) => collectStrings(authentication.credentials))),
  ];
  return { targetOrigin, targetUrl: target.href, config, configuredSecrets };
}

async function loadRuntimeContext(
  dependencies: BlackboxActivityDependencies,
  input: BlackboxActivityInput,
): Promise<RuntimeContext> {
  const target = await loadTargetContext(dependencies, input);
  const { settings: burpSettings, proxyUrl } = resolveBurpSettings(dependencies.readEnvironment());
  return { ...target, burpSettings, proxyUrl };
}

function initialization(context: TargetContext) {
  return {
    targetOrigin: context.targetOrigin,
    identities: context.config.identities.map(({ name, role }) => ({
      name,
      role,
      authenticated: false,
      stateRef: stateRef(name),
    })),
    configuredSecrets: context.configuredSecrets,
  };
}

function validateBoardIdentityScope(snapshot: BlackboxSnapshot, context: TargetContext): void {
  const expected = context.config.identities.map(({ name, role }) => ({ name, role, stateRef: stateRef(name) }));
  const observed = snapshot.identities.map(({ name, role, stateRef: ref }) => ({ name, role, stateRef: ref }));
  if (JSON.stringify(observed) !== JSON.stringify(expected)) {
    throw new Error('Existing blackboard identity scope does not match the black-box configuration');
  }
}

function bootstrapTasks(config: NormalizedBlackboxConfig): PlannerTask[] {
  return [
    {
      taskId: 'bootstrap-anonymous',
      kind: 'recon',
      objective: 'Explore the target as a clean anonymous actor and record target-scoped workflows.',
      evidence: [],
      identityLease: 'anonymous',
      hypothesisId: null,
      status: 'pending',
    },
    ...config.identities.map(
      ({ name }): PlannerTask => ({
        taskId: `bootstrap-${name}`,
        kind: 'recon',
        objective: `Authenticate and explore the assigned workflow as identity ${name}.`,
        evidence: [],
        identityLease: name,
        hypothesisId: null,
        status: 'pending',
      }),
    ),
  ];
}

function toRedactedSlice(snapshot: BlackboxSnapshot): RedactedBlackboxSlice {
  return {
    revision: snapshot.revision,
    routes: structuredClone(snapshot.exchanges),
    identities: structuredClone(snapshot.identities),
    resources: structuredClone(snapshot.resources),
    ownershipLinks: snapshot.resources
      .filter(({ ownerIdentity }) => ownerIdentity !== null)
      .map(({ resourceId, ownerIdentity }) => ({ resourceId, ownerIdentity })),
    transitions: structuredClone(snapshot.transitions),
    hypotheses: structuredClone(snapshot.hypotheses),
    actionOutcomes: structuredClone(snapshot.actions),
    candidateProofs: structuredClone(snapshot.candidateProofs),
    verifierFailureReasons: snapshot.verifications
      .filter(({ verdict }) => verdict !== 'verified')
      .map(({ verificationId, candidateId, failureReason }) => ({ verificationId, candidateId, failureReason })),
  };
}

function toSchedulerSnapshot(
  snapshot: BlackboxSnapshot,
  rules: NormalizedBlackboxConfig['rules'],
): BlackboxSchedulerSnapshot {
  return {
    revision: snapshot.revision,
    targetOrigin: snapshot.targetOrigin,
    rules: structuredClone(rules),
    identities: snapshot.identities.map(({ name, authenticated }) => ({ name, authenticated })),
    exchanges: snapshot.exchanges.map(({ exchangeId, origin, path: exchangePath, identity }) => ({
      exchangeId,
      origin,
      path: exchangePath,
      identity,
      inScope: origin === snapshot.targetOrigin,
    })),
    references: [
      ...snapshot.exchanges.map(({ exchangeId }): EvidenceRef => ({ id: exchangeId, kind: 'exchange' })),
      ...snapshot.resources.map(({ resourceId }): EvidenceRef => ({ id: resourceId, kind: 'resource' })),
      ...snapshot.transitions.map(({ transitionId }): EvidenceRef => ({ id: transitionId, kind: 'transition' })),
      ...snapshot.actions.map(({ actionId }): EvidenceRef => ({ id: actionId, kind: 'action' })),
      ...snapshot.candidateProofs.map(({ candidateId }): EvidenceRef => ({ id: candidateId, kind: 'proof' })),
    ],
    hypotheses: snapshot.hypotheses.map(({ hypothesisId, status }) => ({ hypothesisId, status })),
    tasks: snapshot.tasks.map(({ taskId, status, identityLease, hypothesisId }) => ({
      taskId,
      status,
      identityLease,
      hypothesisId,
    })),
    rejectedTaskIds: snapshot.rejectedTasks.map(({ task }) => task.taskId),
  };
}

function callerTools(tools: ReturnType<typeof createBlackboxTools>) {
  return tools.filter(({ name }) => !name.startsWith('submit_'));
}

function authenticationInstructions(
  input: BlackboxActivityInput,
  identity: NormalizedBlackboxConfig['identities'][number],
): string {
  const flow = identity.authentication.login_flow?.map((step, index) => `${index + 1}. ${step}`).join('\n') ?? '';
  return [
    `Use only Playwright session bb-${identity.name}.`,
    `Open ${identity.authentication.login_url} and authenticate as the assigned identity.`,
    `Login type: ${identity.authentication.login_type}.`,
    ...(flow ? ['Configured login flow:', flow] : []),
    `Verify ${identity.authentication.success_condition.type}: ${identity.authentication.success_condition.value}.`,
    `Explore the authenticated application at ${input.webUrl}.`,
    `Save browser state with: playwright-cli -s=bb-${identity.name} state-save ${statePath(input.repoPath, identity.name)}`,
  ].join('\n');
}

function anonymousInstructions(input: BlackboxActivityInput): string {
  return [
    'Use only the clean Playwright session bb-anonymous.',
    `Open ${input.webUrl} without loading storage state or authenticating.`,
    'Explore the reachable anonymous workflow and submit only observed evidence.',
  ].join('\n');
}

function restoredIdentityInstructions(input: BlackboxActivityInput, identityName: string): string {
  return [
    `Use only the restored Playwright session bb-${identityName}.`,
    `The activity loaded the captured state for identity ${identityName} and opened ${input.webUrl}.`,
    'Exercise only the assigned workflow. Do not authenticate as another identity or replace the saved state.',
  ].join('\n');
}

function successExpression(condition: SuccessCondition): string {
  const value = JSON.stringify(condition.value);
  let predicate: string;
  switch (condition.type) {
    case 'url_contains':
      predicate = `location.href.includes(${value})`;
      break;
    case 'url_equals_exactly':
      predicate = `location.href === ${value}`;
      break;
    case 'element_present':
      predicate = `document.querySelector(${value}) !== null`;
      break;
    case 'text_contains':
      predicate = `(document.body?.innerText ?? '').includes(${value})`;
      break;
  }
  return `(${predicate}) ? '${AUTH_SUCCESS_MARKER}' : '${AUTH_FAILURE_MARKER}'`;
}

function previewTraffic(
  before: HistorySnapshot,
  after: HistorySnapshot,
  context: TargetContext,
  identity: string | 'anonymous',
  taskId: string,
  baseRevision: number,
  captureSequenceOffset: number,
): readonly NormalizedExchange[] {
  return diffHistory(before, after)
    .map((raw, index) =>
      normalizeRawExchange({
        targetOrigin: context.targetOrigin,
        rules: context.config.rules,
        identity,
        raw,
        captureSequence: captureSequenceOffset + index + 1,
        configuredSecrets: context.configuredSecrets,
        provenance: { actor: 'blackbox-recon', taskId, baseRevision },
      }),
    )
    .filter((exchange): exchange is NormalizedExchange => exchange !== null);
}

function safeSuccessEvidence(value: string, configuredSecrets: readonly string[]): string {
  return String(
    redactSensitive(value, {
      sensitiveValues: configuredSecrets,
      redactAuthenticationSyntax: true,
    }),
  );
}

function replaySequence(task: PlannerTask, actionId = task.taskId): ReplaySequence {
  if (task.kind !== 'action' || !task.replayPlan)
    throw new Error(`Action task ${task.taskId} has no approved replay plan`);
  return { actionId, ...structuredClone(task.replayPlan) };
}

function actionStatus(outcome: ReplayOutcome): BlackboxActionResult['status'] {
  return outcome.status === 'precondition_failed' ? 'failed' : outcome.status;
}

function replayExchanges(outcome: ReplayOutcome): readonly NormalizedExchange[] {
  return outcome.status === 'completed' || outcome.status === 'precondition_failed' ? outcome.exchanges : [];
}

function replayObservation(outcome: ReplayOutcome): BlackboxActionResult['observation'] {
  return outcome.status === 'completed' || outcome.status === 'precondition_failed' ? outcome.observation : null;
}

function supportsFindingCandidate(
  observation: BlackboxActionResult['observation'],
  condition: ProofCondition,
  finalExchangeId: string | undefined,
): boolean {
  if (
    !observation?.passed ||
    !finalExchangeId ||
    observation.verificationExchangeId !== finalExchangeId ||
    observation.baselinePassed !== (condition.type !== 'persistent_state') ||
    observation.controlPassed !== false ||
    !observation.controlExchangeIds ||
    new Set(observation.controlExchangeIds).size !== observation.controlExchangeIds.length ||
    !isDeepStrictEqual(observation.condition, condition) ||
    typeof observation.proofSourceRequestDigest !== 'string' ||
    typeof observation.proofSentRequestDigest !== 'string' ||
    !SHA256_DIGEST.test(observation.proofSourceRequestDigest) ||
    observation.proofSourceRequestDigest !== observation.proofSentRequestDigest ||
    typeof observation.observedMarkerDigest !== 'string' ||
    !SHA256_DIGEST.test(observation.observedMarkerDigest) ||
    observation.observedTransitionId !== null
  ) {
    return false;
  }
  return typeof observation.baselineExchangeId === 'string' && observation.baselineExchangeId.length > 0;
}

function captureSequenceOffset(exchanges: readonly NormalizedExchange[], identity: string): number {
  return exchanges.reduce(
    (maximum, exchange) => (exchange.identity === identity ? Math.max(maximum, exchange.captureSequence) : maximum),
    0,
  );
}

function taskStates(snapshot: BlackboxSnapshot): readonly BlackboxTaskState[] {
  return snapshot.tasks.map(({ taskId, status, identityLease }) => ({ taskId, status, identityLease }));
}

function verificationExecutionId(candidateId: string): string {
  return `verify_${createHash('sha256').update(candidateId).digest('hex').slice(0, 24)}`;
}

type ModelRecordKind = 'task' | 'resource' | 'transition' | 'hypothesis' | 'candidate';

function namespacedRecordId(kind: ModelRecordKind, namespace: string, submittedId: string): string {
  const digest = createHash('sha256').update(`${namespace}\0${kind}\0${submittedId}`).digest('hex').slice(0, 24);
  return `${kind}_${digest}`;
}

function namespacePlannerBatch(batch: PlannerBatch, revision: number): PlannerBatch {
  const namespace = `revision-${revision}`;
  return {
    ...batch,
    baseRevision: revision,
    tasks: batch.tasks.map((task) => ({
      ...task,
      taskId: namespacedRecordId('task', namespace, task.taskId),
      status: 'pending',
    })),
  };
}

function namespaceContributionRecords(contribution: WorkerContribution, taskId: string): WorkerContribution {
  const resourceIds = new Map(
    (contribution.resources ?? []).map(({ resourceId }) => [
      resourceId,
      namespacedRecordId('resource', taskId, resourceId),
    ]),
  );
  const transitionIds = new Map(
    (contribution.transitions ?? []).map(({ transitionId }) => [
      transitionId,
      namespacedRecordId('transition', taskId, transitionId),
    ]),
  );
  const hypothesisIds = new Map(
    (contribution.hypotheses ?? []).map(({ hypothesisId }) => [
      hypothesisId,
      namespacedRecordId('hypothesis', taskId, hypothesisId),
    ]),
  );
  const candidateIds = new Map(
    (contribution.candidateProofs ?? []).map(({ candidateId }) => [
      candidateId,
      namespacedRecordId('candidate', taskId, candidateId),
    ]),
  );
  const remapEvidence = (evidence: EvidenceRef): EvidenceRef => {
    const ids =
      evidence.kind === 'resource'
        ? resourceIds
        : evidence.kind === 'transition'
          ? transitionIds
          : evidence.kind === 'proof'
            ? candidateIds
            : null;
    return ids?.has(evidence.id) ? { ...evidence, id: ids.get(evidence.id) as string } : evidence;
  };

  return {
    ...contribution,
    ...(contribution.resources
      ? {
          resources: contribution.resources.map((resource) => ({
            ...resource,
            resourceId: resourceIds.get(resource.resourceId) as string,
            evidence: resource.evidence.map(remapEvidence),
          })),
        }
      : {}),
    ...(contribution.transitions
      ? {
          transitions: contribution.transitions.map((transition) => ({
            ...transition,
            transitionId: transitionIds.get(transition.transitionId) as string,
            resourceId: transition.resourceId
              ? (resourceIds.get(transition.resourceId) ?? transition.resourceId)
              : null,
          })),
        }
      : {}),
    ...(contribution.hypotheses
      ? {
          hypotheses: contribution.hypotheses.map((hypothesis) => ({
            ...hypothesis,
            hypothesisId: hypothesisIds.get(hypothesis.hypothesisId) as string,
            evidence: hypothesis.evidence.map(remapEvidence),
          })),
        }
      : {}),
    ...(contribution.candidateProofs
      ? {
          candidateProofs: contribution.candidateProofs.map((candidate) => ({
            ...candidate,
            candidateId: candidateIds.get(candidate.candidateId) as string,
            hypothesisId: hypothesisIds.get(candidate.hypothesisId) ?? candidate.hypothesisId,
            victimResourceId: resourceIds.get(candidate.victimResourceId) ?? candidate.victimResourceId,
          })),
        }
      : {}),
  };
}

function verificationRoot(repoPath: string, verificationId: string): string {
  return path.resolve(repoPath, '.shannon', 'blackbox', 'verification-runs', verificationId);
}

function verificationStateRef(verificationId: string, identity: string): string {
  return `.shannon/blackbox/verification-runs/${verificationId}/.shannon/blackbox/identities/${identity}/storage-state.json`;
}

function verificationLoginTask(verificationId: string, identity: string): PlannerTask {
  return {
    taskId: `verify_login_${createHash('sha256').update(`${verificationId}\0${identity}`).digest('hex').slice(0, 24)}`,
    kind: 'recon',
    objective: `Create fresh isolated verifier state for identity ${identity} and save it without exploring other workflows.`,
    evidence: [],
    identityLease: identity,
    hypothesisId: null,
    status: 'running',
  };
}

function verificationLoginInstructions(
  identity: NormalizedBlackboxConfig['identities'][number],
  session: string,
  storagePath: string,
): string {
  const flow = identity.authentication.login_flow?.map((step, index) => `${index + 1}. ${step}`).join('\n') ?? '';
  return [
    `Use only Playwright session ${session}.`,
    `Open ${identity.authentication.login_url} and authenticate as ${identity.name}.`,
    `Login type: ${identity.authentication.login_type}.`,
    ...(flow ? ['Configured login flow:', flow] : []),
    `Verify ${identity.authentication.success_condition.type}: ${identity.authentication.success_condition.value}.`,
    `Save browser state with: playwright-cli -s=${session} state-save ${storagePath}`,
    'Do not authenticate as any other identity.',
  ].join('\n');
}

async function assertStorageState(fileSystem: BlackboxFileSystem, filePath: string, identity: string): Promise<void> {
  const rawState = String(await fileSystem.readFile(filePath, 'utf8'));
  const parsedState = JSON.parse(rawState) as unknown;
  if (
    !parsedState ||
    typeof parsedState !== 'object' ||
    !Array.isArray((parsedState as Record<string, unknown>).cookies) ||
    !Array.isArray((parsedState as Record<string, unknown>).origins)
  ) {
    throw new Error(`Identity ${identity} produced an invalid storage-state file`);
  }
}

function safeFailureReason(reason: unknown, configuredSecrets: readonly string[]): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  return String(
    redactSensitive(message, {
      sensitiveValues: configuredSecrets,
      redactAuthenticationSyntax: true,
    }),
  ).slice(0, 500);
}

export function createBlackboxActivities(supplied: Partial<BlackboxActivityDependencies> = {}): BlackboxActivityApi {
  const dependencies: BlackboxActivityDependencies = { ...DEFAULT_DEPENDENCIES, ...supplied };
  const activityLogger = (): ActivityLogger => dependencies.logger ?? createActivityLogger();
  const closeBurpClient = async (client: BurpToolClient): Promise<void> => {
    try {
      await client.close();
    } catch (error) {
      activityLogger().warn('Unable to close Burp MCP client', {
        error: error instanceof Error ? error.name : 'unknown',
      });
    }
  };

  const initializeStore = async (input: BlackboxActivityInput, context: TargetContext) => {
    const store = dependencies.createBlackboardStore(input.repoPath);
    const snapshot = await store.initialize(initialization(context));
    validateBoardIdentityScope(snapshot, context);
    return { store, snapshot };
  };

  const preflightBlackbox = async (input: BlackboxActivityInput): Promise<BlackboxPreflightResult> => {
    const context = await loadRuntimeContext(dependencies, input);
    const client = dependencies.createBurpClient(context.burpSettings);
    try {
      await client.connect();
      await dependencies.writePlaywrightConfig(input.repoPath, {
        proxyUrl: context.proxyUrl,
        ignoreHTTPSErrors: true,
        overwrite: true,
      });
      const before = await readTargetHistory(client, context.targetOrigin, context.config.rules);
      try {
        await dependencies.runBrowserCommand('playwright-cli', ['-s=blackbox-preflight', 'open', context.targetUrl], {
          cwd: input.repoPath,
        });
      } finally {
        await dependencies.runBrowserCommand('playwright-cli', ['-s=blackbox-preflight', 'close'], {
          cwd: input.repoPath,
        });
      }
      const after = await readTargetHistory(client, context.targetOrigin, context.config.rules);
      if (diffHistory(before, after).length === 0) {
        throw new Error('Proxied browser navigation produced no target-origin Burp history');
      }

      const { store, snapshot: initialized } = await initializeStore(input, context);
      const expected = bootstrapTasks(context.config);
      const existing = new Map(initialized.tasks.map((task) => [task.taskId, task]));
      for (const task of expected) {
        const current = existing.get(task.taskId);
        if (
          current &&
          (current.kind !== task.kind || current.identityLease !== task.identityLease || current.hypothesisId !== null)
        ) {
          throw new Error(`Existing bootstrap task ${task.taskId} does not match the configured identity scope`);
        }
      }
      const missing = expected.filter(({ taskId }) => !existing.has(taskId));
      const snapshot =
        missing.length === 0
          ? initialized
          : await store.registerTasks(initialized.revision, {
              operationKey: `${input.workflowId}:0:register-bootstrap:${missing.map(({ taskId }) => taskId).join(',')}`,
              accepted: missing,
              rejected: [],
            });
      return {
        targetOrigin: context.targetOrigin,
        targetUrl: context.targetUrl,
        blackboardPath: path.resolve(input.repoPath, '.shannon', 'blackbox', 'blackboard.json'),
        revision: snapshot.revision,
        identities: snapshot.identities.map(({ name, role, stateRef: ref }) => {
          if (!ref) throw new Error(`Identity ${name} has no state reference`);
          return { name, role, stateRef: ref };
        }),
      };
    } finally {
      await closeBurpClient(client);
    }
  };

  const captureActor = async (
    input: BlackboxActivityInput,
    actor: string | 'anonymous',
  ): Promise<IdentityCaptureResult> => {
    const context = await loadRuntimeContext(dependencies, input);
    const identity =
      actor === 'anonymous' ? null : (context.config.identities.find(({ name }) => name === actor) ?? null);
    if (actor !== 'anonymous' && !identity) throw new Error(`Unknown black-box identity ${actor}`);

    const { store, snapshot } = await initializeStore(input, context);
    const taskId = `bootstrap-${actor}`;
    const task = snapshot.tasks.find((candidate) => candidate.taskId === taskId);
    if (!task) throw new Error(`Missing bootstrap task ${taskId}; run preflight first`);
    if (task.status !== 'pending') throw new Error(`Bootstrap task ${taskId} is ${task.status}, not pending`);
    if (task.kind !== 'recon' || task.identityLease !== actor || task.hypothesisId !== null) {
      throw new Error(`Bootstrap task ${taskId} does not match identity ${actor}`);
    }

    const client = dependencies.createBurpClient(context.burpSettings);
    let started: BlackboxSnapshot | null = null;
    let taskSettled = false;
    const session = `bb-${actor}`;
    try {
      await client.connect();
      started = await store.startTasks(snapshot.revision, `${input.workflowId}:0:start:${taskId}`, [taskId]);
      const runningTask = started.tasks.find((candidate) => candidate.taskId === taskId);
      if (!runningTask || runningTask.status !== 'running') throw new Error(`Bootstrap task ${taskId} did not start`);
      const before = await readTargetHistory(client, context.targetOrigin, context.config.rules);
      let after: HistorySnapshot;
      let submitted: WorkerContribution | null = null;
      let submissionFailure: unknown = null;
      try {
        const auditSession = dependencies.createAuditSession(input);
        await auditSession.initialize(input.workflowId);
        const tools = callerTools(
          createBlackboxTools({
            role: 'blackbox-recon',
            readTargetHistory: async () => {
              const current = await readTargetHistory(client, context.targetOrigin, context.config.rules);
              return previewTraffic(
                before,
                current,
                context,
                actor,
                taskId,
                started?.revision ?? 0,
                captureSequenceOffset(snapshot.exchanges, actor),
              );
            },
          }),
        );
        const identityContext: RedactedIdentityContext = identity
          ? {
              name: identity.name,
              role: identity.role,
              loginInstructions: authenticationInstructions(input, identity),
              credentials: structuredClone(identity.authentication.credentials) as unknown as Readonly<
                Record<string, unknown>
              >,
              sensitiveValues: context.configuredSecrets,
            }
          : {
              name: 'anonymous',
              role: 'unauthenticated',
              loginInstructions: anonymousInstructions(input),
              sensitiveValues: context.configuredSecrets,
            };
        submitted = (await dependencies.createAgentRunner(input).run({
          kind: 'blackbox-recon',
          targetOrigin: context.targetOrigin,
          task: runningTask,
          snapshot: toRedactedSlice(started),
          identity: identityContext,
          customTools: tools,
          auditSession: auditSession as AuditSession,
          logger: activityLogger(),
        })) as WorkerContribution;
      } catch (error) {
        submissionFailure = error;
        activityLogger().warn(`Recon model failed after browsing as ${actor}; preserving attributable traffic`, {
          error: error instanceof Error ? error.name : 'unknown',
        });
      } finally {
        after = await readTargetHistory(client, context.targetOrigin, context.config.rules);
      }

      let successEvidence: string | null = null;
      if (identity) {
        const storagePath = statePath(input.repoPath, identity.name);
        await dependencies.runBrowserCommand('playwright-cli', [`-s=${session}`, 'state-save', storagePath], {
          cwd: input.repoPath,
        });
        const rawState = String(await dependencies.fileSystem.readFile(storagePath, 'utf8'));
        const parsedState = JSON.parse(rawState) as unknown;
        if (
          !parsedState ||
          typeof parsedState !== 'object' ||
          !Array.isArray((parsedState as Record<string, unknown>).cookies) ||
          !Array.isArray((parsedState as Record<string, unknown>).origins)
        ) {
          throw new Error(`Identity ${identity.name} produced an invalid storage-state file`);
        }
        const checked = await dependencies.runBrowserCommand(
          'playwright-cli',
          [`-s=${session}`, 'eval', successExpression(identity.authentication.success_condition)],
          { cwd: input.repoPath },
        );
        if (!checked.stdout.includes(AUTH_SUCCESS_MARKER) || checked.stdout.includes(AUTH_FAILURE_MARKER)) {
          throw new Error(`Identity ${identity.name} did not satisfy its configured success condition`);
        }
        successEvidence = safeSuccessEvidence(
          identity.authentication.success_condition.value,
          context.configuredSecrets,
        );
      }

      const exchanges = await normalizeCapturedTraffic({
        targetOrigin: context.targetOrigin,
        rules: context.config.rules,
        identity: actor,
        before,
        after,
        rawDirectory: rawDirectory(input.repoPath),
        configuredSecrets: context.configuredSecrets,
        provenance: { actor: 'blackbox-recon', taskId, baseRevision: started.revision },
        captureSequenceOffset: captureSequenceOffset(snapshot.exchanges, actor),
      });
      if (submissionFailure && exchanges.length === 0) throw submissionFailure;
      if (exchanges.length === 0) throw new Error(`Identity ${actor} produced no attributable target traffic`);

      if (identity) {
        const resolver = dependencies.createIdentityStateResolver(
          input.repoPath,
          context.config.identities.map(({ name }) => name),
        );
        await resolver.writeCaptureIndex(
          identity.name,
          exchanges.map(({ exchangeId, routeSignature, captureSequence }) => ({
            exchangeId,
            routeSignature,
            captureSequence,
          })),
        );
      }

      const namespaced = submitted ? namespaceContributionRecords(submitted, taskId) : null;
      const contribution: WorkerContribution = {
        taskId,
        role: 'blackbox-recon',
        baseRevision: started.revision,
        exchanges,
        ...(namespaced?.resources ? { resources: namespaced.resources } : {}),
        ...(namespaced?.transitions ? { transitions: namespaced.transitions } : {}),
      };
      const settled = await store.settleTasks({
        operationKey: `${input.workflowId}:0:settle:${taskId}`,
        baseRevision: started.revision,
        contributions: [contribution],
        failures: [],
        ...(identity ? { identityCaptures: [{ identity: identity.name, stateRef: stateRef(identity.name) }] } : {}),
      });
      taskSettled = true;
      return {
        identity: actor,
        authenticated: identity !== null,
        successEvidence,
        failureReason: null,
        exchangeIds: exchanges.map(({ exchangeId }) => exchangeId),
        revision: settled.revision,
      };
    } catch (error) {
      if (!started) throw error;
      if (taskSettled) throw new Error(`Black-box ${actor} capture could not be committed`);
      const failed = await store.settleTasks({
        operationKey: `${input.workflowId}:0:settle-failed:${taskId}`,
        baseRevision: started.revision,
        contributions: [],
        failures: [{ taskId, reason: 'identity capture failed' }],
      });
      return {
        identity: actor,
        authenticated: false,
        successEvidence: null,
        failureReason: actor === 'anonymous' ? 'anonymous capture failed' : 'identity capture failed',
        exchangeIds: [],
        revision: failed.revision,
      };
    } finally {
      try {
        await dependencies.runBrowserCommand('playwright-cli', [`-s=${session}`, 'close'], { cwd: input.repoPath });
      } catch (error) {
        activityLogger().warn(`Unable to close Playwright session ${session}`, {
          error: error instanceof Error ? error.name : 'unknown',
        });
      }
      await closeBurpClient(client);
    }
  };

  const readPlannerSnapshot = async (input: BlackboxActivityInput): Promise<BlackboxSchedulerSnapshot> => {
    const context = await loadTargetContext(dependencies, input);
    const { snapshot } = await initializeStore(input, context);
    return toSchedulerSnapshot(snapshot, context.config.rules);
  };

  const runBlackboxPlanner = async (input: BlackboxActivityInput, revision: number): Promise<PlannerBatch> => {
    const context = await loadTargetContext(dependencies, input);
    const { snapshot } = await initializeStore(input, context);
    if (snapshot.revision !== revision) throw new Error('Planner activity received a stale blackboard revision');
    const auditSession = dependencies.createAuditSession(input);
    await auditSession.initialize(input.workflowId);
    const submitted = (await dependencies.createAgentRunner(input).run({
      kind: 'planner',
      targetOrigin: context.targetOrigin,
      task: null,
      snapshot: toRedactedSlice(snapshot),
      identity: null,
      customTools: [],
      auditSession: auditSession as AuditSession,
      logger: activityLogger(),
    })) as PlannerBatch;
    return namespacePlannerBatch(submitted, revision);
  };

  const runReconActivity = async (input: BlackboxWorkerActivityInput): Promise<WorkerContribution> => {
    const context = await loadRuntimeContext(dependencies, input);
    const { snapshot } = await initializeStore(input, context);
    if (snapshot.revision !== input.revision) throw new Error('blackbox-recon received a stale blackboard revision');
    const persistedTask = snapshot.tasks.find(({ taskId }) => taskId === input.task.taskId);
    if (!persistedTask || persistedTask.status !== 'running') throw new Error('blackbox-recon task is not running');
    if (persistedTask.kind !== 'recon') throw new Error('blackbox-recon requires a running recon task kind');
    const actor = persistedTask.identityLease;
    if (!actor) throw new Error('blackbox-recon requires an identity lease');
    const identity =
      actor === 'anonymous' ? null : (context.config.identities.find(({ name }) => name === actor) ?? null);
    if (actor !== 'anonymous' && !identity) throw new Error(`Unknown black-box identity ${actor}`);

    const client = dependencies.createBurpClient(context.burpSettings);
    await client.connect();
    const session = `bb-${actor}`;
    try {
      if (identity) {
        await dependencies.runBrowserCommand(
          'playwright-cli',
          [`-s=${session}`, 'state-load', statePath(input.repoPath, identity.name)],
          { cwd: input.repoPath },
        );
      }
      await dependencies.runBrowserCommand('playwright-cli', [`-s=${session}`, 'open', context.targetUrl], {
        cwd: input.repoPath,
      });
      if (identity) {
        const checked = await dependencies.runBrowserCommand(
          'playwright-cli',
          [`-s=${session}`, 'eval', successExpression(identity.authentication.success_condition)],
          { cwd: input.repoPath },
        );
        if (!checked.stdout.includes(AUTH_SUCCESS_MARKER) || checked.stdout.includes(AUTH_FAILURE_MARKER)) {
          throw new Error(`Captured state for identity ${identity.name} no longer satisfies its success condition`);
        }
      }

      const before = await readTargetHistory(client, context.targetOrigin, context.config.rules);
      const tools = callerTools(
        createBlackboxTools({
          role: 'blackbox-recon',
          readTargetHistory: async () => {
            const current = await readTargetHistory(client, context.targetOrigin, context.config.rules);
            return previewTraffic(
              before,
              current,
              context,
              actor,
              persistedTask.taskId,
              input.revision,
              captureSequenceOffset(snapshot.exchanges, actor),
            );
          },
        }),
      );
      const auditSession = dependencies.createAuditSession(input);
      await auditSession.initialize(input.workflowId);
      let after: HistorySnapshot;
      let submitted: WorkerContribution | null = null;
      let submissionFailure: unknown = null;
      try {
        submitted = (await dependencies.createAgentRunner(input).run({
          kind: 'blackbox-recon',
          targetOrigin: context.targetOrigin,
          task: persistedTask,
          snapshot: toRedactedSlice(snapshot),
          identity: identity
            ? {
                name: identity.name,
                role: identity.role,
                loginInstructions: restoredIdentityInstructions(input, identity.name),
                sensitiveValues: context.configuredSecrets,
              }
            : {
                name: 'anonymous',
                role: 'unauthenticated',
                loginInstructions: anonymousInstructions(input),
                sensitiveValues: context.configuredSecrets,
              },
          customTools: tools,
          auditSession: auditSession as AuditSession,
          logger: activityLogger(),
        })) as WorkerContribution;
      } catch (error) {
        submissionFailure = error;
        activityLogger().warn(
          `Recon model failed after task ${persistedTask.taskId}; preserving attributable traffic`,
          {
            error: error instanceof Error ? error.name : 'unknown',
          },
        );
      } finally {
        after = await readTargetHistory(client, context.targetOrigin, context.config.rules);
      }
      if (identity) {
        const checked = await dependencies.runBrowserCommand(
          'playwright-cli',
          [`-s=${session}`, 'eval', successExpression(identity.authentication.success_condition)],
          { cwd: input.repoPath },
        );
        if (!checked.stdout.includes(AUTH_SUCCESS_MARKER) || checked.stdout.includes(AUTH_FAILURE_MARKER)) {
          throw new Error(`Captured state for identity ${identity.name} is no longer authenticated`);
        }
        await dependencies.runBrowserCommand(
          'playwright-cli',
          [`-s=${session}`, 'state-save', statePath(input.repoPath, identity.name)],
          { cwd: input.repoPath },
        );
      }
      const exchanges = await normalizeCapturedTraffic({
        targetOrigin: context.targetOrigin,
        rules: context.config.rules,
        identity: actor,
        before,
        after,
        rawDirectory: rawDirectory(input.repoPath),
        configuredSecrets: context.configuredSecrets,
        provenance: { actor: 'blackbox-recon', taskId: persistedTask.taskId, baseRevision: input.revision },
        captureSequenceOffset: captureSequenceOffset(snapshot.exchanges, actor),
      });
      if (submissionFailure && exchanges.length === 0) throw submissionFailure;
      if (identity && exchanges.length > 0) {
        const resolver = dependencies.createIdentityStateResolver(
          input.repoPath,
          context.config.identities.map(({ name }) => name),
        );
        const indexed = new Map(
          [...snapshot.exchanges.filter(({ identity: owner }) => owner === identity.name), ...exchanges].map(
            (exchange) => [exchange.exchangeId, exchange],
          ),
        );
        await resolver.writeCaptureIndex(
          identity.name,
          [...indexed.values()].map(({ exchangeId, routeSignature, captureSequence }) => ({
            exchangeId,
            routeSignature,
            captureSequence,
          })),
        );
      }
      const namespaced = submitted ? namespaceContributionRecords(submitted, persistedTask.taskId) : null;
      return {
        taskId: persistedTask.taskId,
        role: 'blackbox-recon',
        baseRevision: input.revision,
        exchanges,
        ...(namespaced?.resources ? { resources: namespaced.resources } : {}),
        ...(namespaced?.transitions ? { transitions: namespaced.transitions } : {}),
      };
    } finally {
      try {
        await dependencies.runBrowserCommand('playwright-cli', [`-s=${session}`, 'close'], { cwd: input.repoPath });
      } catch (error) {
        activityLogger().warn(`Unable to close Playwright session ${session}`, {
          error: error instanceof Error ? error.name : 'unknown',
        });
      }
      await closeBurpClient(client);
    }
  };

  const runActionActivity = async (input: BlackboxWorkerActivityInput): Promise<WorkerContribution> => {
    const context = await loadRuntimeContext(dependencies, input);
    const { snapshot } = await initializeStore(input, context);
    if (snapshot.revision !== input.revision) throw new Error('blackbox-action received a stale blackboard revision');
    const task = snapshot.tasks.find(({ taskId }) => taskId === input.task.taskId);
    if (!task || task.status !== 'running') throw new Error('blackbox-action task is not running');
    if (task.kind !== 'action' || !task.replayPlan) {
      throw new Error('blackbox-action requires a running action task with an approved replay plan');
    }
    if (!task.hypothesisId) throw new Error('blackbox-action requires a linked hypothesis');
    const sequence = replaySequence(task);
    const actors = [...new Set(sequence.steps.map(({ actor }) => actor))];
    const knownIdentities = context.config.identities.map(({ name }) => name);
    const identityState = dependencies.createIdentityStateResolver(input.repoPath, knownIdentities);
    const client = dependencies.createBurpClient(context.burpSettings);
    const sessions = actors.map((actor) => ({ actor, session: `bb-action-${task.taskId}-${actor}` }));
    const dynamicExchanges: NormalizedExchange[] = [];
    let outcome: ReplayOutcome | null = null;
    let requestedFreshActor: string | 'anonymous' | null = null;

    try {
      await client.connect();
      for (const { actor, session } of sessions) {
        const identity = context.config.identities.find(({ name }) => name === actor);
        if (actor !== 'anonymous' && !identity) throw new Error(`Unknown replay actor ${actor}`);
        if (identity) {
          await dependencies.runBrowserCommand(
            'playwright-cli',
            [`-s=${session}`, 'state-load', statePath(input.repoPath, identity.name)],
            { cwd: input.repoPath },
          );
        }
        await dependencies.runBrowserCommand('playwright-cli', [`-s=${session}`, 'open', context.targetUrl], {
          cwd: input.repoPath,
        });
        if (identity) {
          const checked = await dependencies.runBrowserCommand(
            'playwright-cli',
            [`-s=${session}`, 'eval', successExpression(identity.authentication.success_condition)],
            { cwd: input.repoPath },
          );
          if (!checked.stdout.includes(AUTH_SUCCESS_MARKER) || checked.stdout.includes(AUTH_FAILURE_MARKER)) {
            throw new Error(`Captured state for replay actor ${identity.name} is no longer authenticated`);
          }
        }
      }

      let historyCheckpoint = await readTargetHistory(client, context.targetOrigin, context.config.rules);
      const executeApprovedReplay = async (): Promise<ReplayOutcome> => {
        for (const { actor, session } of sessions) {
          if (actor === 'anonymous') continue;
          await dependencies.runBrowserCommand(
            'playwright-cli',
            [`-s=${session}`, 'state-save', statePath(input.repoPath, actor)],
            { cwd: input.repoPath },
          );
        }
        const currentHistory = await readTargetHistory(client, context.targetOrigin, context.config.rules);
        if (requestedFreshActor) {
          const captured = await normalizeCapturedTraffic({
            targetOrigin: context.targetOrigin,
            rules: context.config.rules,
            identity: requestedFreshActor,
            before: historyCheckpoint,
            after: currentHistory,
            rawDirectory: rawDirectory(input.repoPath),
            configuredSecrets: context.configuredSecrets,
            provenance: { actor: 'blackbox-action', taskId: task.taskId, baseRevision: input.revision },
            captureSequenceOffset: captureSequenceOffset(
              [...snapshot.exchanges, ...dynamicExchanges],
              requestedFreshActor,
            ),
          });
          dynamicExchanges.push(...captured);
          if (requestedFreshActor !== 'anonymous' && captured.length > 0) {
            const indexed = new Map(
              [
                ...snapshot.exchanges.filter(({ identity }) => identity === requestedFreshActor),
                ...dynamicExchanges.filter(({ identity }) => identity === requestedFreshActor),
              ].map((exchange) => [exchange.exchangeId, exchange]),
            );
            await identityState.writeCaptureIndex(
              requestedFreshActor,
              [...indexed.values()].map(({ exchangeId, routeSignature, captureSequence }) => ({
                exchangeId,
                routeSignature,
                captureSequence,
              })),
            );
          }
        }
        historyCheckpoint = currentHistory;
        const replay = dependencies.createReplayService({
          targetOrigin: context.targetOrigin,
          rules: context.config.rules,
          configuredSecrets: context.configuredSecrets,
          exchanges: [...snapshot.exchanges, ...dynamicExchanges],
          client,
          rawStore: dependencies.createReplayRawStore(input.repoPath),
          identityState,
          provenance: { actor: 'blackbox-action', taskId: task.taskId, baseRevision: input.revision },
        });
        const replayOutcome = await replay.replay(sequence);
        outcome = replayOutcome;
        requestedFreshActor = null;
        if (replayOutcome.status === 'needs_fresh_actor_request') {
          const step = sequence.steps.find(({ stepId }) => stepId === replayOutcome.stepId);
          if (step) requestedFreshActor = step.actor;
          else {
            const proofCondition = sequence.proofCondition;
            if (proofCondition.type !== 'persistent_state') return replayOutcome;
            requestedFreshActor =
              snapshot.exchanges.find(({ exchangeId }) => exchangeId === proofCondition.verificationSourceExchangeId)
                ?.identity ?? null;
          }
        }
        return replayOutcome;
      };

      const tools = callerTools(
        createBlackboxTools({
          role: 'blackbox-action',
          task,
          replayTargetRequest: executeApprovedReplay,
        }),
      );
      const auditSession = dependencies.createAuditSession(input);
      await auditSession.initialize(input.workflowId);
      let submitted: WorkerContribution | null = null;
      try {
        submitted = (await dependencies.createAgentRunner(input).run({
          kind: 'blackbox-action',
          targetOrigin: context.targetOrigin,
          task,
          snapshot: toRedactedSlice(snapshot),
          identity: {
            name: task.identityLease ?? 'anonymous',
            role: 'approved replay actor',
            loginInstructions: [
              'Use only the preloaded action sessions listed below.',
              ...sessions.map(({ actor, session }) => `${actor}: playwright-cli -s=${session}`),
              'If replay requests a fresh actor request, exercise only the returned route in that actor session, then retry once.',
            ].join('\n'),
            sensitiveValues: context.configuredSecrets,
          },
          customTools: tools,
          auditSession: auditSession as AuditSession,
          logger: activityLogger(),
        })) as WorkerContribution;
      } catch (error) {
        if (!outcome) throw error;
        activityLogger().warn('Action agent failed after deterministic replay; preserving the replay outcome', {
          error: error instanceof Error ? error.name : 'unknown',
        });
      }
      const finalOutcome = outcome as ReplayOutcome | null;
      if (!finalOutcome) throw new Error('blackbox-action did not execute its approved replay');

      const observedExchanges = replayExchanges(finalOutcome);
      const allExchanges = new Map(
        [...dynamicExchanges, ...observedExchanges].map((exchange) => [exchange.exchangeId, exchange]),
      );
      const action: BlackboxActionResult = {
        actionId: task.taskId,
        hypothesisId: task.hypothesisId,
        sequence,
        status: actionStatus(finalOutcome),
        exchangeIds: observedExchanges.map(({ exchangeId }) => exchangeId),
        observation: replayObservation(finalOutcome),
        provenance: { actor: 'blackbox-action', taskId: task.taskId, baseRevision: input.revision },
      };
      const candidateProofs =
        finalOutcome.status === 'completed' &&
        supportsFindingCandidate(
          finalOutcome.observation,
          sequence.proofCondition,
          observedExchanges.at(-1)?.exchangeId,
        ) &&
        submitted
          ? namespaceContributionRecords(submitted, task.taskId).candidateProofs?.map((candidate) => ({
              ...candidate,
              actionId: task.taskId,
              hypothesisId: task.hypothesisId as string,
            }))
          : undefined;
      return {
        taskId: task.taskId,
        role: 'blackbox-action',
        baseRevision: input.revision,
        exchanges: [...allExchanges.values()],
        actions: [action],
        ...(candidateProofs ? { candidateProofs } : {}),
      };
    } finally {
      for (const { session } of sessions) {
        try {
          await dependencies.runBrowserCommand('playwright-cli', [`-s=${session}`, 'close'], { cwd: input.repoPath });
        } catch (error) {
          activityLogger().warn(`Unable to close Playwright session ${session}`, {
            error: error instanceof Error ? error.name : 'unknown',
          });
        }
      }
      await closeBurpClient(client);
    }
  };

  const runVerifierActivity = async (input: BlackboxVerifierActivityInput): Promise<BlackboxVerificationAttempt> => {
    const context = await loadRuntimeContext(dependencies, input);
    const { snapshot } = await initializeStore(input, context);
    if (snapshot.revision !== input.revision) throw new Error('blackbox-verifier received a stale blackboard revision');
    const candidate = snapshot.candidateProofs.find(({ candidateId }) => candidateId === input.candidateId);
    if (!candidate) throw new Error(`Unknown verification candidate ${input.candidateId}`);
    const action = snapshot.actions.find(({ actionId }) => actionId === candidate.actionId);
    if (
      !action ||
      action.status !== 'completed' ||
      !supportsFindingCandidate(action.observation, action.sequence.proofCondition, action.exchangeIds.at(-1))
    ) {
      throw new Error(`Candidate ${input.candidateId} has no completed passing action`);
    }
    const task = snapshot.tasks.find(({ taskId }) => taskId === action.actionId);
    if (!task || task.kind !== 'action' || !task.replayPlan || task.status !== 'completed') {
      throw new Error(`Candidate ${input.candidateId} has no persisted approved action task`);
    }
    const verificationId = verificationExecutionId(candidate.candidateId);
    const sequence = replaySequence(task, verificationId);
    const actors = new Set<string>();
    for (const { actor } of sequence.steps) if (actor !== 'anonymous') actors.add(actor);
    const proofCondition = sequence.proofCondition;
    if (proofCondition.type === 'persistent_state') {
      const verificationSource = snapshot.exchanges.find(
        ({ exchangeId }) => exchangeId === proofCondition.verificationSourceExchangeId,
      );
      if (verificationSource?.identity && verificationSource.identity !== 'anonymous') {
        actors.add(verificationSource.identity);
      }
    }
    const identities = [...actors].map((actor) => {
      const identity = context.config.identities.find(({ name }) => name === actor);
      if (!identity) throw new Error(`Unknown verification actor ${actor}`);
      return identity;
    });
    const freshRoot = verificationRoot(input.repoPath, verificationId);
    const identityState = dependencies.createIdentityStateResolver(
      freshRoot,
      context.config.identities.map(({ name }) => name),
    );
    const sessions = identities.map((identity) => ({
      identity,
      session: `bb-verify-${verificationId}-${identity.name}`,
      storagePath: statePath(freshRoot, identity.name),
    }));
    for (const { storagePath } of sessions) {
      await dependencies.fileSystem.mkdir(path.dirname(storagePath), { recursive: true });
    }

    const client = dependencies.createBurpClient(context.burpSettings);
    const dynamicExchanges: NormalizedExchange[] = [];
    let outcome: ReplayOutcome | null = null;
    let requestedFreshActor: string | 'anonymous' | null = null;
    try {
      await client.connect();
      for (const { identity, session, storagePath } of sessions) {
        const loginTask = verificationLoginTask(verificationId, identity.name);
        const auditSession = dependencies.createAuditSession(input);
        await auditSession.initialize(input.workflowId);
        const loginTools = callerTools(
          createBlackboxTools({
            role: 'blackbox-recon',
            readTargetHistory: async () => [],
          }),
        );
        try {
          await dependencies.createAgentRunner(input).run({
            kind: 'blackbox-recon',
            targetOrigin: context.targetOrigin,
            task: loginTask,
            snapshot: toRedactedSlice(snapshot),
            identity: {
              name: identity.name,
              role: identity.role,
              loginInstructions: verificationLoginInstructions(identity, session, storagePath),
              credentials: structuredClone(identity.authentication.credentials) as unknown as Readonly<
                Record<string, unknown>
              >,
              sensitiveValues: context.configuredSecrets,
            },
            customTools: loginTools,
            auditSession: auditSession as AuditSession,
            logger: activityLogger(),
          });
        } catch (error) {
          activityLogger().warn(`Fresh verifier login agent for ${identity.name} did not submit cleanly`, {
            error: error instanceof Error ? error.name : 'unknown',
          });
        }
        await assertStorageState(dependencies.fileSystem, storagePath, identity.name);
        const checked = await dependencies.runBrowserCommand(
          'playwright-cli',
          [`-s=${session}`, 'eval', successExpression(identity.authentication.success_condition)],
          { cwd: input.repoPath },
        );
        if (!checked.stdout.includes(AUTH_SUCCESS_MARKER) || checked.stdout.includes(AUTH_FAILURE_MARKER)) {
          throw new Error(`Fresh verifier state for identity ${identity.name} is not authenticated`);
        }
      }
      let historyCheckpoint = await readTargetHistory(client, context.targetOrigin, context.config.rules);
      const executeVerificationReplay = async (): Promise<ReplayOutcome> => {
        for (const { session, storagePath } of sessions) {
          await dependencies.runBrowserCommand('playwright-cli', [`-s=${session}`, 'state-save', storagePath], {
            cwd: input.repoPath,
          });
        }
        const currentHistory = await readTargetHistory(client, context.targetOrigin, context.config.rules);
        if (requestedFreshActor) {
          const captured = await normalizeCapturedTraffic({
            targetOrigin: context.targetOrigin,
            rules: context.config.rules,
            identity: requestedFreshActor,
            before: historyCheckpoint,
            after: currentHistory,
            rawDirectory: rawDirectory(input.repoPath),
            configuredSecrets: context.configuredSecrets,
            provenance: { actor: 'blackbox-verifier', taskId: verificationId, baseRevision: input.revision },
            captureSequenceOffset: captureSequenceOffset(
              [...snapshot.exchanges, ...dynamicExchanges],
              requestedFreshActor,
            ),
          });
          dynamicExchanges.push(...captured);
          if (requestedFreshActor !== 'anonymous' && captured.length > 0) {
            await identityState.writeCaptureIndex(
              requestedFreshActor,
              dynamicExchanges
                .filter(({ identity }) => identity === requestedFreshActor)
                .map(({ exchangeId, routeSignature, captureSequence }) => ({
                  exchangeId,
                  routeSignature,
                  captureSequence,
                })),
            );
          }
        }
        historyCheckpoint = currentHistory;
        const replay = dependencies.createReplayService({
          targetOrigin: context.targetOrigin,
          rules: context.config.rules,
          configuredSecrets: context.configuredSecrets,
          exchanges: [...snapshot.exchanges, ...dynamicExchanges],
          client,
          rawStore: dependencies.createReplayRawStore(input.repoPath),
          identityState,
          provenance: { actor: 'blackbox-verifier', taskId: verificationId, baseRevision: input.revision },
        });
        const replayOutcome = await replay.replay(sequence);
        outcome = replayOutcome;
        requestedFreshActor = null;
        if (replayOutcome.status === 'needs_fresh_actor_request') {
          const step = sequence.steps.find(({ stepId }) => stepId === replayOutcome.stepId);
          if (step) requestedFreshActor = step.actor;
          else {
            const proofCondition = sequence.proofCondition;
            if (proofCondition.type !== 'persistent_state') return replayOutcome;
            requestedFreshActor =
              snapshot.exchanges.find(({ exchangeId }) => exchangeId === proofCondition.verificationSourceExchangeId)
                ?.identity ?? null;
          }
        }
        return replayOutcome;
      };

      const instructions = [
        'Fresh verifier states were created in isolated identity sessions. Do not load prior action or capture state.',
        ...sessions.map(({ identity, session }) => `${identity.name}: use only Playwright session ${session}.`),
        'Do not authenticate, exchange sessions, or change identities before calling the bound verification replay.',
        'If replay requests a fresh actor request, exercise only the returned route in that actor session, then retry once.',
      ].join('\n');
      const tools = callerTools(
        createBlackboxTools({
          role: 'blackbox-verifier',
          candidateId: candidate.candidateId,
          replayVerificationRequest: executeVerificationReplay,
        }),
      );
      const auditSession = dependencies.createAuditSession(input);
      await auditSession.initialize(input.workflowId);
      let submitted: VerificationResult | null = null;
      let submissionFailed = false;
      try {
        submitted = (await dependencies.createAgentRunner(input).run({
          kind: 'blackbox-verifier',
          targetOrigin: context.targetOrigin,
          candidateId: candidate.candidateId,
          task: null,
          snapshot: toRedactedSlice(snapshot),
          identity: {
            name: 'fresh-verifier',
            role: 'independent verifier',
            loginInstructions: instructions,
            sensitiveValues: context.configuredSecrets,
          },
          customTools: tools,
          auditSession: auditSession as AuditSession,
          logger: activityLogger(),
        })) as VerificationResult;
      } catch (error) {
        if (!outcome) throw error;
        submissionFailed = true;
        activityLogger().warn('Verifier model failed after deterministic replay; preserving replay evidence', {
          error: error instanceof Error ? error.name : 'unknown',
        });
      }
      if (!outcome) throw new Error('blackbox-verifier did not execute its approved replay');

      for (const { identity, session, storagePath } of sessions) {
        await assertStorageState(dependencies.fileSystem, storagePath, identity.name);
        const checked = await dependencies.runBrowserCommand(
          'playwright-cli',
          [`-s=${session}`, 'eval', successExpression(identity.authentication.success_condition)],
          { cwd: input.repoPath },
        );
        if (!checked.stdout.includes(AUTH_SUCCESS_MARKER) || checked.stdout.includes(AUTH_FAILURE_MARKER)) {
          throw new Error(`Fresh verifier state for identity ${identity.name} is not authenticated`);
        }
      }

      const observedExchanges = replayExchanges(outcome);
      const observation = replayObservation(outcome);
      if (submitted?.verdict === 'verified' && (!observation || !observation.passed)) {
        throw new Error('Verifier cannot verify a replay without a passing deterministic observation');
      }
      const common = {
        verificationId,
        candidateId: candidate.candidateId,
        freshStateRefs: identities.map(({ name }) => ({
          identity: name,
          stateRef: verificationStateRef(verificationId, name),
        })),
        replayActionIds: [action.actionId],
        replayExchangeIds: observedExchanges.map(({ exchangeId }) => exchangeId),
        observation,
        failureReason: submissionFailed
          ? 'verifier submission failed after replay'
          : submitted?.failureReason === null
            ? null
            : safeFailureReason(submitted?.failureReason, context.configuredSecrets),
      };
      const verification: VerificationResult =
        submitted?.verdict === 'verified'
          ? {
              ...common,
              verdict: 'verified',
              demonstratedAction: submitted.demonstratedAction,
              concreteEffect: submitted.concreteEffect,
              affectedParty: submitted.affectedParty,
            }
          : { ...common, verdict: submitted?.verdict ?? 'blocked' };
      const allExchanges = new Map(
        [...dynamicExchanges, ...observedExchanges].map((exchange) => [exchange.exchangeId, exchange]),
      );
      return { verification, exchanges: [...allExchanges.values()] };
    } finally {
      for (const { session } of sessions) {
        try {
          await dependencies.runBrowserCommand('playwright-cli', [`-s=${session}`, 'close'], { cwd: input.repoPath });
        } catch (error) {
          activityLogger().warn(`Unable to close Playwright session ${session}`, {
            error: error instanceof Error ? error.name : 'unknown',
          });
        }
      }
      await closeBurpClient(client);
    }
  };

  const runWorker = async (
    kind: 'blackbox-recon' | 'blackbox-analysis' | 'blackbox-action',
    input: BlackboxWorkerActivityInput,
  ): Promise<WorkerContribution> => {
    if (kind === 'blackbox-recon') return runReconActivity(input);
    if (kind === 'blackbox-action') return runActionActivity(input);
    const context = await loadTargetContext(dependencies, input);
    const { snapshot } = await initializeStore(input, context);
    if (snapshot.revision !== input.revision) throw new Error(`${kind} received a stale blackboard revision`);
    const persistedTask = snapshot.tasks.find(({ taskId }) => taskId === input.task.taskId);
    if (!persistedTask || persistedTask.status !== 'running') throw new Error(`${kind} task is not running`);
    if (persistedTask.kind !== 'analysis') throw new Error(`${kind} requires a running analysis task kind`);
    const auditSession = dependencies.createAuditSession(input);
    await auditSession.initialize(input.workflowId);
    const submitted = (await dependencies.createAgentRunner(input).run({
      kind,
      targetOrigin: context.targetOrigin,
      task: persistedTask,
      snapshot: toRedactedSlice(snapshot),
      identity: null,
      customTools: [],
      auditSession: auditSession as AuditSession,
      logger: activityLogger(),
    })) as WorkerContribution;
    const namespaced = namespaceContributionRecords(submitted, persistedTask.taskId);
    return {
      taskId: persistedTask.taskId,
      role: kind,
      baseRevision: input.revision,
      ...(namespaced.hypotheses ? { hypotheses: namespaced.hypotheses } : {}),
    };
  };

  const registerPlannedWave = async (input: RegisterWaveInput): Promise<RegisteredWave> => {
    const context = await loadTargetContext(dependencies, input);
    const { store, snapshot } = await initializeStore(input, context);
    if (snapshot.revision === input.revision) {
      const expected = validateAndScheduleWave(input.batch, toSchedulerSnapshot(snapshot, context.config.rules));
      if (!isDeepStrictEqual(expected, input.wave)) {
        throw new Error('Registered wave does not match scheduler validation');
      }
    }

    const accepted = [...input.wave.concurrent, ...input.wave.actions];
    const acceptedIds = new Set(accepted.map(({ taskId }) => taskId));
    const rejectedIds = new Set<string>();
    const rejected = input.wave.rejected.flatMap(({ taskId, reason }) => {
      if (acceptedIds.has(taskId) || rejectedIds.has(taskId)) return [];
      const task = input.batch.tasks.find((candidate) => candidate.taskId === taskId);
      if (!task) throw new Error(`Rejected task ${taskId} is not present in the planner batch`);
      rejectedIds.add(taskId);
      return [{ task, reason }];
    });
    const next = await store.registerTasks(input.revision, {
      operationKey: input.operationKey,
      accepted,
      rejected,
      closedHypothesisIds: input.wave.closedHypothesisIds,
    });
    return { revision: next.revision, wave: structuredClone(input.wave), tasks: taskStates(next) };
  };

  const startBlackboxTasks = async (input: StartTasksInput): Promise<TaskTransitionResult> => {
    const context = await loadTargetContext(dependencies, input);
    const { store } = await initializeStore(input, context);
    const next = await store.startTasks(input.revision, input.operationKey, input.taskIds);
    return { revision: next.revision, tasks: taskStates(next) };
  };

  const settleBlackboxTasks = async (input: SettleTasksInput): Promise<SettledTasksResult> => {
    const context = await loadTargetContext(dependencies, input);
    const { store } = await initializeStore(input, context);
    const failures = input.failures.map(({ taskId, reason }) => ({
      taskId,
      reason: safeFailureReason(reason, context.configuredSecrets),
    }));
    const next = await store.settleTasks({
      operationKey: input.operationKey,
      baseRevision: input.baseRevision,
      contributions: input.contributions,
      failures,
    });
    const candidateIds = [
      ...new Set(
        input.contributions.flatMap(
          ({ candidateProofs }) => candidateProofs?.map(({ candidateId }) => candidateId) ?? [],
        ),
      ),
    ].sort();
    return { revision: next.revision, tasks: taskStates(next), candidateIds };
  };

  const recordBlackboxVerification = async (input: RecordVerificationInput): Promise<number> => {
    const context = await loadTargetContext(dependencies, input);
    const { store } = await initializeStore(input, context);
    const next = await store.recordVerification(input.revision, input.operationKey, input.attempt);
    return next.revision;
  };

  const recordBlackboxVerificationFailure = async (input: RecordVerificationFailureInput): Promise<number> => {
    const context = await loadTargetContext(dependencies, input);
    const { store, snapshot } = await initializeStore(input, context);
    const candidate = snapshot.candidateProofs.find(({ candidateId }) => candidateId === input.candidateId);
    if (!candidate) throw new Error(`Unknown candidate ${input.candidateId}`);
    const verification: VerificationResult = {
      verificationId: verificationExecutionId(candidate.candidateId),
      candidateId: candidate.candidateId,
      verdict: 'blocked',
      freshStateRefs: [],
      replayActionIds: [candidate.actionId],
      replayExchangeIds: [],
      observation: null,
      failureReason: safeFailureReason(input.reason, context.configuredSecrets),
    };
    const next = await store.recordVerification(input.revision, input.operationKey, {
      verification,
      exchanges: [],
    });
    return next.revision;
  };

  const evaluateBlackboxProgress = async (input: EvaluateProgressInput): Promise<EvaluateProgressResult> => {
    const context = await loadTargetContext(dependencies, input);
    const { snapshot } = await initializeStore(input, context);
    if (snapshot.revision !== input.revision) {
      throw new Error(
        `Progress evaluation received stale revision ${input.revision}; current revision is ${snapshot.revision}`,
      );
    }
    const pendingTasks = snapshot.tasks.filter(({ status }) => status === 'pending' || status === 'running').length;
    const openImpactHypotheses = snapshot.hypotheses.filter(
      ({ status }) => status === 'open' || status === 'queued' || status === 'tested' || status === 'blocked',
    ).length;
    return {
      decision: decideRunCompletion({
        wave: input.waveNumber,
        plannerStop: input.plannerStop,
        pendingTasks,
        openImpactHypotheses,
        hitSafetyLimit: input.waveNumber >= 8,
      }),
      revision: snapshot.revision,
    };
  };

  const finalizeBlackboxRun = async (input: FinalizeBlackboxInput): Promise<BlackboxWorkflowResult> => {
    const context = await loadTargetContext(dependencies, input);
    const { store, snapshot } = await initializeStore(input, context);
    const failure = input.failure ? safeFailureReason(input.failure, context.configuredSecrets) : null;
    const result = (findings: ReturnType<typeof collectVerifiedFindings>, revision: number): BlackboxWorkflowResult => {
      const verifierResultIds = new Set(findings.map(({ verifierResultId }) => verifierResultId));
      return {
        status: input.status,
        revision,
        failure,
        verifiedCandidateIds: snapshot.verifications
          .filter(({ verificationId }) => verifierResultIds.has(verificationId))
          .map(({ candidateId }) => candidateId)
          .sort(),
        findingCount: findings.length,
        artifactNames: [...BLACKBOX_ARTIFACT_NAMES],
      };
    };

    if (snapshot.runStatus !== 'running') {
      const completedOperation = snapshot.operationReceipts?.some(
        ({ operationKey }) => operationKey === input.operationKey,
      );
      if (snapshot.runStatus === input.status && completedOperation) {
        return result(collectVerifiedFindings(snapshot, context.targetOrigin), snapshot.revision);
      }
      throw new Error(`Blackboard is already terminal with status ${snapshot.runStatus}`);
    }

    try {
      const findings = collectVerifiedFindings(snapshot, context.targetOrigin);
      const rendered = renderBlackboxArtifacts({
        snapshot,
        findings,
        status: input.status,
        failure,
        configuredSecrets: context.configuredSecrets,
      });
      const artifactNames = await dependencies.publishArtifacts(input.repoPath, rendered);
      if (!isDeepStrictEqual(artifactNames, BLACKBOX_ARTIFACT_NAMES)) {
        throw new Error('Black-box artifact publisher returned an incomplete manifest');
      }
      const next = await store.setRunStatus(input.revision, input.operationKey, input.status);
      return result(findings, next.revision);
    } catch (error) {
      try {
        await store.setRunStatus(input.revision, `${input.operationKey}:incomplete`, 'incomplete');
      } catch (statusError) {
        throw new AggregateError(
          [error, statusError],
          'Black-box artifact publication failed and the blackboard could not record incomplete',
        );
      }
      throw error;
    }
  };

  return {
    preflightBlackbox,
    captureAnonymous: (input) => captureActor(input, 'anonymous'),
    captureIdentity: captureActor,
    readPlannerSnapshot,
    runBlackboxPlanner,
    runBlackboxRecon: (input) => runWorker('blackbox-recon', input),
    runBlackboxAnalysis: (input) => runWorker('blackbox-analysis', input),
    runBlackboxAction: (input) => runWorker('blackbox-action', input),
    runBlackboxVerifier: runVerifierActivity,
    registerPlannedWave,
    startBlackboxTasks,
    settleBlackboxTasks,
    recordBlackboxVerification,
    recordBlackboxVerificationFailure,
    evaluateBlackboxProgress,
    finalizeBlackboxRun,
  };
}

function productionActivities(): BlackboxActivityApi {
  return createBlackboxActivities();
}

export async function preflightBlackbox(input: BlackboxActivityInput): Promise<BlackboxPreflightResult> {
  return productionActivities().preflightBlackbox(input);
}

export async function captureAnonymous(input: BlackboxActivityInput): Promise<IdentityCaptureResult> {
  return productionActivities().captureAnonymous(input);
}

export async function captureIdentity(
  input: BlackboxActivityInput,
  identityName: string,
): Promise<IdentityCaptureResult> {
  return productionActivities().captureIdentity(input, identityName);
}

export async function readPlannerSnapshot(input: BlackboxActivityInput): Promise<BlackboxSchedulerSnapshot> {
  return productionActivities().readPlannerSnapshot(input);
}

export async function runBlackboxPlanner(input: BlackboxActivityInput, revision: number): Promise<PlannerBatch> {
  return productionActivities().runBlackboxPlanner(input, revision);
}

export async function runBlackboxRecon(input: BlackboxWorkerActivityInput): Promise<WorkerContribution> {
  return productionActivities().runBlackboxRecon(input);
}

export async function runBlackboxAnalysis(input: BlackboxWorkerActivityInput): Promise<WorkerContribution> {
  return productionActivities().runBlackboxAnalysis(input);
}

export async function runBlackboxAction(input: BlackboxWorkerActivityInput): Promise<WorkerContribution> {
  return productionActivities().runBlackboxAction(input);
}

export async function runBlackboxVerifier(input: BlackboxVerifierActivityInput): Promise<BlackboxVerificationAttempt> {
  return productionActivities().runBlackboxVerifier(input);
}

export async function registerPlannedWave(input: RegisterWaveInput): Promise<RegisteredWave> {
  return productionActivities().registerPlannedWave(input);
}

export async function startBlackboxTasks(input: StartTasksInput): Promise<TaskTransitionResult> {
  return productionActivities().startBlackboxTasks(input);
}

export async function settleBlackboxTasks(input: SettleTasksInput): Promise<SettledTasksResult> {
  return productionActivities().settleBlackboxTasks(input);
}

export async function recordBlackboxVerification(input: RecordVerificationInput): Promise<number> {
  return productionActivities().recordBlackboxVerification(input);
}

export async function recordBlackboxVerificationFailure(input: RecordVerificationFailureInput): Promise<number> {
  return productionActivities().recordBlackboxVerificationFailure(input);
}

export async function evaluateBlackboxProgress(input: EvaluateProgressInput): Promise<EvaluateProgressResult> {
  return productionActivities().evaluateBlackboxProgress(input);
}

export async function finalizeBlackboxRun(input: FinalizeBlackboxInput): Promise<BlackboxWorkflowResult> {
  return productionActivities().finalizeBlackboxRun(input);
}
