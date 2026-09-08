// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { compareSnapshots } from './comparison.js';
import { analyzeCompose } from './compose.js';
import { observationIdentity } from './identity.js';
import { InputError, readDocument } from './input.js';
import { analyzeOpenApi } from './openapi.js';
import type { RepositoryComparison, RepositoryFileAnalysis } from './repository-types.js';
import { analysisResult, failedResult } from './result.js';
import type { ReviewFormat, ReviewLimits, ReviewResult } from './types.js';

// Internal fixed IPC entrypoint. No configuration can select executable code.
process.once(
  'message',
  async (job: {
    mode?: string;
    format: ReviewFormat;
    file: string;
    limits: ReviewLimits;
    baseline?: string;
    candidate?: string;
  }) => {
    const { mode, format, file, limits } = job;
    if (mode === 'compare-files') {
      let result: RepositoryComparison;
      try {
        if (!job.baseline || !job.candidate) throw new Error();
        const snapshotLimits = {
          maxBytes: 16 * 1024 * 1024,
          maxDepth: 64,
          maxNodes: 200_000,
          maxReferences: 1_000,
          timeoutMs: 30_000,
        };
        const baseline = await readDocument(job.baseline, snapshotLimits, true);
        const candidate = await readDocument(job.candidate, snapshotLimits, true);
        result = compareSnapshots(baseline.document, candidate.document);
      } catch {
        result = compareSnapshots(null, null);
      }
      process.send?.(result, () => process.disconnect?.());
      return;
    }
    let result: ReviewResult;
    let metadata: Omit<RepositoryFileAnalysis, 'result'> = { sha256: null, bytes: null, observations: [] };
    try {
      const { document, referencesUsed, sha256, bytes } = await readDocument(file, limits);
      const analysis =
        format === 'openapi'
          ? analyzeOpenApi(document, { ...limits, maxReferences: limits.maxReferences - referencesUsed })
          : analyzeCompose(document);
      result = analysisResult(format, file, limits, analysis);
      if (mode === 'repository-file')
        metadata = {
          sha256,
          bytes,
          observations: result.issues.map((issue) => ({
            identity: observationIdentity(format, document, issue.ruleId, issue.evidence.pointer),
            issue,
          })),
        };
    } catch (error) {
      result = failedResult(format, file, limits, error instanceof InputError ? error.code : 'processing_failed');
    }
    process.send?.(
      mode === 'repository-file' ? { kind: 'repository-file-analysis', analysis: { result, ...metadata } } : result,
      () => {
        process.disconnect?.();
      },
    );
  },
);
process.once('disconnect', () => {
  process.exitCode = 0;
});
