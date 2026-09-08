// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import { compareSnapshots } from './comparison.js';
import { runIsolated } from './isolate.js';
import type { RepositoryComparison } from './repository-types.js';
import { fileRequest } from './request.js';
import { isRecord } from './types.js';

/** Load exactly two bounded, strict JSON snapshots in the fixed isolated worker. */
export async function compareSnapshotFiles(baseline: string, candidate: string): Promise<RepositoryComparison> {
  const before = fileRequest('compose', baseline);
  const after = fileRequest('compose', candidate);
  if (before.failure || after.failure) return compareSnapshots(null, null);
  const response = await runIsolated({ mode: 'compare-files', baseline: before.file, candidate: after.file }, 30_000);
  if (isRecord(response.message) && response.message.kind === 'offline-repository-comparison')
    return response.message as unknown as RepositoryComparison;
  return {
    ...compareSnapshots(null, null),
    diagnostics: [
      {
        code: response.code ?? 'processing_failed',
        path: '',
        message: 'The isolated snapshot comparison could not complete within its resource bounds.',
      },
    ],
  };
}
