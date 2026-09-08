// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runIsolated } from './isolate.js';
import type { RepositoryFileAnalysis, RepositorySnapshot } from './repository-types.js';
import { fileRequest } from './request.js';
import { failedResult } from './result.js';
import { isRecord, type ReviewFormat, type ReviewLimits } from './types.js';

export async function reviewFileForRepository(
  format: ReviewFormat,
  file: string,
  overrides?: Partial<ReviewLimits>,
  signal?: AbortSignal,
): Promise<RepositoryFileAnalysis> {
  const request = fileRequest(format, file, overrides);
  if (request.failure) return { result: request.failure, sha256: null, bytes: null, observations: [] };
  const response = await runIsolated(
    { mode: 'repository-file', format, file: request.file, limits: request.limits },
    request.limits.timeoutMs,
    signal,
  );
  if (
    isRecord(response.message) &&
    response.message.kind === 'repository-file-analysis' &&
    isRecord(response.message.analysis)
  )
    return response.message.analysis as unknown as RepositoryFileAnalysis;
  return {
    result: failedResult(format, request.file, request.limits, response.code ?? 'processing_failed'),
    sha256: null,
    bytes: null,
    observations: [],
  };
}

/** Hash installed reviewer code and parser version; checkout paths and line endings do not affect compatibility. */
export async function reviewerIdentity(signal?: AbortSignal): Promise<RepositorySnapshot['reviewer']> {
  const check = () => {
    if (signal?.aborted) throw new Error('Reviewer identity unavailable.');
  };
  try {
    check();
    const hash = createHash('sha256');
    for (const name of [
      'compose',
      'openapi',
      'input',
      'identity',
      'types',
      'result',
      'worker',
      'repository-types',
      'repository',
      'snapshot',
      'comparison',
      'request',
      'isolate',
      'repository-file',
    ]) {
      check();
      const source = await fs.readFile(new URL(`./${name}.js`, import.meta.url), 'utf8');
      check();
      hash.update(name).update('\0').update(source.replace(/\r\n/g, '\n')).update('\0');
    }
    check();
    const parserPath = createRequire(import.meta.url).resolve('js-yaml/package.json');
    const parser = JSON.parse(await fs.readFile(parserPath, 'utf8')) as { version: string };
    check();
    hash.update(`js-yaml:${parser.version}`);
    return { name: 'local-openapi-compose', semanticsVersion: 1, digest: hash.digest('hex') };
  } catch {
    throw new Error('Reviewer identity unavailable.');
  }
}
