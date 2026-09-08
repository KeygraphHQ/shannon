// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import { runIsolated } from './isolate.js';
import { fileRequest } from './request.js';
import { failedResult } from './result.js';
import { isRecord, type ReviewFormat, type ReviewLimits, type ReviewResult } from './types.js';

export { compareSnapshots } from './comparison.js';
export { compareSnapshotFiles } from './comparison-file.js';
export { reviewRepository } from './repository.js';
export type {
  RepositoryChange,
  RepositoryComparison,
  RepositoryLimits,
  RepositoryOptions,
  RepositorySnapshot,
} from './repository-types.js';
export { REPOSITORY_LIMITS } from './repository-types.js';
export { sealSnapshot, validateSnapshot } from './snapshot.js';
export type { ReviewFormat, ReviewLimits, ReviewResult, RuleId } from './types.js';
export { DEFAULT_LIMITS, RULES } from './types.js';

/** Review exactly one local file; limits may only tighten the published ceilings. */
export async function reviewFile(
  format: ReviewFormat,
  file: string,
  overrides?: Partial<ReviewLimits>,
): Promise<ReviewResult> {
  const request = fileRequest(format, file, overrides);
  if (request.failure) return request.failure;
  const response = await runIsolated({ format, file: request.file, limits: request.limits }, request.limits.timeoutMs);
  if (
    isRecord(response.message) &&
    response.message.schemaVersion === 1 &&
    response.message.kind === 'offline-security-review'
  )
    return response.message as unknown as ReviewResult;
  return failedResult(format, request.file, request.limits, response.code ?? 'processing_failed');
}
