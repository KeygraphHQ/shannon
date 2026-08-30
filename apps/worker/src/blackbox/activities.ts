// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { writePlaywrightStealthConfig } from '../ai/playwright-config-writer.js';
import { redactSensitive } from '../ai/sensitive-redaction.js';
import { AuditSession } from '../audit/index.js';
import { normalizeBlackboxConfig, parseConfig } from '../config-parser.js';
import { createActivityLogger } from '../temporal/activity-logger.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import type {
  BlackboardStore,
  BlackboxSnapshot,
  NormalizedExchange,
  PlannerTask,
  WorkerContribution,
} from '../types/blackbox.js';
import type { Config, NormalizedBlackboxConfig, SuccessCondition } from '../types/config.js';
import { BlackboxAgentRunner, type RedactedBlackboxSlice, type RedactedIdentityContext } from './agent-runner.js';
import type { PlannerBatch } from './agents.js';
import { FileBlackboardStore } from './blackboard.js';
import {
  BurpMcpClient,
  type BurpMcpSettings,
  type BurpToolClient,
  type HistorySnapshot,
  readTargetHistory,
} from './burp-client.js';
import { type CaptureIndexEntry, FileIdentityStateResolver } from './identity-state.js';
import { normalizeTargetOrigin } from './scope-guard.js';
import { createBlackboxTools } from './tools.js';
import { diffHistory, normalizeCapturedTraffic, normalizeRawExchange } from './traffic-normalizer.js';

const execFileAsync = promisify(execFile);
const DEFAULT_BURP_MCP_URL = 'http://host.docker.internal:9876';
const DEFAULT_BURP_MCP_HOST_HEADER = '127.0.0.1:9876';
const AUTH_SUCCESS_MARKER = '__SHANNON_AUTH_OK__';
const AUTH_FAILURE_MARKER = '__SHANNON_AUTH_FAILED__';

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
}

interface CaptureIndexWriter {
  writeCaptureIndex(identity: string, entries: readonly CaptureIndexEntry[]): Promise<void>;
}

interface BlackboxAgentRunnerLike {
  run: BlackboxAgentRunner['run'];
}

interface BlackboxAuditSessionLike {
  initialize(workflowId?: string): Promise<void>;
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
  readonly createIdentityStateResolver: (repoPath: string, identities: readonly string[]) => CaptureIndexWriter;
}

export interface BlackboxActivityApi {
  preflightBlackbox(input: BlackboxActivityInput): Promise<BlackboxPreflightResult>;
  captureAnonymous(input: BlackboxActivityInput): Promise<IdentityCaptureResult>;
  captureIdentity(input: BlackboxActivityInput, identityName: string): Promise<IdentityCaptureResult>;
  readPlannerSnapshot(input: BlackboxActivityInput): Promise<RedactedBlackboxSlice>;
  runBlackboxPlanner(input: BlackboxActivityInput, revision: number): Promise<PlannerBatch>;
  runBlackboxRecon(input: BlackboxWorkerActivityInput): Promise<WorkerContribution>;
  runBlackboxAnalysis(input: BlackboxWorkerActivityInput): Promise<WorkerContribution>;
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
): readonly NormalizedExchange[] {
  return diffHistory(before, after)
    .map((raw, index) =>
      normalizeRawExchange({
        targetOrigin: context.targetOrigin,
        rules: context.config.rules,
        identity,
        raw,
        captureSequence: index + 1,
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
      let submitted: WorkerContribution;
      try {
        const auditSession = dependencies.createAuditSession(input);
        await auditSession.initialize(input.workflowId);
        const tools = callerTools(
          createBlackboxTools({
            role: 'blackbox-recon',
            readTargetHistory: async () => {
              const current = await readTargetHistory(client, context.targetOrigin, context.config.rules);
              return previewTraffic(before, current, context, actor, taskId, started?.revision ?? 0);
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
      });
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

      const contribution: WorkerContribution = {
        taskId,
        role: 'blackbox-recon',
        baseRevision: started.revision,
        exchanges,
        ...(submitted.resources ? { resources: submitted.resources } : {}),
        ...(submitted.transitions ? { transitions: submitted.transitions } : {}),
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

  const readPlannerSnapshot = async (input: BlackboxActivityInput): Promise<RedactedBlackboxSlice> => {
    const context = await loadTargetContext(dependencies, input);
    const { snapshot } = await initializeStore(input, context);
    return toRedactedSlice(snapshot);
  };

  const runBlackboxPlanner = async (input: BlackboxActivityInput, revision: number): Promise<PlannerBatch> => {
    const context = await loadTargetContext(dependencies, input);
    const { snapshot } = await initializeStore(input, context);
    if (snapshot.revision !== revision) throw new Error('Planner activity received a stale blackboard revision');
    const auditSession = dependencies.createAuditSession(input);
    await auditSession.initialize(input.workflowId);
    return (await dependencies.createAgentRunner(input).run({
      kind: 'planner',
      targetOrigin: context.targetOrigin,
      task: null,
      snapshot: toRedactedSlice(snapshot),
      identity: null,
      customTools: [],
      auditSession: auditSession as AuditSession,
      logger: activityLogger(),
    })) as PlannerBatch;
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
            return previewTraffic(before, current, context, actor, persistedTask.taskId, input.revision);
          },
        }),
      );
      const auditSession = dependencies.createAuditSession(input);
      await auditSession.initialize(input.workflowId);
      let after: HistorySnapshot;
      let submitted: WorkerContribution;
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
      } finally {
        after = await readTargetHistory(client, context.targetOrigin, context.config.rules);
      }
      if (identity) {
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
      });
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
      return {
        taskId: persistedTask.taskId,
        role: 'blackbox-recon',
        baseRevision: input.revision,
        exchanges,
        ...(submitted.resources ? { resources: submitted.resources } : {}),
        ...(submitted.transitions ? { transitions: submitted.transitions } : {}),
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

  const runWorker = async (
    kind: 'blackbox-recon' | 'blackbox-analysis',
    input: BlackboxWorkerActivityInput,
  ): Promise<WorkerContribution> => {
    if (kind === 'blackbox-recon') return runReconActivity(input);
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
    return {
      taskId: persistedTask.taskId,
      role: kind,
      baseRevision: input.revision,
      ...(submitted.hypotheses ? { hypotheses: submitted.hypotheses } : {}),
    };
  };

  return {
    preflightBlackbox,
    captureAnonymous: (input) => captureActor(input, 'anonymous'),
    captureIdentity: captureActor,
    readPlannerSnapshot,
    runBlackboxPlanner,
    runBlackboxRecon: (input) => runWorker('blackbox-recon', input),
    runBlackboxAnalysis: (input) => runWorker('blackbox-analysis', input),
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

export async function readPlannerSnapshot(input: BlackboxActivityInput): Promise<RedactedBlackboxSlice> {
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
