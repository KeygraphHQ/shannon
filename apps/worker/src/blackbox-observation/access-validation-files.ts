// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import path from 'node:path';
import { InputError, readDocument } from '../security-review/input.js';
import { compareAccessDirectory } from './access-files.js';
import { accessComparisonLimits } from './access-limits.js';
import type { AccessComparisonLimits } from './access-types.js';
import {
  AccessValidationError,
  accessValidationComparisonDigest,
  accessValidationSourceManifestDigest,
  parseAccessValidationSelection,
  type ResolvedAccessValidation,
  resolveAccessValidationSelection,
} from './access-validation.js';
import { localPath } from './files.js';

export type AccessValidationBundleErrorCode =
  | 'invalid-selection'
  | 'invalid-corpus'
  | 'unsafe-input'
  | 'source-changed'
  | 'input-limit'
  | 'processing-timeout'
  | 'comparison-mismatch'
  | 'corpus-mismatch';

export class AccessValidationBundleError extends Error {
  constructor(readonly code: AccessValidationBundleErrorCode) {
    super('Black-box access validation bundle could not be loaded.');
    this.name = 'AccessValidationBundleError';
  }
}

export interface AccessValidationBundleOptions {
  readonly limits?: Partial<AccessComparisonLimits>;
  readonly signal?: AbortSignal;
}

function fail(code: AccessValidationBundleErrorCode): never {
  throw new AccessValidationBundleError(code);
}

function mapInputError(error: unknown): never {
  if (error instanceof AccessValidationBundleError) throw error;
  if (error instanceof AccessValidationError) {
    if (error.code === 'comparison-mismatch') return fail('comparison-mismatch');
    if (error.code === 'corpus-mismatch') return fail('corpus-mismatch');
    return fail('invalid-selection');
  }
  if (error instanceof InputError) {
    if (error.code === 'source_changed') return fail('source-changed');
    if (['unsafe_file', 'unsafe_directory'].includes(error.code)) return fail('unsafe-input');
    if (['input_too_large', 'depth_limit', 'node_limit', 'reference_limit'].includes(error.code))
      return fail('input-limit');
  }
  return fail('invalid-corpus');
}

function failedComparisonCode(code: string | undefined): AccessValidationBundleErrorCode {
  if (code === 'source-changed') return 'source-changed';
  if (code === 'unsafe-input') return 'unsafe-input';
  if (code === 'input-limit' || code === 'resource-limit' || code === 'comparison-limit') return 'input-limit';
  if (code === 'processing-timeout') return 'processing-timeout';
  return 'invalid-corpus';
}

async function readSelection(file: string) {
  const read = await readDocument(
    file,
    { maxBytes: 16 * 1024, maxDepth: 8, maxNodes: 128, maxReferences: 0, timeoutMs: 5_000 },
    true,
  );
  return { ...read, selection: parseAccessValidationSelection(read.document) };
}

/**
 * Recompute a fixed passive corpus and resolve its pinned selection. Historical
 * requests stay inside this read-only boundary and never enter the returned value.
 */
export async function loadAccessValidationBundle(
  directory: string,
  options: AccessValidationBundleOptions = {},
): Promise<ResolvedAccessValidation> {
  try {
    options.signal?.throwIfAborted();
    const limits = accessComparisonLimits(options.limits);
    const root = localPath(directory);
    const selectionFile = path.join(root, 'selection.json');
    const comparisonFile = path.join(root, 'comparison.json');
    const observationDirectory = path.join(root, 'observation');
    const rawDirectory = path.join(root, 'raw');

    const initialSelection = await readSelection(selectionFile);
    const initialComparison = await readDocument(
      comparisonFile,
      {
        maxBytes: limits.maxOutputBytes,
        maxDepth: limits.maxDepth,
        maxNodes: limits.maxNodes,
        maxReferences: 0,
        timeoutMs: limits.timeoutMs,
      },
      true,
    );
    if (initialComparison.sha256 !== initialSelection.selection.comparisonSha256) return fail('comparison-mismatch');

    const recomputed = await compareAccessDirectory(observationDirectory, {
      rawDirectory,
      limits,
      ...(options.signal ? { signal: options.signal } : {}),
    });
    if (recomputed.result.status === 'failed')
      return fail(failedComparisonCode(recomputed.result.diagnostics[0]?.code));
    if (
      accessValidationSourceManifestDigest(recomputed.result.sources) !==
      initialSelection.selection.sourceManifestSha256
    ) {
      return fail('corpus-mismatch');
    }
    if (accessValidationComparisonDigest(recomputed.result) !== initialSelection.selection.comparisonSha256)
      return fail('comparison-mismatch');

    const resolved = resolveAccessValidationSelection(initialSelection.selection, recomputed.result);
    options.signal?.throwIfAborted();
    const finalSelection = await readSelection(selectionFile);
    const finalComparison = await readDocument(
      comparisonFile,
      {
        maxBytes: limits.maxOutputBytes,
        maxDepth: limits.maxDepth,
        maxNodes: limits.maxNodes,
        maxReferences: 0,
        timeoutMs: limits.timeoutMs,
      },
      true,
    );
    if (
      finalSelection.sha256 !== initialSelection.sha256 ||
      finalSelection.bytes !== initialSelection.bytes ||
      finalComparison.sha256 !== initialComparison.sha256 ||
      finalComparison.bytes !== initialComparison.bytes
    ) {
      return fail('source-changed');
    }
    options.signal?.throwIfAborted();
    return resolved;
  } catch (error) {
    return mapInputError(error);
  }
}
