// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import { accessComparisonLimits } from './access-limits.js';
import {
  AccessComparisonOutputError,
  type AccessComparisonReport,
  serializeAccessComparison,
} from './access-serialize.js';
import type { AccessComparisonLimits, AccessComparisonResult } from './access-types.js';
import {
  contains,
  guardedFailureCode,
  localPath,
  type ObservationFileJob,
  withGuardedObservationInput,
  writeFixedOutput,
} from './files.js';
import { runAccessWorker } from './isolate.js';
import type { InputReadDiagnostic, ObservationInput, SourceManifest } from './types.js';

export interface AccessComparisonFileOptions {
  readonly rawDirectory?: string;
  readonly outputDirectory?: string;
  readonly limits?: Partial<AccessComparisonLimits>;
  readonly signal?: AbortSignal;
}

export interface AccessComparisonFileJob extends ObservationFileJob {
  readonly limits: AccessComparisonLimits;
}

const MESSAGES: Readonly<Record<string, string>> = {
  'unsafe-input': 'Saved comparison input is unavailable or unsafe.',
  'unsafe-output': 'Comparison output location is unavailable or unsafe.',
  'source-changed': 'Saved comparison input changed during processing.',
  'input-limit': 'Saved comparison input exceeds the enforced limit.',
  'output-failed': 'Comparison output processing failed.',
  'processing-timeout': 'Saved comparison processing exceeded the enforced deadline.',
  'processing-failed': 'Saved comparison processing failed.',
};

class AccessComparisonProcessingError extends Error {
  constructor() {
    super('Saved comparison processing failed.');
    this.name = 'AccessComparisonProcessingError';
  }
}

function failedResult(
  code: string,
  limits: AccessComparisonLimits,
  sources: readonly SourceManifest[] = [],
): AccessComparisonResult {
  return {
    schemaVersion: 1,
    kind: 'offline-blackbox-cross-identity-triage',
    status: 'failed',
    limits,
    sources,
    scope: {
      basis: 'supplied-saved-records',
      authorization: 'not-assessed',
      sessionValidity: 'not-assessed',
      expectedPolicy: 'unknown',
      semanticEquivalence: 'not-established',
      applicationCoverage: 'unknown',
    },
    counts: {
      groups: 0,
      comparisons: 0,
      recordedComparisons: 0,
      strongComparisons: 0,
      insufficientComparisons: 0,
    },
    identities: [],
    groups: [],
    comparisons: [],
    diagnostics: [{ code, message: MESSAGES[code] ?? MESSAGES['processing-failed'] ?? '', sources: [] }],
  };
}

function failureReport(
  code: string,
  limits: AccessComparisonLimits,
  sources: readonly SourceManifest[] = [],
): AccessComparisonReport {
  return serializeAccessComparison(failedResult(code, limits, sources));
}

/** Compare one guarded native artifact directory in a fixed, reaped worker. */
export async function compareAccessDirectory(
  directory: string,
  options: AccessComparisonFileOptions = {},
): Promise<AccessComparisonReport> {
  const started = process.hrtime.bigint();
  const limits = accessComparisonLimits(options.limits);
  const deadline = started + BigInt(limits.timeoutMs) * 1_000_000n;
  let job: AccessComparisonFileJob;
  try {
    job = {
      directory: localPath(directory),
      limits,
      ...(options.rawDirectory === undefined ? {} : { rawDirectory: localPath(options.rawDirectory) }),
      ...(options.outputDirectory === undefined ? {} : { outputDirectory: localPath(options.outputDirectory) }),
    };
    if (job.outputDirectory) {
      for (const input of [job.directory, ...(job.rawDirectory ? [job.rawDirectory] : [])]) {
        if (contains(input, job.outputDirectory) || contains(job.outputDirectory, input))
          return failureReport('unsafe-output', limits);
      }
    }
  } catch {
    return failureReport('unsafe-input', limits);
  }
  const outcome = await runAccessWorker(job, deadline, options.signal);
  if (outcome.code === 'processing-timeout') return failureReport(outcome.code, limits);
  if (outcome.code) throw new AccessComparisonProcessingError();
  const message = outcome.message as { report?: AccessComparisonReport; outputLimit?: boolean } | undefined;
  if (message?.outputLimit) throw new AccessComparisonOutputError('Comparison output exceeds the enforced limit.');
  if (!message?.report) throw new AccessComparisonProcessingError();
  return message.report;
}

/** Internal fixed comparison-worker operation. */
export async function loadAccessComparison(
  job: AccessComparisonFileJob,
  compare: (input: ObservationInput, limits: AccessComparisonLimits) => AccessComparisonResult,
): Promise<AccessComparisonReport> {
  const limits = accessComparisonLimits(job.limits);
  const sources: SourceManifest[] = [];
  const inputDiagnostics: InputReadDiagnostic[] = [];
  try {
    const guarded = await withGuardedObservationInput(job, limits, true, sources, inputDiagnostics, (input) =>
      serializeAccessComparison(compare(input, limits)),
    );
    const report = guarded.value;
    if (report.result.status !== 'failed')
      await writeFixedOutput(
        job,
        [
          ['comparison.json', report.json],
          ['comparison.md', report.markdown],
        ],
        guarded.guard,
      );
    return report;
  } catch (error) {
    if (error instanceof AccessComparisonOutputError) throw error;
    const code = guardedFailureCode(error);
    if (code === 'output-failed') throw error;
    return failureReport(code, limits, sources);
  }
}
