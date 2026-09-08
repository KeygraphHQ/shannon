import { createHash } from 'node:crypto';
import { lstat, rm } from 'node:fs/promises';

export { copyBlackboxDeliverables } from '../blackbox/artifacts.js';

import { assertSameBlackboxRunScope, normalizeTargetOrigin } from '../blackbox/scope-guard.js';
import {
  parseResolvedAccessValidation,
  type ResolvedAccessValidation,
} from '../blackbox-observation/access-validation.js';
import { readDocument } from '../security-review/input.js';
import type { BlackboxRunScope } from '../types/blackbox.js';

export type WorkerMode = 'whitebox' | 'blackbox';

const MAX_VALIDATION_SELECTION_BYTES = 64 * 1024;

export interface CliArgs {
  readonly mode: WorkerMode;
  readonly webUrl: string;
  readonly repoPath: string;
  readonly taskQueue: string;
  readonly configPath?: string;
  readonly outputPath?: string;
  readonly pipelineTestingMode: boolean;
  readonly resumeFromWorkspace?: string;
  readonly validationSelectionPath?: string;
  readonly validationSelectionDigest?: string;
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
  let validationSelectionPath: string | undefined;
  let validationSelectionDigest: string | undefined;
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
      case '--validation-selection':
        validationSelectionPath = optionValue(argv, index, argument);
        index += 1;
        break;
      case '--validation-selection-digest':
        validationSelectionDigest = optionValue(argv, index, argument);
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
  if (Boolean(validationSelectionPath) !== Boolean(validationSelectionDigest)) {
    throw new Error('--validation-selection and --validation-selection-digest must be supplied together');
  }
  if (validationSelectionDigest && !/^[a-f0-9]{64}$/u.test(validationSelectionDigest)) {
    throw new Error('--validation-selection-digest must be a lowercase SHA-256 digest');
  }
  if (mode !== 'blackbox' && validationSelectionPath) {
    throw new Error('A validation selection is supported only in black-box mode');
  }

  return {
    mode,
    webUrl,
    repoPath,
    taskQueue,
    pipelineTestingMode,
    ...(configPath ? { configPath } : {}),
    ...(outputPath ? { outputPath } : {}),
    ...(resumeFromWorkspace ? { resumeFromWorkspace } : {}),
    ...(validationSelectionPath ? { validationSelectionPath } : {}),
    ...(validationSelectionDigest ? { validationSelectionDigest } : {}),
  };
}

/** Read a normalized selector once, reject replacement/mutation, then remove it before agent startup. */
export async function consumeValidationSelectionFile(
  file: string,
  expectedDigest: string,
): Promise<ResolvedAccessValidation> {
  if (!/^[a-f0-9]{64}$/u.test(expectedDigest)) {
    throw new Error('Expected validation selection digest is invalid');
  }
  let removeConsumedFile = false;
  try {
    const before = await lstat(file);
    if (
      before.isSymbolicLink() ||
      !before.isFile() ||
      before.size < 2 ||
      before.size > MAX_VALIDATION_SELECTION_BYTES
    ) {
      throw new Error('Normalized validation selection is invalid');
    }
    removeConsumedFile = true;
    const read = await readDocument(
      file,
      { maxBytes: MAX_VALIDATION_SELECTION_BYTES, maxDepth: 8, maxNodes: 128, maxReferences: 0, timeoutMs: 5_000 },
      true,
    );
    const selection = parseResolvedAccessValidation(read.document);
    if (selection.selectionDigest !== expectedDigest) {
      throw new Error('Normalized validation selection does not match its out-of-band digest');
    }
    return selection;
  } finally {
    if (removeConsumedFile) await rm(file, { force: true });
  }
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
