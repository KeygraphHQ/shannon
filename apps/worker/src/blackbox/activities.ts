// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual, promisify } from 'node:util';
import { Context, heartbeat } from '@temporalio/activity';
import { writePlaywrightStealthConfig } from '../ai/playwright-config-writer.js';
import { redactSensitive } from '../ai/sensitive-redaction.js';
import { AuditSession } from '../audit/index.js';
import { normalizeBlackboxConfig, parseConfig } from '../config-parser.js';
import { deliverablesDir } from '../paths.js';
import { createActivityLogger } from '../temporal/activity-logger.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import type {
  BlackboardStore,
  BlackboxActionResult,
  BlackboxRunScope,
  BlackboxRunStatus,
  BlackboxSnapshot,
  BlackboxVerificationAttempt,
  EvidenceRef,
  NormalizedExchange,
  PlannerTask,
  ProofCondition,
  ReplaySequence,
  VerificationResult,
  VerifiedBlackboxFinding,
  WorkerContribution,
} from '../types/blackbox.js';
import type { Config, NormalizedBlackboxConfig, SuccessCondition } from '../types/config.js';
import { BlackboxAgentRunner, type RedactedBlackboxSlice, type RedactedIdentityContext } from './agent-runner.js';
import type { PlannerBatch } from './agents.js';
import {
  BLACKBOX_ARTIFACT_NAMES,
  copyBlackboxDeliverables,
  publishBlackboxArtifacts,
  renderBlackboxArtifacts,
  validateBlackboxDeliverables,
} from './artifacts.js';
import { BlackboardValidationError, FileBlackboardStore } from './blackboard.js';
import {
  BurpMcpClient,
  type BurpMcpSettings,
  type BurpToolClient,
  type HistorySnapshot,
  readTargetHistory,
} from './burp-client.js';
import { collectVerifiedFindings, hasValidBlackboxControlEvidence } from './finding-validator.js';
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
import { createBlackboxRunScope, normalizeTargetOrigin } from './scope-guard.js';
import { createBlackboxTools } from './tools.js';
import {
  diffHistory,
  filterCapturedTrafficByToken,
  normalizeCapturedTraffic,
  normalizeRawExchange,
  SHANNON_CAPTURE_HEADER,
} from './traffic-normalizer.js';

const execFileAsync = promisify(execFile);
const AUTH_SUCCESS_MARKER = '__SHANNON_AUTH_OK__';
const AUTH_FAILURE_MARKER = '__SHANNON_AUTH_FAILED__';
const SHA256_DIGEST = /^[a-f0-9]{64}$/;
const HEARTBEAT_INTERVAL_MS = 2_000;

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
  readonly resumeFromWorkspace?: string;
  readonly terminatedWorkflows?: readonly string[];
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
  readonly resumedTasks: readonly PlannerTask[];
  readonly unresolvedCandidateIds: readonly string[];
  readonly consumedPlanningWaves: number;
  readonly pendingPlanningEvaluation: {
    readonly waveNumber: number;
    readonly plannerStop: boolean;
  } | null;
  readonly finalizationIntent: 'complete' | 'incomplete' | null;
  readonly terminalResult: BlackboxWorkflowResult | null;
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
  addResumeAttempt(workflowId: string, terminatedWorkflows: string[]): Promise<void>;
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
    options: { readonly cwd: string; readonly signal?: AbortSignal },
  ) => Promise<BrowserCommandResult>;
  readonly getCancellationSignal: () => AbortSignal | undefined;
  readonly createAgentRunner: (input: BlackboxActivityInput) => BlackboxAgentRunnerLike;
  readonly createAuditSession: (input: BlackboxActivityInput, runScope: BlackboxRunScope) => BlackboxAuditSessionLike;
  readonly logger?: ActivityLogger;
  readonly readEnvironment: () => Readonly<Record<string, string | undefined>>;
  readonly fileSystem: BlackboxFileSystem;
  readonly createIdentityStateResolver: (repoPath: string, identities: readonly string[]) => BlackboxIdentityState;
  readonly createReplayRawStore: (repoPath: string) => ReplayRawStore;
  readonly createReplayService: (options: ReplayServiceOptions) => BlackboxReplayServiceLike;
  readonly createCaptureToken: () => string;
  readonly publishArtifacts: typeof publishBlackboxArtifacts;
  readonly copyDeliverables: typeof copyBlackboxDeliverables;
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

export interface ReservePlanningWaveInput extends BlackboxActivityInput {
  readonly revision: number;
  readonly waveNumber: number;
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
  readonly operationKey: string;
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

export type BlackboxTerminalStatus = 'findings' | 'no_findings' | 'incomplete';

export interface BlackboxWorkflowResult {
  readonly mode: 'blackbox';
  readonly status: BlackboxTerminalStatus;
  readonly revision: number;
  readonly findingCount: number;
  readonly artifactNames: typeof BLACKBOX_ARTIFACT_NAMES;
  readonly failures: readonly string[];
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
  reserveBlackboxPlanningWave(input: ReservePlanningWaveInput): Promise<TaskTransitionResult>;
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
  readonly runScope: BlackboxRunScope;
  readonly burpSettings: BurpMcpSettings;
  readonly proxyUrl: string;
}

function productionAuditSession(input: BlackboxActivityInput, runScope: BlackboxRunScope): AuditSession {
  return new AuditSession({
    id: input.workspace,
    webUrl: input.webUrl,
    repoPath: input.repoPath,
    outputPath: input.auditDir,
    mode: 'blackbox',
    blackboxScope: runScope,
  });
}

const DEFAULT_DEPENDENCIES: BlackboxActivityDependencies = {
  parseConfig,
  createBurpClient: (settings) => new BurpMcpClient(settings),
  writePlaywrightConfig: writePlaywrightStealthConfig,
  createBlackboardStore: (repoPath) => new FileBlackboardStore(repoPath),
  async runBrowserCommand(file, arguments_, options) {
    const result = await execFileAsync(file, [...arguments_], {
      cwd: options.cwd,
      ...(options.signal ? { signal: options.signal } : {}),
    });
    return { stdout: String(result.stdout), stderr: String(result.stderr), exitCode: 0 };
  },
  getCancellationSignal: () => undefined,
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
  createCaptureToken: randomUUID,
  publishArtifacts: publishBlackboxArtifacts,
  copyDeliverables: copyBlackboxDeliverables,
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
  const runScope = createBlackboxRunScope(
    target.targetUrl,
    target.config.identities.map(({ name }) => name),
    target.config.identityBoundRequestFields,
    dependencies.readEnvironment(),
  );
  return {
    ...target,
    runScope,
    burpSettings: { url: runScope.burpMcpUrl, hostHeader: runScope.burpMcpHostHeader },
    proxyUrl: runScope.burpProxyUrl,
  };
}

function initialization(context: RuntimeContext) {
  return {
    targetOrigin: context.targetOrigin,
    runScope: context.runScope,
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
  const byName = (left: { readonly name: string }, right: { readonly name: string }): number =>
    left.name.localeCompare(right.name);
  const expected = context.config.identities
    .map(({ name, role }) => ({ name, role, stateRef: stateRef(name) }))
    .sort(byName);
  const observed = snapshot.identities
    .map(({ name, role, stateRef: ref }) => ({ name, role, stateRef: ref }))
    .sort(byName);
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
    failedTasks: snapshot.tasks
      .filter(({ status }) => status === 'failed')
      .map(({ taskId, kind, objective, identityLease, hypothesisId }) => ({
        taskId,
        kind,
        objective,
        identityLease,
        hypothesisId,
      })),
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
    exchanges: snapshot.exchanges.map(({ exchangeId, routeSignature, origin, path: exchangePath, identity }) => ({
      exchangeId,
      routeSignature,
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
    tasks: snapshot.tasks.map(({ taskId, kind, status, identityLease, hypothesisId, replayPlan }) => ({
      taskId,
      kind,
      status,
      identityLease,
      hypothesisId,
      ...(replayPlan ? { replayPlan: structuredClone(replayPlan) } : {}),
    })),
    deliveryUnknownActions: snapshot.actions
      .filter(({ status }) => status === 'delivery_unknown')
      .map(({ hypothesisId, sequence }) => ({
        hypothesisId,
        replayPlan: {
          steps: structuredClone(sequence.steps),
          proofCondition: structuredClone(sequence.proofCondition),
        },
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
    `The activity opened ${identity.authentication.login_url}; authenticate as the assigned identity in that session.`,
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
    `The activity opened ${input.webUrl} without loading storage state. Do not authenticate.`,
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
  return `(async () => {
  const deadline = Date.now() + 5000;
  while (true) {
    if (${predicate}) return '${AUTH_SUCCESS_MARKER}';
    if (Date.now() >= deadline) return '${AUTH_FAILURE_MARKER}';
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
})`;
}

function authCheckSucceeded(stdout: string): boolean {
  const resultHeading = '### Result';
  const codeHeading = '### Ran Playwright code';
  const resultStart = stdout.indexOf(resultHeading);
  const codeStart = stdout.indexOf(codeHeading);
  if (resultStart >= 0 || codeStart >= 0) {
    if (resultStart < 0 || codeStart < resultStart + resultHeading.length) return false;
    const output = stdout.slice(resultStart + resultHeading.length, codeStart);
    return output.includes(AUTH_SUCCESS_MARKER) && !output.includes(AUTH_FAILURE_MARKER);
  }
  return stdout.includes(AUTH_SUCCESS_MARKER) && !stdout.includes(AUTH_FAILURE_MARKER);
}

function previewTraffic(
  before: HistorySnapshot,
  after: HistorySnapshot,
  context: TargetContext,
  captureToken: string,
  identity: string | 'anonymous',
  taskId: string,
  baseRevision: number,
  captureSequenceOffset: number,
): readonly NormalizedExchange[] {
  return filterCapturedTrafficByToken(diffHistory(before, after), captureToken)
    .map((raw, index) =>
      normalizeRawExchange({
        targetOrigin: context.targetOrigin,
        rules: context.config.rules,
        identity,
        raw,
        captureSequence: captureSequenceOffset + index + 1,
        configuredSecrets: context.configuredSecrets,
        identityBoundRequestFields: context.config.identityBoundRequestFields,
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
  if (
    condition.type === 'persistent_state'
      ? observation.controlExchangeIds.length !== 0
      : observation.controlExchangeIds.length === 0
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
    `The activity opened ${identity.authentication.login_url}; authenticate as ${identity.name} in that session.`,
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

async function saveIdentityState(
  dependencies: BlackboxActivityDependencies,
  repoPath: string,
  session: string,
  identity: string,
  signal: AbortSignal | undefined,
): Promise<void> {
  const storagePath = statePath(repoPath, identity);
  await dependencies.runBrowserCommand(
    'playwright-cli',
    [`-s=${session}`, 'state-save', storagePath],
    cancellableBrowserOptions(repoPath, signal),
  );
  await assertStorageState(dependencies.fileSystem, storagePath, identity);
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

async function readTerminalArtifactFailures(
  fileSystem: BlackboxFileSystem,
  repoPath: string,
  snapshot: BlackboxSnapshot,
  configuredSecrets: readonly string[],
): Promise<readonly string[]> {
  const raw = String(
    await fileSystem.readFile(path.join(deliverablesDir(repoPath), 'blackbox_blackboard.json'), 'utf8'),
  );
  const metadata = JSON.parse(raw) as unknown;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error('Terminal black-box artifact metadata is invalid');
  }
  const record = metadata as Record<string, unknown>;
  if (
    record.revision !== snapshot.revision ||
    record.targetOrigin !== snapshot.targetOrigin ||
    record.runStatus !== snapshot.runStatus
  ) {
    throw new Error('Terminal black-box artifact metadata does not match the committed blackboard');
  }
  const artifactFailure =
    record.failure === null
      ? null
      : typeof record.failure === 'string'
        ? safeFailureReason(record.failure, configuredSecrets)
        : undefined;
  if (artifactFailure === undefined) throw new Error('Terminal black-box artifact failure metadata is invalid');
  if (Object.hasOwn(snapshot, 'terminalFailure')) {
    const committedFailure = snapshot.terminalFailure ?? null;
    if (artifactFailure !== committedFailure) {
      throw new Error('Terminal black-box artifact failure does not match the committed blackboard');
    }
    return committedFailure ? [committedFailure] : [];
  }
  return artifactFailure ? [artifactFailure] : [];
}

function durablePlanningState(snapshot: BlackboxSnapshot): {
  readonly consumedPlanningWaves: number;
  readonly pendingPlanningEvaluation: {
    readonly waveNumber: number;
    readonly plannerStop: boolean;
  } | null;
  readonly finalizationIntent: 'complete' | 'incomplete' | null;
} {
  const evaluatedWave = snapshot.planningDecision?.waveNumber ?? 0;
  let registeredWave = 0;
  for (const receipt of snapshot.operationReceipts ?? []) {
    const match = /^[^:]+:(\d+):register:/.exec(receipt.operationKey);
    if (!match) continue;
    const waveNumber = Number(match[1]);
    if (Number.isSafeInteger(waveNumber) && waveNumber > 0) {
      registeredWave = Math.max(registeredWave, Math.min(waveNumber, 8));
    }
  }
  const activeWave = snapshot.planningWave?.waveNumber ?? 0;
  const consumedPlanningWaves = Math.max(evaluatedWave, registeredWave, activeWave);
  const pendingPlanningEvaluation =
    snapshot.planningWave?.phase === 'registered'
      ? {
          waveNumber: snapshot.planningWave.waveNumber,
          plannerStop: snapshot.planningWave.plannerStop,
        }
      : !snapshot.planningWave && registeredWave > evaluatedWave
        ? { waveNumber: registeredWave, plannerStop: false }
        : null;
  const decision = snapshot.planningDecision?.decision;
  return {
    consumedPlanningWaves,
    pendingPlanningEvaluation,
    finalizationIntent:
      decision === 'complete' || decision === 'incomplete'
        ? decision
        : snapshot.planningWave?.phase === 'reserved' && snapshot.planningWave.waveNumber >= 8
          ? 'incomplete'
          : null,
  };
}

function cancellableBrowserOptions(repoPath: string, signal: AbortSignal | undefined) {
  return signal ? { cwd: repoPath, signal } : { cwd: repoPath };
}

function createCaptureToken(dependencies: BlackboxActivityDependencies): string {
  const token = dependencies.createCaptureToken();
  if (token.length < 16 || token.length > 256 || !/^[\x21-\x7e]+$/.test(token)) {
    throw new Error('Capture token generator returned an invalid header value');
  }
  return token;
}

async function bindBrowserCapture(
  dependencies: BlackboxActivityDependencies,
  repoPath: string,
  session: string,
  captureToken: string,
  signal: AbortSignal | undefined,
): Promise<void> {
  const headers = JSON.stringify({
    'Accept-Language': 'en-US,en;q=0.9',
    [SHANNON_CAPTURE_HEADER]: captureToken,
  });
  await dependencies.runBrowserCommand(
    'playwright-cli',
    [`-s=${session}`, 'run-code', `async (page) => { await page.context().setExtraHTTPHeaders(${headers}); }`],
    cancellableBrowserOptions(repoPath, signal),
  );
}

async function openCaptureBoundSession(
  dependencies: BlackboxActivityDependencies,
  repoPath: string,
  session: string,
  captureToken: string,
  targetUrl: string,
  signal: AbortSignal | undefined,
): Promise<void> {
  const options = cancellableBrowserOptions(repoPath, signal);
  await dependencies.runBrowserCommand('playwright-cli', [`-s=${session}`, 'open', 'about:blank'], options);
  await bindBrowserCapture(dependencies, repoPath, session, captureToken, signal);
  await dependencies.runBrowserCommand('playwright-cli', [`-s=${session}`, 'goto', targetUrl], options);
}

async function restoreIdentityState(
  dependencies: BlackboxActivityDependencies,
  repoPath: string,
  session: string,
  storagePath: string,
  captureToken: string,
  targetUrl: string,
  signal: AbortSignal | undefined,
): Promise<void> {
  const options = cancellableBrowserOptions(repoPath, signal);
  await dependencies.runBrowserCommand('playwright-cli', [`-s=${session}`, 'open', 'about:blank'], options);
  await dependencies.runBrowserCommand('playwright-cli', [`-s=${session}`, 'state-load', storagePath], options);
  await bindBrowserCapture(dependencies, repoPath, session, captureToken, signal);
  await dependencies.runBrowserCommand('playwright-cli', [`-s=${session}`, 'goto', targetUrl], options);
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

  const publishCommittedTerminalArtifacts = async (
    input: BlackboxActivityInput,
    context: RuntimeContext,
    snapshot: BlackboxSnapshot,
    legacyFailure: string | null = null,
  ): Promise<{ readonly findings: readonly VerifiedBlackboxFinding[]; readonly artifactNames: typeof BLACKBOX_ARTIFACT_NAMES }> => {
    if (snapshot.runStatus === 'running' || snapshot.revision < 1) {
      throw new Error('Cannot publish artifacts before terminal state is committed');
    }
    const findings = collectVerifiedFindings(snapshot, context.targetOrigin);
    const rendered = renderBlackboxArtifacts({
      // Artifact projection advances the source revision by one. Render from
      // the committed terminal revision's predecessor.
      snapshot: { ...snapshot, revision: snapshot.revision - 1 },
      findings,
      status: snapshot.runStatus,
      failure: Object.hasOwn(snapshot, 'terminalFailure') ? snapshot.terminalFailure ?? null : legacyFailure,
      configuredSecrets: context.configuredSecrets,
    });
    const artifactNames = await dependencies.publishArtifacts(input.repoPath, rendered);
    if (!isDeepStrictEqual(artifactNames, BLACKBOX_ARTIFACT_NAMES)) {
      throw new Error('Black-box artifact publisher returned an incomplete manifest');
    }
    return { findings, artifactNames: BLACKBOX_ARTIFACT_NAMES };
  };

  const initializeStore = async (input: BlackboxActivityInput, context: RuntimeContext) => {
    const store = dependencies.createBlackboardStore(input.repoPath);
    const snapshot = await store.initialize(initialization(context));
    validateBoardIdentityScope(snapshot, context);
    return { store, snapshot };
  };

  const preflightBlackbox = async (input: BlackboxActivityInput): Promise<BlackboxPreflightResult> => {
    const context = await loadRuntimeContext(dependencies, input);
    const cancellationSignal = dependencies.getCancellationSignal();
    const auditSession = dependencies.createAuditSession(input, context.runScope);
    await auditSession.initialize(input.workflowId);
    if (input.resumeFromWorkspace) {
      await auditSession.addResumeAttempt(input.workflowId, [...(input.terminatedWorkflows ?? [])]);
    }
    const initializedStore = await initializeStore(input, context);
    if (initializedStore.snapshot.runStatus !== 'running') {
      if (!input.resumeFromWorkspace) {
        throw new Error(`Blackboard is already terminal with status ${initializedStore.snapshot.runStatus}`);
      }
      const terminalReceipt = initializedStore.snapshot.operationReceipts?.find(
        ({ revision }) => revision === initializedStore.snapshot.revision,
      );
      if (!terminalReceipt?.operationKey.endsWith(':finalize:')) {
        throw new Error('Terminal black-box artifact publication did not complete');
      }
      let failures: readonly string[];
      try {
        validateBlackboxDeliverables(input.repoPath);
        failures = await readTerminalArtifactFailures(
          dependencies.fileSystem,
          input.repoPath,
          initializedStore.snapshot,
          context.configuredSecrets,
        );
      } catch {
        let repairFailure: string | null = null;
        if (initializedStore.snapshot.runStatus !== 'complete') {
          if (Object.hasOwn(initializedStore.snapshot, 'terminalFailure')) {
            repairFailure = initializedStore.snapshot.terminalFailure ?? null;
          } else {
            try {
              repairFailure =
                (await readTerminalArtifactFailures(
                  dependencies.fileSystem,
                  input.repoPath,
                  initializedStore.snapshot,
                  context.configuredSecrets,
                ))[0] ?? null;
            } catch {
              repairFailure = 'terminal artifact publication was interrupted; original terminal reason is unavailable';
            }
          }
        }
        await publishCommittedTerminalArtifacts(input, context, initializedStore.snapshot, repairFailure);
        validateBlackboxDeliverables(input.repoPath);
        failures = await readTerminalArtifactFailures(
          dependencies.fileSystem,
          input.repoPath,
          initializedStore.snapshot,
          context.configuredSecrets,
        );
      }
      if (input.outputPath) {
        await dependencies.copyDeliverables(input.repoPath, input.outputPath, BLACKBOX_ARTIFACT_NAMES);
      }
      const findings = collectVerifiedFindings(initializedStore.snapshot, context.targetOrigin);
      return {
        targetOrigin: context.targetOrigin,
        targetUrl: context.targetUrl,
        blackboardPath: path.resolve(input.repoPath, '.shannon', 'blackbox', 'blackboard.json'),
        revision: initializedStore.snapshot.revision,
        identities: initializedStore.snapshot.identities.map(({ name, role, stateRef: ref }) => {
          if (!ref) throw new Error(`Identity ${name} has no state reference`);
          return { name, role, stateRef: ref };
        }),
        resumedTasks: [],
        unresolvedCandidateIds: [],
        ...durablePlanningState(initializedStore.snapshot),
        terminalResult: {
          mode: 'blackbox',
          status:
            initializedStore.snapshot.runStatus === 'complete'
              ? findings.length > 0
                ? 'findings'
                : 'no_findings'
              : 'incomplete',
          revision: initializedStore.snapshot.revision,
          findingCount: findings.length,
          artifactNames: BLACKBOX_ARTIFACT_NAMES,
          failures,
        },
      };
    }
    const initialPlanningState = durablePlanningState(initializedStore.snapshot);
    if (initialPlanningState.finalizationIntent) {
      return {
        targetOrigin: context.targetOrigin,
        targetUrl: context.targetUrl,
        blackboardPath: path.resolve(input.repoPath, '.shannon', 'blackbox', 'blackboard.json'),
        revision: initializedStore.snapshot.revision,
        identities: initializedStore.snapshot.identities.map(({ name, role, stateRef: ref }) => {
          if (!ref) throw new Error(`Identity ${name} has no state reference`);
          return { name, role, stateRef: ref };
        }),
        resumedTasks: [],
        unresolvedCandidateIds: [],
        ...initialPlanningState,
        terminalResult: null,
      };
    }
    const initialized = input.resumeFromWorkspace
      ? await initializedStore.store.recoverInterruptedTasks(
          initializedStore.snapshot.revision,
          `${input.workflowId}:resume:recover-interrupted`,
        )
      : initializedStore.snapshot;
    const initializedPlanningState = durablePlanningState(initialized);
    const unresolvedCandidateIds = initialized.candidateProofs
      .filter(
        ({ candidateId }) => !initialized.verifications.some((verification) => verification.candidateId === candidateId),
      )
      .map(({ candidateId }) => candidateId)
      .sort();
    if (unresolvedCandidateIds.length > 0) {
      return {
        targetOrigin: context.targetOrigin,
        targetUrl: context.targetUrl,
        blackboardPath: path.resolve(input.repoPath, '.shannon', 'blackbox', 'blackboard.json'),
        revision: initialized.revision,
        identities: initialized.identities.map(({ name, role, stateRef: ref }) => {
          if (!ref) throw new Error(`Identity ${name} has no state reference`);
          return { name, role, stateRef: ref };
        }),
        resumedTasks: [],
        unresolvedCandidateIds,
        ...initializedPlanningState,
        terminalResult: null,
      };
    }
    const client = dependencies.createBurpClient(context.burpSettings);
    try {
      await client.connect(cancellationSignal);
      await dependencies.writePlaywrightConfig(input.repoPath, {
        proxyUrl: context.proxyUrl,
        ignoreHTTPSErrors: true,
        overwrite: true,
      });
      const captureToken = createCaptureToken(dependencies);
      const before = await readTargetHistory(client, context.targetOrigin, context.config.rules, cancellationSignal);
      try {
        await openCaptureBoundSession(
          dependencies,
          input.repoPath,
          'blackbox-preflight',
          captureToken,
          context.targetUrl,
          cancellationSignal,
        );
      } finally {
        await dependencies.runBrowserCommand('playwright-cli', ['-s=blackbox-preflight', 'close'], {
          cwd: input.repoPath,
        });
      }
      const after = await readTargetHistory(client, context.targetOrigin, context.config.rules, cancellationSignal);
      if (filterCapturedTrafficByToken(diffHistory(before, after), captureToken).length === 0) {
        throw new Error('Proxied browser navigation produced no target-origin Burp history');
      }

      const store = initializedStore.store;
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
        resumedTasks: initialized.tasks
          .filter((task) => task.status === 'pending' && !expected.some(({ taskId }) => taskId === task.taskId))
          .map((task) => structuredClone(task)),
        unresolvedCandidateIds,
        ...durablePlanningState(snapshot),
        terminalResult: null,
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
    const cancellationSignal = dependencies.getCancellationSignal();
    const identity =
      actor === 'anonymous' ? null : (context.config.identities.find(({ name }) => name === actor) ?? null);
    if (actor !== 'anonymous' && !identity) throw new Error(`Unknown black-box identity ${actor}`);

    const initializedStore = await initializeStore(input, context);
    const store = initializedStore.store;
    let snapshot = initializedStore.snapshot;
    const taskId = `bootstrap-${actor}`;
    let task = snapshot.tasks.find((candidate) => candidate.taskId === taskId);
    if (!task) throw new Error(`Missing bootstrap task ${taskId}; run preflight first`);
    if (task.kind !== 'recon' || task.identityLease !== actor || task.hypothesisId !== null) {
      throw new Error(`Bootstrap task ${taskId} does not match identity ${actor}`);
    }
    if (task.status === 'completed') {
      const capturedIdentity = actor === 'anonymous' ? null : snapshot.identities.find(({ name }) => name === actor);
      if (actor === 'anonymous') {
        return {
          identity: actor,
          authenticated: false,
          successEvidence: null,
          failureReason: null,
          exchangeIds: snapshot.exchanges
            .filter(({ provenance }) => provenance.taskId === taskId)
            .map(({ exchangeId }) => exchangeId)
            .sort(),
          revision: snapshot.revision,
        };
      }

      const validationSession = `bb-resume-check-${actor}`;
      const validationCaptureToken = createCaptureToken(dependencies);
      let reusable = capturedIdentity?.authenticated === true;
      try {
        if (!identity || !reusable) throw new Error('identity state is not marked authenticated');
        await assertStorageState(dependencies.fileSystem, statePath(input.repoPath, actor), actor);
        await restoreIdentityState(
          dependencies,
          input.repoPath,
          validationSession,
          statePath(input.repoPath, actor),
          validationCaptureToken,
          context.targetUrl,
          cancellationSignal,
        );
        const checked = await dependencies.runBrowserCommand(
          'playwright-cli',
          [`-s=${validationSession}`, 'eval', successExpression(identity.authentication.success_condition)],
          cancellableBrowserOptions(input.repoPath, cancellationSignal),
        );
        reusable = authCheckSucceeded(checked.stdout);
        if (reusable) {
          await dependencies.runBrowserCommand(
            'playwright-cli',
            [`-s=${validationSession}`, 'state-save', statePath(input.repoPath, actor)],
            cancellableBrowserOptions(input.repoPath, cancellationSignal),
          );
          await assertStorageState(dependencies.fileSystem, statePath(input.repoPath, actor), actor);
        }
      } catch {
        cancellationSignal?.throwIfAborted();
        reusable = false;
      } finally {
        try {
          await dependencies.runBrowserCommand('playwright-cli', [`-s=${validationSession}`, 'close'], {
            cwd: input.repoPath,
          });
        } catch (error) {
          activityLogger().warn(`Unable to close Playwright session ${validationSession}`, {
            error: error instanceof Error ? error.name : 'unknown',
          });
        }
      }

      if (reusable) {
        return {
          identity: actor,
          authenticated: true,
          successEvidence: 'reused live verified identity state',
          failureReason: null,
          exchangeIds: snapshot.exchanges
            .filter(({ provenance }) => provenance.taskId === taskId)
            .map(({ exchangeId }) => exchangeId)
            .sort(),
          revision: snapshot.revision,
        };
      }

      snapshot = await store.refreshIdentityCapture(
        snapshot.revision,
        `${input.workflowId}:0:refresh:${taskId}`,
        actor,
      );
      task = snapshot.tasks.find((candidate) => candidate.taskId === taskId);
      if (!task) throw new Error(`Identity refresh lost bootstrap task ${taskId}`);
    }
    if (task.status !== 'pending') {
      return {
        identity: actor,
        authenticated: false,
        successEvidence: null,
        failureReason: `bootstrap task ${taskId} is ${task.status} and requires replanning`,
        exchangeIds: [],
        revision: snapshot.revision,
      };
    }

    const client = dependencies.createBurpClient(context.burpSettings);
    let started: BlackboxSnapshot | null = null;
    let taskSettled = false;
    const session = `bb-${actor}`;
    const captureToken = createCaptureToken(dependencies);
    try {
      await client.connect(cancellationSignal);
      started = await store.startTasks(snapshot.revision, `${input.workflowId}:0:start:${taskId}`, [taskId]);
      const runningTask = started.tasks.find((candidate) => candidate.taskId === taskId);
      if (!runningTask || runningTask.status !== 'running') throw new Error(`Bootstrap task ${taskId} did not start`);
      const before = await readTargetHistory(client, context.targetOrigin, context.config.rules, cancellationSignal);
      await openCaptureBoundSession(
        dependencies,
        input.repoPath,
        session,
        captureToken,
        identity?.authentication.login_url ?? context.targetUrl,
        cancellationSignal,
      );
      let after: HistorySnapshot;
      let submitted: WorkerContribution | null = null;
      let submissionFailure: unknown = null;
      try {
        const auditSession = dependencies.createAuditSession(input, context.runScope);
        await auditSession.initialize(input.workflowId);
        const tools = callerTools(
          createBlackboxTools({
            role: 'blackbox-recon',
            readTargetHistory: async () => {
              const current = await readTargetHistory(
                client,
                context.targetOrigin,
                context.config.rules,
                cancellationSignal,
              );
              return previewTraffic(
                before,
                current,
                context,
                captureToken,
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
          ...(cancellationSignal ? { cancellationSignal } : {}),
        })) as WorkerContribution;
      } catch (error) {
        cancellationSignal?.throwIfAborted();
        submissionFailure = error;
        activityLogger().warn(`Recon model failed after browsing as ${actor}; preserving attributable traffic`, {
          error: error instanceof Error ? error.name : 'unknown',
        });
      } finally {
        after = await readTargetHistory(client, context.targetOrigin, context.config.rules, cancellationSignal);
      }

      let successEvidence: string | null = null;
      if (identity) {
        const storagePath = statePath(input.repoPath, identity.name);
        const checked = await dependencies.runBrowserCommand(
          'playwright-cli',
          [`-s=${session}`, 'eval', successExpression(identity.authentication.success_condition)],
          cancellableBrowserOptions(input.repoPath, cancellationSignal),
        );
        if (!authCheckSucceeded(checked.stdout)) {
          const recoverySession = `bb-capture-recovery-${identity.name}`;
          let recovered = false;
          try {
            await assertStorageState(dependencies.fileSystem, storagePath, identity.name);
            const recoveryCaptureToken = createCaptureToken(dependencies);
            await restoreIdentityState(
              dependencies,
              input.repoPath,
              recoverySession,
              storagePath,
              recoveryCaptureToken,
              context.targetUrl,
              cancellationSignal,
            );
            const recoveryChecked = await dependencies.runBrowserCommand(
              'playwright-cli',
              [`-s=${recoverySession}`, 'eval', successExpression(identity.authentication.success_condition)],
              cancellableBrowserOptions(input.repoPath, cancellationSignal),
            );
            if (authCheckSucceeded(recoveryChecked.stdout)) {
              await saveIdentityState(dependencies, input.repoPath, recoverySession, identity.name, cancellationSignal);
              recovered = true;
            }
          } catch {
            cancellationSignal?.throwIfAborted();
          } finally {
            try {
              await dependencies.runBrowserCommand('playwright-cli', [`-s=${recoverySession}`, 'close'], {
                cwd: input.repoPath,
              });
            } catch (error) {
              activityLogger().warn(`Unable to close Playwright session ${recoverySession}`, {
                error: error instanceof Error ? error.name : 'unknown',
              });
            }
          }
          if (!recovered) {
            throw new Error(`Identity ${identity.name} did not satisfy its configured success condition`);
          }
        } else {
          await saveIdentityState(dependencies, input.repoPath, session, identity.name, cancellationSignal);
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
        captureToken,
        identityBoundRequestFields: context.config.identityBoundRequestFields,
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
      const identityCaptures = identity ? [{ identity: identity.name, stateRef: stateRef(identity.name) }] : undefined;
      const semanticEnrichmentPresent =
        (contribution.resources?.length ?? 0) > 0 || (contribution.transitions?.length ?? 0) > 0;
      let settled: BlackboxSnapshot;
      try {
        settled = await store.settleTasks({
          operationKey: `${input.workflowId}:0:settle:${taskId}`,
          baseRevision: started.revision,
          contributions: [contribution],
          failures: [],
          ...(identityCaptures ? { identityCaptures } : {}),
        });
      } catch (error) {
        if (!(error instanceof BlackboardValidationError) || !semanticEnrichmentPresent) throw error;
        activityLogger().warn('Blackboard rejected model enrichment; retrying observed capture', {
          actor,
          error: error.name,
          reason: safeFailureReason(error, context.configuredSecrets),
        });
        settled = await store.settleTasks({
          operationKey: `${input.workflowId}:0:settle-observed-only:${taskId}`,
          baseRevision: started.revision,
          contributions: [{ taskId, role: 'blackbox-recon', baseRevision: started.revision, exchanges }],
          failures: [],
          ...(identityCaptures ? { identityCaptures } : {}),
        });
      }
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
      cancellationSignal?.throwIfAborted();
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
    const context = await loadRuntimeContext(dependencies, input);
    const { snapshot } = await initializeStore(input, context);
    return toSchedulerSnapshot(snapshot, context.config.rules);
  };

  const runBlackboxPlanner = async (input: BlackboxActivityInput, revision: number): Promise<PlannerBatch> => {
    const context = await loadRuntimeContext(dependencies, input);
    const cancellationSignal = dependencies.getCancellationSignal();
    const { snapshot } = await initializeStore(input, context);
    if (snapshot.revision !== revision) throw new Error('Planner activity received a stale blackboard revision');
    const auditSession = dependencies.createAuditSession(input, context.runScope);
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
      ...(cancellationSignal ? { cancellationSignal } : {}),
    })) as PlannerBatch;
    return namespacePlannerBatch(submitted, revision);
  };

  const runReconActivity = async (input: BlackboxWorkerActivityInput): Promise<WorkerContribution> => {
    const context = await loadRuntimeContext(dependencies, input);
    const cancellationSignal = dependencies.getCancellationSignal();
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
    await client.connect(cancellationSignal);
    const session = `bb-${actor}`;
    const captureToken = createCaptureToken(dependencies);
    try {
      if (identity) {
        await restoreIdentityState(
          dependencies,
          input.repoPath,
          session,
          statePath(input.repoPath, identity.name),
          captureToken,
          context.targetUrl,
          cancellationSignal,
        );
      }
      if (!identity) {
        await openCaptureBoundSession(
          dependencies,
          input.repoPath,
          session,
          captureToken,
          context.targetUrl,
          cancellationSignal,
        );
      }
      if (identity) {
        const checked = await dependencies.runBrowserCommand(
          'playwright-cli',
          [`-s=${session}`, 'eval', successExpression(identity.authentication.success_condition)],
          cancellableBrowserOptions(input.repoPath, cancellationSignal),
        );
        if (!authCheckSucceeded(checked.stdout)) {
          throw new Error(`Captured state for identity ${identity.name} no longer satisfies its success condition`);
        }
        await saveIdentityState(dependencies, input.repoPath, session, identity.name, cancellationSignal);
      }

      const before = await readTargetHistory(client, context.targetOrigin, context.config.rules, cancellationSignal);
      const tools = callerTools(
        createBlackboxTools({
          role: 'blackbox-recon',
          readTargetHistory: async () => {
            const current = await readTargetHistory(
              client,
              context.targetOrigin,
              context.config.rules,
              cancellationSignal,
            );
            return previewTraffic(
              before,
              current,
              context,
              captureToken,
              actor,
              persistedTask.taskId,
              input.revision,
              captureSequenceOffset(snapshot.exchanges, actor),
            );
          },
        }),
      );
      const auditSession = dependencies.createAuditSession(input, context.runScope);
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
          ...(cancellationSignal ? { cancellationSignal } : {}),
        })) as WorkerContribution;
      } catch (error) {
        cancellationSignal?.throwIfAborted();
        submissionFailure = error;
        activityLogger().warn(
          `Recon model failed after task ${persistedTask.taskId}; preserving attributable traffic`,
          {
            error: error instanceof Error ? error.name : 'unknown',
          },
        );
      } finally {
        after = await readTargetHistory(client, context.targetOrigin, context.config.rules, cancellationSignal);
      }
      if (identity) {
        const checked = await dependencies.runBrowserCommand(
          'playwright-cli',
          [`-s=${session}`, 'eval', successExpression(identity.authentication.success_condition)],
          cancellableBrowserOptions(input.repoPath, cancellationSignal),
        );
        if (!authCheckSucceeded(checked.stdout)) {
          throw new Error(`Captured state for identity ${identity.name} is no longer authenticated`);
        }
        await dependencies.runBrowserCommand(
          'playwright-cli',
          [`-s=${session}`, 'state-save', statePath(input.repoPath, identity.name)],
          cancellableBrowserOptions(input.repoPath, cancellationSignal),
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
        captureToken,
        identityBoundRequestFields: context.config.identityBoundRequestFields,
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
    const cancellationSignal = dependencies.getCancellationSignal();
    const { snapshot } = await initializeStore(input, context);
    if (snapshot.revision !== input.revision) throw new Error('blackbox-action received a stale blackboard revision');
    const task = snapshot.tasks.find(({ taskId }) => taskId === input.task.taskId);
    if (!task || task.status !== 'running') throw new Error('blackbox-action task is not running');
    if (task.kind !== 'action' || !task.replayPlan) {
      throw new Error('blackbox-action requires a running action task with an approved replay plan');
    }
    if (!task.hypothesisId) throw new Error('blackbox-action requires a linked hypothesis');
    const sequence = replaySequence(task);
    const actorNames = new Set(sequence.steps.map(({ actor }) => actor));
    const actionProofCondition = sequence.proofCondition;
    if (actionProofCondition.type === 'persistent_state') {
      const verificationSource = snapshot.exchanges.find(
        ({ exchangeId }) => exchangeId === actionProofCondition.verificationSourceExchangeId,
      );
      if (verificationSource) actorNames.add(verificationSource.identity);
    }
    const actors = [...actorNames];
    const knownIdentities = context.config.identities.map(({ name }) => name);
    const identityState = dependencies.createIdentityStateResolver(input.repoPath, knownIdentities);
    const client = dependencies.createBurpClient(context.burpSettings);
    const sessions = actors.map((actor) => ({
      actor,
      session: `bb-action-${task.taskId}-${actor}`,
      captureToken: createCaptureToken(dependencies),
    }));
    const dynamicExchanges: NormalizedExchange[] = [];
    let outcome: ReplayOutcome | null = null;
    let requestedFreshActor: string | 'anonymous' | null = null;

    try {
      await client.connect(cancellationSignal);
      for (const { actor, session, captureToken } of sessions) {
        const identity = context.config.identities.find(({ name }) => name === actor);
        if (actor !== 'anonymous' && !identity) throw new Error(`Unknown replay actor ${actor}`);
        if (identity) {
          await restoreIdentityState(
            dependencies,
            input.repoPath,
            session,
            statePath(input.repoPath, identity.name),
            captureToken,
            context.targetUrl,
            cancellationSignal,
          );
        } else {
          await openCaptureBoundSession(
            dependencies,
            input.repoPath,
            session,
            captureToken,
            context.targetUrl,
            cancellationSignal,
          );
        }
        if (identity) {
          const checked = await dependencies.runBrowserCommand(
            'playwright-cli',
            [`-s=${session}`, 'eval', successExpression(identity.authentication.success_condition)],
            cancellableBrowserOptions(input.repoPath, cancellationSignal),
          );
          if (!authCheckSucceeded(checked.stdout)) {
            throw new Error(`Captured state for replay actor ${identity.name} is no longer authenticated`);
          }
          await saveIdentityState(dependencies, input.repoPath, session, identity.name, cancellationSignal);
        }
      }

      let historyCheckpoint = await readTargetHistory(
        client,
        context.targetOrigin,
        context.config.rules,
        cancellationSignal,
      );
      const executeApprovedReplay = async (): Promise<ReplayOutcome> => {
        for (const { actor, session } of sessions) {
          if (actor === 'anonymous') continue;
          await dependencies.runBrowserCommand(
            'playwright-cli',
            [`-s=${session}`, 'state-save', statePath(input.repoPath, actor)],
            cancellableBrowserOptions(input.repoPath, cancellationSignal),
          );
        }
        const currentHistory = await readTargetHistory(
          client,
          context.targetOrigin,
          context.config.rules,
          cancellationSignal,
        );
        if (requestedFreshActor) {
          const requestedSession = sessions.find(({ actor }) => actor === requestedFreshActor);
          if (!requestedSession) throw new Error(`No capture-bound session exists for ${requestedFreshActor}`);
          const captured = await normalizeCapturedTraffic({
            targetOrigin: context.targetOrigin,
            rules: context.config.rules,
            identity: requestedFreshActor,
            before: historyCheckpoint,
            after: currentHistory,
            rawDirectory: rawDirectory(input.repoPath),
            configuredSecrets: context.configuredSecrets,
            captureToken: requestedSession.captureToken,
            identityBoundRequestFields: context.config.identityBoundRequestFields,
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
          identityBoundRequestFields: context.config.identityBoundRequestFields,
          provenance: { actor: 'blackbox-action', taskId: task.taskId, baseRevision: input.revision },
          ...(cancellationSignal ? { cancellationSignal } : {}),
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
      const auditSession = dependencies.createAuditSession(input, context.runScope);
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
          ...(cancellationSignal ? { cancellationSignal } : {}),
        })) as WorkerContribution;
      } catch (error) {
        cancellationSignal?.throwIfAborted();
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
      const proposedCandidateProofs = submitted
        ? namespaceContributionRecords(submitted, task.taskId).candidateProofs?.map((candidate) => ({
            ...candidate,
            actionId: task.taskId,
            hypothesisId: task.hypothesisId as string,
          }))
        : undefined;
      const validationSnapshot: BlackboxSnapshot = {
        ...snapshot,
        exchanges: [...snapshot.exchanges, ...allExchanges.values()],
      };
      const candidateProofs =
        finalOutcome.status === 'completed' &&
        supportsFindingCandidate(
          finalOutcome.observation,
          sequence.proofCondition,
          observedExchanges.at(-1)?.exchangeId,
        ) &&
        proposedCandidateProofs
          ? proposedCandidateProofs.filter((candidate) =>
              hasValidBlackboxControlEvidence(validationSnapshot, candidate, action, context.targetOrigin),
            )
          : undefined;
      return {
        taskId: task.taskId,
        role: 'blackbox-action',
        baseRevision: input.revision,
        exchanges: [...allExchanges.values()],
        actions: [action],
        ...(candidateProofs && candidateProofs.length > 0 ? { candidateProofs } : {}),
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
    const cancellationSignal = dependencies.getCancellationSignal();
    const { snapshot } = await initializeStore(input, context);
    if (snapshot.revision !== input.revision) throw new Error('blackbox-verifier received a stale blackboard revision');
    const candidate = snapshot.candidateProofs.find(({ candidateId }) => candidateId === input.candidateId);
    if (!candidate) throw new Error(`Unknown verification candidate ${input.candidateId}`);
    const action = snapshot.actions.find(({ actionId }) => actionId === candidate.actionId);
    if (
      !action ||
      action.status !== 'completed' ||
      !supportsFindingCandidate(action.observation, action.sequence.proofCondition, action.exchangeIds.at(-1)) ||
      !hasValidBlackboxControlEvidence(snapshot, candidate, action, context.targetOrigin)
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
      captureToken: createCaptureToken(dependencies),
    }));
    for (const { storagePath } of sessions) {
      await dependencies.fileSystem.mkdir(path.dirname(storagePath), { recursive: true });
    }

    const client = dependencies.createBurpClient(context.burpSettings);
    const dynamicExchanges: NormalizedExchange[] = [];
    let outcome: ReplayOutcome | null = null;
    let requestedFreshActor: string | 'anonymous' | null = null;
    try {
      await client.connect(cancellationSignal);
      for (const { identity, session, storagePath, captureToken } of sessions) {
        await openCaptureBoundSession(
          dependencies,
          input.repoPath,
          session,
          captureToken,
          identity.authentication.login_url,
          cancellationSignal,
        );
        const loginTask = verificationLoginTask(verificationId, identity.name);
        const auditSession = dependencies.createAuditSession(input, context.runScope);
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
            ...(cancellationSignal ? { cancellationSignal } : {}),
          });
        } catch (error) {
          cancellationSignal?.throwIfAborted();
          activityLogger().warn(`Fresh verifier login agent for ${identity.name} did not submit cleanly`, {
            error: error instanceof Error ? error.name : 'unknown',
          });
        }
        await assertStorageState(dependencies.fileSystem, storagePath, identity.name);
        const checked = await dependencies.runBrowserCommand(
          'playwright-cli',
          [`-s=${session}`, 'eval', successExpression(identity.authentication.success_condition)],
          cancellableBrowserOptions(input.repoPath, cancellationSignal),
        );
        if (!authCheckSucceeded(checked.stdout)) {
          throw new Error(`Fresh verifier state for identity ${identity.name} is not authenticated`);
        }
      }
      let historyCheckpoint = await readTargetHistory(
        client,
        context.targetOrigin,
        context.config.rules,
        cancellationSignal,
      );
      const executeVerificationReplay = async (): Promise<ReplayOutcome> => {
        for (const { session, storagePath } of sessions) {
          await dependencies.runBrowserCommand(
            'playwright-cli',
            [`-s=${session}`, 'state-save', storagePath],
            cancellableBrowserOptions(input.repoPath, cancellationSignal),
          );
        }
        const currentHistory = await readTargetHistory(
          client,
          context.targetOrigin,
          context.config.rules,
          cancellationSignal,
        );
        if (requestedFreshActor) {
          const requestedSession = sessions.find(({ identity }) => identity.name === requestedFreshActor);
          if (!requestedSession) throw new Error(`No capture-bound verifier session exists for ${requestedFreshActor}`);
          const captured = await normalizeCapturedTraffic({
            targetOrigin: context.targetOrigin,
            rules: context.config.rules,
            identity: requestedFreshActor,
            before: historyCheckpoint,
            after: currentHistory,
            rawDirectory: rawDirectory(input.repoPath),
            configuredSecrets: context.configuredSecrets,
            captureToken: requestedSession.captureToken,
            identityBoundRequestFields: context.config.identityBoundRequestFields,
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
          identityBoundRequestFields: context.config.identityBoundRequestFields,
          provenance: { actor: 'blackbox-verifier', taskId: verificationId, baseRevision: input.revision },
          ...(cancellationSignal ? { cancellationSignal } : {}),
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
      const auditSession = dependencies.createAuditSession(input, context.runScope);
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
          ...(cancellationSignal ? { cancellationSignal } : {}),
        })) as VerificationResult;
      } catch (error) {
        cancellationSignal?.throwIfAborted();
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
          cancellableBrowserOptions(input.repoPath, cancellationSignal),
        );
        if (!authCheckSucceeded(checked.stdout)) {
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
    const context = await loadRuntimeContext(dependencies, input);
    const cancellationSignal = dependencies.getCancellationSignal();
    const { snapshot } = await initializeStore(input, context);
    if (snapshot.revision !== input.revision) throw new Error(`${kind} received a stale blackboard revision`);
    const persistedTask = snapshot.tasks.find(({ taskId }) => taskId === input.task.taskId);
    if (!persistedTask || persistedTask.status !== 'running') throw new Error(`${kind} task is not running`);
    if (persistedTask.kind !== 'analysis') throw new Error(`${kind} requires a running analysis task kind`);
    const auditSession = dependencies.createAuditSession(input, context.runScope);
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
      ...(cancellationSignal ? { cancellationSignal } : {}),
    })) as WorkerContribution;
    const namespaced = namespaceContributionRecords(submitted, persistedTask.taskId);
    return {
      taskId: persistedTask.taskId,
      role: kind,
      baseRevision: input.revision,
      ...(namespaced.hypotheses ? { hypotheses: namespaced.hypotheses } : {}),
    };
  };

  const reserveBlackboxPlanningWave = async (
    input: ReservePlanningWaveInput,
  ): Promise<TaskTransitionResult> => {
    const context = await loadRuntimeContext(dependencies, input);
    const { store } = await initializeStore(input, context);
    const next = await store.reservePlanningWave(input.revision, input.operationKey, input.waveNumber);
    return { revision: next.revision, tasks: taskStates(next) };
  };

  const registerPlannedWave = async (input: RegisterWaveInput): Promise<RegisteredWave> => {
    const context = await loadRuntimeContext(dependencies, input);
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
      planningWave: { waveNumber: input.waveNumber, plannerStop: input.batch.stop },
    });
    return { revision: next.revision, wave: structuredClone(input.wave), tasks: taskStates(next) };
  };

  const startBlackboxTasks = async (input: StartTasksInput): Promise<TaskTransitionResult> => {
    const context = await loadRuntimeContext(dependencies, input);
    const { store } = await initializeStore(input, context);
    const next = await store.startTasks(input.revision, input.operationKey, input.taskIds);
    return { revision: next.revision, tasks: taskStates(next) };
  };

  const settleBlackboxTasks = async (input: SettleTasksInput): Promise<SettledTasksResult> => {
    const context = await loadRuntimeContext(dependencies, input);
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
    const context = await loadRuntimeContext(dependencies, input);
    const { store } = await initializeStore(input, context);
    const next = await store.recordVerification(input.revision, input.operationKey, input.attempt);
    return next.revision;
  };

  const recordBlackboxVerificationFailure = async (input: RecordVerificationFailureInput): Promise<number> => {
    const context = await loadRuntimeContext(dependencies, input);
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
    const context = await loadRuntimeContext(dependencies, input);
    const { store, snapshot } = await initializeStore(input, context);
    if (
      snapshot.planningWave &&
      (snapshot.planningWave.phase !== 'registered' ||
        snapshot.planningWave.waveNumber !== input.waveNumber ||
        snapshot.planningWave.plannerStop !== input.plannerStop)
    ) {
      throw new Error('Progress evaluation does not match the registered planning wave');
    }
    const pendingTasks = snapshot.tasks.filter(({ status }) => status === 'pending' || status === 'running').length;
    const openImpactHypotheses = snapshot.hypotheses.filter(
      ({ status }) => status === 'open' || status === 'queued' || status === 'tested' || status === 'blocked',
    ).length;
    const decision = decideRunCompletion({
      wave: input.waveNumber,
      plannerStop: input.plannerStop,
      pendingTasks,
      openImpactHypotheses,
      unknownDeliveries: snapshot.actions.filter(({ status }) => status === 'delivery_unknown').length,
      hitSafetyLimit: input.waveNumber >= 8,
    });
    const next = await store.recordPlanningDecision(
      input.revision,
      input.operationKey,
      input.waveNumber,
      decision,
    );
    return { decision, revision: next.revision };
  };

  const finalizeBlackboxRun = async (input: FinalizeBlackboxInput): Promise<BlackboxWorkflowResult> => {
    const context = await loadRuntimeContext(dependencies, input);
    const { store, snapshot } = await initializeStore(input, context);
    const failure = input.failure ? safeFailureReason(input.failure, context.configuredSecrets) : null;
    const result = (
      findings: ReturnType<typeof collectVerifiedFindings>,
      terminalSnapshot: BlackboxSnapshot,
      legacyFailure: string | null = null,
    ): BlackboxWorkflowResult => {
      const committedFailure = Object.hasOwn(terminalSnapshot, 'terminalFailure')
        ? terminalSnapshot.terminalFailure ?? null
        : legacyFailure;
      return {
        mode: 'blackbox',
        status:
          terminalSnapshot.runStatus === 'complete' ? (findings.length > 0 ? 'findings' : 'no_findings') : 'incomplete',
        revision: terminalSnapshot.revision,
        findingCount: findings.length,
        artifactNames: BLACKBOX_ARTIFACT_NAMES,
        failures: committedFailure ? [committedFailure] : [],
      };
    };

    if (snapshot.runStatus !== 'running') {
      const completedOperation = snapshot.operationReceipts?.some(
        ({ operationKey }) => operationKey === input.operationKey,
      );
      if (snapshot.runStatus === input.status && completedOperation) {
        let terminalSnapshot = snapshot;
        if (Object.hasOwn(snapshot, 'terminalFailure')) {
          if ((snapshot.terminalFailure ?? null) !== failure) {
            throw new Error(`Operation key ${input.operationKey} was already used with different content`);
          }
          terminalSnapshot = await store.setRunStatus(input.revision, input.operationKey, input.status, failure);
        }
        const { findings, artifactNames } = await publishCommittedTerminalArtifacts(
          input,
          context,
          terminalSnapshot,
          failure,
        );
        if (input.outputPath) {
          await dependencies.copyDeliverables(input.repoPath, input.outputPath, artifactNames);
        }
        return result(findings, terminalSnapshot, failure);
      }
      throw new Error(`Blackboard is already terminal with status ${snapshot.runStatus}`);
    }

    const next = await store.setRunStatus(input.revision, input.operationKey, input.status, failure);
    const published = await publishCommittedTerminalArtifacts(input, context, next);
    if (input.outputPath) {
      await dependencies.copyDeliverables(input.repoPath, input.outputPath, published.artifactNames);
    }
    return result(published.findings, next);
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
    reserveBlackboxPlanningWave,
    registerPlannedWave,
    startBlackboxTasks,
    settleBlackboxTasks,
    recordBlackboxVerification,
    recordBlackboxVerificationFailure,
    evaluateBlackboxProgress,
    finalizeBlackboxRun,
  };
}

async function runProductionActivity<T>(execute: (activities: BlackboxActivityApi) => Promise<T>): Promise<T> {
  const context = Context.current();
  const signal = context.cancellationSignal;
  heartbeat({ mode: 'blackbox' });
  const heartbeatInterval = setInterval(() => heartbeat({ mode: 'blackbox' }), HEARTBEAT_INTERVAL_MS);
  try {
    signal.throwIfAborted();
    const result = await execute(createBlackboxActivities({ getCancellationSignal: () => signal }));
    signal.throwIfAborted();
    return result;
  } finally {
    clearInterval(heartbeatInterval);
  }
}

export async function preflightBlackbox(input: BlackboxActivityInput): Promise<BlackboxPreflightResult> {
  return runProductionActivity((activities) => activities.preflightBlackbox(input));
}

export async function captureAnonymous(input: BlackboxActivityInput): Promise<IdentityCaptureResult> {
  return runProductionActivity((activities) => activities.captureAnonymous(input));
}

export async function captureIdentity(
  input: BlackboxActivityInput,
  identityName: string,
): Promise<IdentityCaptureResult> {
  return runProductionActivity((activities) => activities.captureIdentity(input, identityName));
}

export async function readPlannerSnapshot(input: BlackboxActivityInput): Promise<BlackboxSchedulerSnapshot> {
  return runProductionActivity((activities) => activities.readPlannerSnapshot(input));
}

export async function runBlackboxPlanner(input: BlackboxActivityInput, revision: number): Promise<PlannerBatch> {
  return runProductionActivity((activities) => activities.runBlackboxPlanner(input, revision));
}

export async function runBlackboxRecon(input: BlackboxWorkerActivityInput): Promise<WorkerContribution> {
  return runProductionActivity((activities) => activities.runBlackboxRecon(input));
}

export async function runBlackboxAnalysis(input: BlackboxWorkerActivityInput): Promise<WorkerContribution> {
  return runProductionActivity((activities) => activities.runBlackboxAnalysis(input));
}

export async function runBlackboxAction(input: BlackboxWorkerActivityInput): Promise<WorkerContribution> {
  return runProductionActivity((activities) => activities.runBlackboxAction(input));
}

export async function runBlackboxVerifier(input: BlackboxVerifierActivityInput): Promise<BlackboxVerificationAttempt> {
  return runProductionActivity((activities) => activities.runBlackboxVerifier(input));
}

export async function reserveBlackboxPlanningWave(input: ReservePlanningWaveInput): Promise<TaskTransitionResult> {
  return runProductionActivity((activities) => activities.reserveBlackboxPlanningWave(input));
}

export async function registerPlannedWave(input: RegisterWaveInput): Promise<RegisteredWave> {
  return runProductionActivity((activities) => activities.registerPlannedWave(input));
}

export async function startBlackboxTasks(input: StartTasksInput): Promise<TaskTransitionResult> {
  return runProductionActivity((activities) => activities.startBlackboxTasks(input));
}

export async function settleBlackboxTasks(input: SettleTasksInput): Promise<SettledTasksResult> {
  return runProductionActivity((activities) => activities.settleBlackboxTasks(input));
}

export async function recordBlackboxVerification(input: RecordVerificationInput): Promise<number> {
  return runProductionActivity((activities) => activities.recordBlackboxVerification(input));
}

export async function recordBlackboxVerificationFailure(input: RecordVerificationFailureInput): Promise<number> {
  return runProductionActivity((activities) => activities.recordBlackboxVerificationFailure(input));
}

export async function evaluateBlackboxProgress(input: EvaluateProgressInput): Promise<EvaluateProgressResult> {
  return runProductionActivity((activities) => activities.evaluateBlackboxProgress(input));
}

export async function finalizeBlackboxRun(input: FinalizeBlackboxInput): Promise<BlackboxWorkflowResult> {
  return runProductionActivity((activities) => activities.finalizeBlackboxRun(input));
}
