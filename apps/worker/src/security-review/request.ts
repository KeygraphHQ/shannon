// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import path from 'node:path';
import { failedResult } from './result.js';
import { DEFAULT_LIMITS, isRecord, type ReviewFormat, type ReviewLimits, type ReviewResult } from './types.js';

export function fileRequest(
  format: ReviewFormat,
  file: string,
  overrides?: Partial<ReviewLimits>,
): { file: string; limits: ReviewLimits; failure?: never } | { failure: ReviewResult; file?: never; limits?: never } {
  const source = typeof file === 'string' ? file : '';
  if (format !== 'openapi' && format !== 'compose')
    return { failure: failedResult(format, source, DEFAULT_LIMITS, 'invalid_format') };
  if (
    overrides !== undefined &&
    (!isRecord(overrides) ||
      Object.entries(overrides).some(
        ([key, value]) =>
          !Object.hasOwn(DEFAULT_LIMITS, key) ||
          !Number.isSafeInteger(value) ||
          typeof value !== 'number' ||
          value < 1 ||
          value > DEFAULT_LIMITS[key as keyof ReviewLimits],
      ))
  ) {
    return { failure: failedResult(format, source, DEFAULT_LIMITS, 'invalid_limits') };
  }
  const limits = { ...DEFAULT_LIMITS, ...overrides };
  if (
    !source ||
    source.includes('\0') ||
    (process.platform === 'win32' && (/^[\\/]{2}/.test(source) || source.replace(/^[a-z]:/i, '').includes(':')))
  ) {
    return { failure: failedResult(format, source, limits, 'unsafe_file') };
  }
  return { file: path.resolve(source), limits };
}
