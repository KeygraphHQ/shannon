import { createHash } from 'node:crypto';

export { copyBlackboxDeliverables } from '../blackbox/artifacts.js';

import { assertSameBlackboxRunScope, normalizeTargetOrigin } from '../blackbox/scope-guard.js';
import type { BlackboxRunScope } from '../types/blackbox.js';

export type WorkerMode = 'whitebox' | 'blackbox';

export interface CliArgs {
  readonly mode: WorkerMode;
  readonly webUrl: string;
  readonly repoPath: string;
  readonly taskQueue: string;
  readonly configPath?: string;
  readonly outputPath?: string;
  readonly pipelineTestingMode: boolean;
  readonly resumeFromWorkspace?: string;
}

function optionValue(argv: readonly string[], index: number, name: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('-')) throw new Error(`${name} requires a value`);
  return value;
}

export function parseCliArgs(argv: readonly string[]): CliArgs {
  let mode: WorkerMode = 'whitebox';
  let webUrl: string | undefined;
  let repoPath: string | undefined;
  let taskQueue: string | undefined;
  let configPath: string | undefined;
  let outputPath: string | undefined;
  let resumeFromWorkspace: string | undefined;
  let pipelineTestingMode = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case '--blackbox':
        mode = 'blackbox';
        break;
      case '--task-queue':
        taskQueue = optionValue(argv, index, argument);
        index += 1;
        break;
      case '--config':
        configPath = optionValue(argv, index, argument);
        index += 1;
        break;
      case '--output':
        outputPath = optionValue(argv, index, argument);
        index += 1;
        break;
      case '--workspace':
        resumeFromWorkspace = optionValue(argv, index, argument);
        index += 1;
        break;
      case '--pipeline-testing':
        pipelineTestingMode = true;
        break;
      case '--help':
      case '-h':
        throw new Error('help requested');
      default:
        if (!argument) break;
        if (argument.startsWith('-')) throw new Error(`Unknown worker option: ${argument}`);
        if (!webUrl) webUrl = argument;
        else if (!repoPath) repoPath = argument;
        else throw new Error(`Unexpected positional argument: ${argument}`);
    }
  }

  if (!webUrl || !repoPath) throw new Error('webUrl and repoPath are required');
  if (!taskQueue) throw new Error('--task-queue is required');
  if (mode === 'blackbox' && !configPath) throw new Error('--config is required with --blackbox');

  return {
    mode,
    webUrl,
    repoPath,
    taskQueue,
    pipelineTestingMode,
    ...(configPath ? { configPath } : {}),
    ...(outputPath ? { outputPath } : {}),
    ...(resumeFromWorkspace ? { resumeFromWorkspace } : {}),
  };
}

export function workflowNameFor(mode: WorkerMode): 'pentestPipelineWorkflow' | 'blackboxAuthzWorkflow' {
  return mode === 'blackbox' ? 'blackboxAuthzWorkflow' : 'pentestPipelineWorkflow';
}

export function deriveWorkflowId(base: string, purpose: 'new' | 'resume', now = Date.now()): string {
  if (purpose === 'new' && /_shannon-\d+$/.test(base) && base.length <= 128) return base;
  const suffix = purpose === 'resume' ? `_resume_${now}` : `_shannon-${now}`;
  const candidate = `${base}${suffix}`;
  if (candidate.length <= 128) return candidate;

  const digest = createHash('sha256').update(base).digest('hex').slice(0, 12);
  const prefixLength = 128 - suffix.length - digest.length - 1;
  return `${base.slice(0, prefixLength)}-${digest}${suffix}`;
}

export function enforceResumeTerminationFailure(mode: WorkerMode, workflowId: string, error: unknown): void {
  if (mode !== 'blackbox') return;
  const reason = error instanceof Error ? error.message : String(error);
  throw new Error(`Failed to terminate black-box predecessor ${workflowId}: ${reason}`);
}

interface ResumeSession {
  readonly session: {
    readonly id: string;
    readonly webUrl: string;
    readonly mode?: WorkerMode;
    readonly blackboxScope?: BlackboxRunScope;
  };
}

export function assertResumeCompatible(
  persisted: ResumeSession,
  requested: Pick<CliArgs, 'mode' | 'webUrl'>,
  requestedBlackboxScope?: BlackboxRunScope,
): void {
  const persistedMode = persisted.session.mode ?? 'whitebox';
  if (persistedMode !== requested.mode) {
    throw new Error(`Resume mode mismatch: workspace is ${persistedMode}, request is ${requested.mode}`);
  }
  if (requested.mode === 'whitebox') {
    if (persisted.session.webUrl !== requested.webUrl) throw new Error('Resume URL mismatch');
    return;
  }
  if (!requestedBlackboxScope) throw new Error('Black-box resume requires a run scope');
  if (normalizeTargetOrigin(requested.webUrl) !== requestedBlackboxScope.targetOrigin) {
    throw new Error('Black-box resume scope mismatch: targetOrigin');
  }
  if (!persisted.session.blackboxScope) throw new Error('Black-box workspace has no persisted run scope');
  assertSameBlackboxRunScope(persisted.session.blackboxScope, requestedBlackboxScope);
}
