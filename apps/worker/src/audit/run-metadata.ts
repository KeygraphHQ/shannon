// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import type {
  RecordedRunTermination,
  RunAttempt,
  RunCodeIdentity,
  RunMetadata,
  RunTerminationReason,
} from '../types/run-metadata.js';
import { SessionMutex } from '../utils/concurrency.js';
import { atomicWrite } from '../utils/file-io.js';

const metadataMutex = new SessionMutex();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASONS: readonly RunTerminationReason[] = [
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
type TerminalStatus = 'complete' | 'incomplete' | 'failed';

interface RunIdentity {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly historyComplete: boolean;
}

interface StoredAttempt extends RunAttempt {
  readonly decision?: RunTerminationReason;
  readonly pendingFinalization?: RecordedRunTermination & { readonly status: TerminalStatus };
  readonly finalizedStatus?: TerminalStatus;
}

function assertTimestamp(value: string): void {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error('Run metadata timestamp must be an ISO UTC timestamp');
  }
}

function assertReason(value: RunTerminationReason): void {
  if (!REASONS.includes(value)) throw new Error('Run metadata termination reason is invalid');
}

function orderedAttempts(attempts: StoredAttempt[]): StoredAttempt[] {
  if (attempts.length === 0) return [];
  const byParent = new Map<string | null, StoredAttempt>();
  for (const attempt of attempts) {
    if (byParent.has(attempt.resumedFromAttemptId))
      throw new Error('Run metadata contains conflicting attempt lineage');
    byParent.set(attempt.resumedFromAttemptId, attempt);
  }
  const ordered: StoredAttempt[] = [];
  let current = byParent.get(null);
  while (current && ordered.length < attempts.length) {
    ordered.push(current);
    current = byParent.get(current.attemptId);
  }
  if (current || ordered.length !== attempts.length)
    throw new Error('Run metadata attempt lineage is incomplete or cyclic');
  return ordered;
}

function validateAttempt(attempt: StoredAttempt): void {
  if (!UUID.test(attempt.attemptId) || typeof attempt.workflowId !== 'string' || !attempt.workflowId)
    throw new Error('Run metadata attempt identity is invalid');
  if (attempt.resumedFromAttemptId !== null && !UUID.test(attempt.resumedFromAttemptId))
    throw new Error('Run metadata parent is invalid');
  assertTimestamp(attempt.startedAt);
  if (attempt.endedAt !== null) assertTimestamp(attempt.endedAt);
  if (
    !attempt.code ||
    typeof attempt.code !== 'object' ||
    Array.isArray(attempt.code) ||
    (attempt.code.revision !== null && !/^[0-9a-f]{40,64}$/.test(attempt.code.revision)) ||
    (attempt.code.sha256 !== null && !/^[0-9a-f]{64}$/.test(attempt.code.sha256)) ||
    (attempt.code.dirty !== null && typeof attempt.code.dirty !== 'boolean') ||
    (attempt.configuredModel !== null && typeof attempt.configuredModel !== 'string')
  )
    throw new Error('Run metadata code/model identity is invalid');
  if (attempt.termination !== null) {
    if (!attempt.termination || !['workflow', 'temporal', 'worker'].includes(attempt.termination.source))
      throw new Error('Run metadata termination source is invalid');
    assertReason(attempt.termination.code);
  }
  if ((attempt.endedAt === null) !== (attempt.termination === null))
    throw new Error('Run metadata ending is incomplete');
  if (attempt.decision !== undefined) assertReason(attempt.decision);
  if (attempt.pendingFinalization) {
    assertTimestamp(attempt.pendingFinalization.endedAt);
    assertReason(attempt.pendingFinalization.reason);
    if (!['complete', 'incomplete', 'failed'].includes(attempt.pendingFinalization.status))
      throw new Error('Run metadata finalization status is invalid');
  }
  if (
    attempt.finalizedStatus !== undefined &&
    (!['complete', 'incomplete', 'failed'].includes(attempt.finalizedStatus) ||
      attempt.termination?.source !== 'workflow' ||
      !attempt.pendingFinalization)
  )
    throw new Error('Run metadata finalized assessment is invalid');
}

async function optionalJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/** Passive audit storage. Each attempt owns its file, including across worker processes. */
export class RunMetadataStore {
  private readonly directory: string;

  constructor(repoPath: string) {
    this.directory = path.resolve(repoPath, '.shannon', 'run-metadata');
  }

  private attemptPath(attemptId: string): string {
    if (!UUID.test(attemptId)) throw new Error('Run metadata attempt ID must be a UUID');
    return path.join(this.directory, `${attemptId}.json`);
  }

  private async records(): Promise<{ identity: RunIdentity; attempts: StoredAttempt[] } | null> {
    const identity = await optionalJson<RunIdentity>(path.join(this.directory, 'run.json'));
    if (!identity) return null;
    if (identity.schemaVersion !== 1 || !UUID.test(identity.runId) || typeof identity.historyComplete !== 'boolean') {
      throw new Error('Run metadata identity is invalid');
    }
    const files = (await fs.readdir(this.directory)).filter(
      (name) => name.endsWith('.json') && UUID.test(name.slice(0, -5)),
    );
    const attempts = await Promise.all(
      files.map(async (name) => {
        const attempt = await optionalJson<StoredAttempt>(path.join(this.directory, name));
        if (
          !attempt ||
          `${attempt.attemptId}.json` !== name ||
          !attempt.code ||
          typeof attempt.workflowId !== 'string'
        ) {
          throw new Error('Run metadata attempt is invalid');
        }
        validateAttempt(attempt);
        return attempt;
      }),
    );
    return { identity, attempts: orderedAttempts(attempts) };
  }

  async read(): Promise<RunMetadata | null> {
    const records = await this.records();
    const current = records?.attempts.at(-1);
    if (!records || !current) return null;
    return {
      ...records.identity,
      currentAttemptId: current.attemptId,
      resultAttemptId:
        [...records.attempts].reverse().find((attempt) => attempt.finalizedStatus !== undefined)?.attemptId ?? null,
      attempts: records.attempts.map(
        ({ decision: _decision, pendingFinalization: _pending, finalizedStatus: _status, ...attempt }) => attempt,
      ),
    };
  }

  private async requiredMetadata(): Promise<RunMetadata> {
    const metadata = await this.read();
    if (!metadata) throw new Error('Run metadata disappeared during the update');
    return metadata;
  }

  async start(input: {
    readonly attemptId: string;
    readonly workflowId: string;
    readonly startedAt: string;
    readonly isResume: boolean;
    readonly code: RunCodeIdentity;
    readonly configuredModel: string | null;
  }): Promise<RunMetadata> {
    const file = this.attemptPath(input.attemptId);
    assertTimestamp(input.startedAt);
    const unlock = await metadataMutex.lock(this.directory);
    try {
      const previous = await this.records();
      const existing = previous?.attempts.find((attempt) => attempt.attemptId === input.attemptId);
      if (existing) {
        if (
          existing.workflowId !== input.workflowId ||
          existing.startedAt !== input.startedAt ||
          existing.configuredModel !== input.configuredModel ||
          !isDeepStrictEqual(existing.code, input.code)
        )
          throw new Error('Run metadata attempt ID was reused');
        return this.requiredMetadata();
      }
      if (previous?.attempts.length && !input.isResume)
        throw new Error('Existing run metadata requires an explicit resume');
      await fs.mkdir(this.directory, { recursive: true });
      if (!previous) {
        // Publish once without replacing an identity another process may have created.
        const temporaryIdentity = path.join(this.directory, `${randomUUID()}.identity.tmp`);
        try {
          await fs.writeFile(
            temporaryIdentity,
            JSON.stringify({
              schemaVersion: 1,
              runId: randomUUID(),
              historyComplete: !input.isResume,
            }),
          );
          try {
            await fs.link(temporaryIdentity, path.join(this.directory, 'run.json'));
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
          }
        } finally {
          await fs.unlink(temporaryIdentity).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== 'ENOENT') throw error;
          });
        }
      }
      const attempt: RunAttempt = {
        attemptId: input.attemptId,
        workflowId: input.workflowId,
        resumedFromAttemptId: previous?.attempts.at(-1)?.attemptId ?? null,
        startedAt: input.startedAt,
        endedAt: null,
        code: input.code,
        configuredModel: input.configuredModel,
        termination: null,
      };
      validateAttempt(attempt);
      await atomicWrite(file, attempt);
      return this.requiredMetadata();
    } finally {
      unlock();
    }
  }

  private async update(attemptId: string, transform: (attempt: StoredAttempt) => StoredAttempt): Promise<void> {
    const file = this.attemptPath(attemptId);
    const unlock = await metadataMutex.lock(file);
    try {
      const attempt = await optionalJson<StoredAttempt>(file);
      if (!attempt) throw new Error('Run metadata attempt is missing');
      validateAttempt(attempt);
      const next = transform(attempt);
      validateAttempt(next);
      await atomicWrite(file, next);
    } finally {
      unlock();
    }
  }

  async recordDecision(attemptId: string, reason: RunTerminationReason): Promise<void> {
    assertReason(reason);
    await this.update(attemptId, (attempt) => (attempt.endedAt ? attempt : { ...attempt, decision: reason }));
  }

  async prepareFinalization(
    attemptId: string,
    status: TerminalStatus,
    termination: RecordedRunTermination,
  ): Promise<void> {
    assertTimestamp(termination.endedAt);
    assertReason(termination.reason);
    await this.update(attemptId, (attempt) => {
      const reason = termination.reason === 'unknown' ? (attempt.decision ?? 'unknown') : termination.reason;
      if (attempt.pendingFinalization) {
        if (attempt.pendingFinalization.status === status && attempt.pendingFinalization.reason === reason)
          return attempt;
        if (attempt.finalizedStatus) throw new Error('Run finalization metadata conflicts with its prior record');
      }
      if (attempt.endedAt) return attempt;
      return { ...attempt, pendingFinalization: { ...termination, reason, status } };
    });
  }

  /** Commit a previously recorded ending only after the assessment's terminal state exists. */
  async commitFinalization(status: TerminalStatus, ownerWorkflowId?: string): Promise<RunMetadata | null> {
    const records = await this.records();
    const finalized = records?.attempts.find((attempt) => attempt.finalizedStatus !== undefined);
    if (finalized) {
      if (finalized.finalizedStatus !== status || (ownerWorkflowId && finalized.workflowId !== ownerWorkflowId)) {
        throw new Error('Run metadata result does not match the committed assessment');
      }
      return this.read();
    }
    const pending = records
      ? [...records.attempts]
          .reverse()
          .find(
            (attempt) =>
              attempt.pendingFinalization?.status === status &&
              (!ownerWorkflowId || attempt.workflowId === ownerWorkflowId),
          )
      : undefined;
    if (pending)
      await this.update(pending.attemptId, (attempt) => {
        const ending = attempt.pendingFinalization;
        if (!ending || ending.status !== status) throw new Error('Run finalization metadata changed before commit');
        return {
          ...attempt,
          endedAt: ending.endedAt,
          termination: { code: ending.reason, source: 'workflow' },
          finalizedStatus: status,
        };
      });
    return this.read();
  }

  /** An external observation never fabricates an end time for an unobserved kill. */
  async observeEnd(
    attemptId: string,
    endedAt: string,
    reason: RunTerminationReason,
    source: 'temporal' | 'worker',
  ): Promise<void> {
    assertTimestamp(endedAt);
    assertReason(reason);
    await this.update(attemptId, (attempt) => {
      if (attempt.endedAt) return attempt;
      return { ...attempt, endedAt, termination: { code: reason, source } };
    });
  }
}

/** This decision description is audit data and never controls scheduling. */
export function describeRecordedDecision(input: {
  readonly decision: 'continue' | 'complete' | 'incomplete';
  readonly plannerStopped: boolean;
  readonly pendingTasks: number;
  readonly unknownDeliveries: number;
  readonly limitReached: boolean;
}): RunTerminationReason | null {
  if (input.decision === 'continue') return null;
  if (input.decision === 'complete') return 'completed';
  if (input.plannerStopped && input.pendingTasks === 0 && input.unknownDeliveries > 0) return 'uncertain_execution';
  return input.limitReached ? 'limit_reached' : 'unknown';
}

/** Identify the worker installation, never the target repository passed to the scan. */
export async function captureWorkerCodeIdentity(): Promise<RunCodeIdentity> {
  const distRoot = fileURLToPath(new URL('../', import.meta.url));
  const checkoutRoot = path.resolve(distRoot, '../../..');
  let revision: string | null = null;
  let dirty: boolean | null = null;
  try {
    await fs.stat(path.join(checkoutRoot, '.git'));
    const value = execFileSync('git', ['-C', checkoutRoot, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    if (/^[0-9a-f]{40,64}$/.test(value)) revision = value;
    dirty =
      execFileSync('git', ['-C', checkoutRoot, 'status', '--porcelain', '--untracked-files=normal'], {
        encoding: 'utf8',
        timeout: 2000,
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim().length > 0;
  } catch {
    /* Git metadata is absent from packaged worker images. */
  }
  let sha256: string | null = null;
  try {
    const digest = createHash('sha256');
    const visit = async (directory: string): Promise<void> => {
      const entries = (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      for (const entry of entries) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) await visit(file);
        else if (entry.isFile() && entry.name.endsWith('.js')) {
          const bytes = await fs.readFile(file);
          digest.update(`${path.relative(distRoot, file).replaceAll('\\', '/')}\0${bytes.length}\0`).update(bytes);
        }
      }
    };
    await visit(distRoot);
    sha256 = digest.digest('hex');
  } catch {
    /* Unavailable provenance remains explicitly unknown. */
  }
  return { revision, dirty, sha256 };
}
