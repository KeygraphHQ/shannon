// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import path from 'node:path';

export interface ParsedCodePath {
  readonly file: string;
  readonly line: number;
}

/** Parse a sink-first `file:line` locator without coercing invalid paths. */
export function parseCodePath(entry: string): ParsedCodePath | undefined {
  const match = entry.trim().match(/^(.+):(\d+)$/);
  if (!match) return undefined;
  const file = match[1];
  const line = Number(match[2]);
  if (!file || !Number.isSafeInteger(line) || line <= 0) return undefined;
  return { file, line };
}

/**
 * The primary (sink) code-path contract, shared by the submit-time collector and the
 * export gate so the two ends enforce the same rule and cannot drift. `code_paths[0]`
 * becomes the finding's SARIF location, so it must be a normalized repository-relative
 * `file:line`. Trace steps are held to no such requirement on either side.
 */
export function isValidPrimaryCodePath(entry: string): boolean {
  const parsed = parseCodePath(entry);
  return parsed !== undefined && isNormalizedRepositoryPath(parsed.file);
}

/**
 * The normalized repository-relative POSIX path contract shared by SARIF
 * locations and code-path scoping. Rejects absolute, drive-letter, encoded,
 * traversal, and non-canonical forms so the same string keys comparisons on
 * both the producing and consuming side.
 */
export function isNormalizedRepositoryPath(value: string): boolean {
  if (!value || value.includes('\\') || value.includes('\0') || value.includes('://')) return false;
  if (/%(?:00|2e|2f|5c)/i.test(value)) return false;
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value)) return false;
  if (value.startsWith('./') || value.endsWith('/') || value.includes('//')) return false;
  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return false;
  return path.posix.normalize(value) === value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

// `**` collapses to a plain `*` before compiling: this matcher only needs to decide membership
// under an excluded directory, not distinguish depth, so a simpler wildcard is equivalent here.
function globExpression(pattern: string): RegExp {
  const normalized = pattern.replace(/^(?:\.\.?\/)+/, '').replace(/\*\*/g, '*');
  const expression = escapeRegExp(normalized).replace(/\*/g, '.*').replace(/\\\?/g, '.');
  return new RegExp(`^(?:${expression}|.*/${expression})(?:/.*)?$`);
}

/** Match a repository-relative path against normalized code_path exclusions. */
export function isExcludedCodePath(file: string, avoids: readonly string[]): boolean {
  return avoids.some((avoid) => {
    const normalized = avoid
      .trim()
      .replace(/^(?:\.\.?\/)+/, '')
      .replace(/\/+$/, '');
    if (!normalized) return false;
    if (normalized.includes('*') || normalized.includes('?')) return globExpression(normalized).test(file);
    return file === normalized || file.startsWith(`${normalized}/`) || file.includes(`/${normalized}/`);
  });
}
