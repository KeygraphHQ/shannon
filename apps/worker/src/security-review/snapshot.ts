// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { REPOSITORY_LIMITS, type RepositorySnapshot, type SnapshotFile } from './repository-types.js';
import { DEFAULT_LIMITS, type ReviewResult, RULES } from './types.js';

const MAX_NODES = 250_000;
const MAX_DEPTH = 64;
const MAX_BYTES = REPOSITORY_LIMITS.maxSnapshotBytes;
const HASH = /^[a-f0-9]{64}$/;
const FAILURE = 'Invalid repository snapshot.';
const FILE_KEYS = ['path', 'format', 'sha256', 'bytes', 'observations', 'result'];
const RESULT_KEYS = ['schemaVersion', 'kind', 'format', 'status', 'source', 'limits', 'scope', 'issues', 'diagnostics'];
const ISSUE_KEYS = ['ruleId', 'classification', 'applicability', 'message', 'remediation', 'evidence'];

function requireValue(condition: unknown): asserts condition {
  if (!condition) throw new Error(FAILURE);
}

function exact(value: unknown, keys: readonly string[]): void {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value));
  const actual = Object.keys(value);
  requireValue(actual.length === keys.length && actual.every((key) => keys.includes(key)));
}

function text(value: unknown, maximum = 4096): asserts value is string {
  requireValue(typeof value === 'string' && value.length <= maximum);
}

function integer(value: unknown, maximum: number, minimum = 0): asserts value is number {
  requireValue(typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum);
}

function hash(value: unknown): void {
  requireValue(typeof value === 'string' && HASH.test(value));
}

function portable(value: unknown, empty = false): asserts value is string {
  text(value);
  if (empty && value === '') return;
  requireValue(value.length > 0 && !/[\\:<>"|?*]/.test(value));
  requireValue([...value].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127));
  for (const segment of value.split('/')) {
    requireValue(segment !== '' && segment !== '.' && segment !== '..' && !/[. ]$/.test(segment));
    requireValue(!/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment));
  }
}

function pointer(value: unknown): void {
  text(value, 1_048_576);
  requireValue(value === '' || (value.startsWith('/') && !/~(?:[^01]|$)/.test(value)));
}

function array(value: unknown, maximum: number): asserts value is unknown[] {
  requireValue(Array.isArray(value) && value.length <= maximum);
}

/** Canonical JSON serialization also rejects accessors, prototypes, cycles and large graphs. */
function canonical(input: unknown, deadline: number): string {
  let nodes = 0;
  let bytes = 0;
  const chunks: string[] = [];
  const active = new Set<object>();
  const append = (part: string): void => {
    bytes += Buffer.byteLength(part);
    requireValue(bytes <= MAX_BYTES);
    chunks.push(part);
  };
  const visit = (value: unknown, depth: number): void => {
    requireValue(Date.now() < deadline && ++nodes <= MAX_NODES && depth <= MAX_DEPTH);
    if (value === null || typeof value === 'boolean') append(String(value));
    else if (typeof value === 'string') {
      requireValue(value.length <= MAX_BYTES);
      // Count encoded bytes before JSON.stringify can allocate an oversized escaped string.
      let encoded = 2;
      for (let index = 0; index < value.length; index++) {
        const code = value.charCodeAt(index);
        encoded +=
          code < 32
            ? code === 8 || code === 9 || code === 10 || code === 12 || code === 13
              ? 2
              : 6
            : code === 34 || code === 92
              ? 2
              : code < 128
                ? 1
                : code < 2048
                  ? 2
                  : 3;
        if (
          code >= 0xd800 &&
          code <= 0xdbff &&
          index + 1 < value.length &&
          value.charCodeAt(index + 1) >= 0xdc00 &&
          value.charCodeAt(index + 1) <= 0xdfff
        ) {
          encoded++;
          index++;
        } else if (code >= 0xd800 && code <= 0xdfff) encoded += 3;
        requireValue(encoded + bytes <= MAX_BYTES);
        if ((index & 4095) === 0) requireValue(Date.now() < deadline);
      }
      append(JSON.stringify(value));
    } else if (typeof value === 'number') {
      requireValue(Number.isFinite(value));
      append(JSON.stringify(value));
    } else {
      requireValue(value !== null && typeof value === 'object' && !types.isProxy(value) && !active.has(value));
      const prototype = Object.getPrototypeOf(value);
      requireValue(
        prototype === Object.prototype || prototype === null || (Array.isArray(value) && prototype === Array.prototype),
      );
      if (Array.isArray(value)) requireValue(value.length <= MAX_NODES);
      active.add(value);
      const descriptors = Object.getOwnPropertyDescriptors(value);
      requireValue(Object.getOwnPropertySymbols(value).length === 0);
      const keys = Object.keys(descriptors);
      requireValue(keys.length <= MAX_NODES);
      if (Array.isArray(value)) {
        requireValue(keys.length === value.length + 1 && keys.includes('length'));
        append('[');
        for (let index = 0; index < value.length; index++) {
          const descriptor = descriptors[String(index)];
          requireValue(descriptor && 'value' in descriptor && descriptor.enumerable);
          if (index) append(',');
          visit(descriptor.value, depth + 1);
        }
        append(']');
      } else {
        append('{');
        keys.sort();
        for (let index = 0; index < keys.length; index++) {
          const key = keys[index];
          requireValue(key !== undefined);
          const descriptor = descriptors[key];
          requireValue(descriptor && 'value' in descriptor && descriptor.enumerable);
          if (index) append(',');
          visit(key, depth + 1);
          append(':');
          visit(descriptor.value, depth + 1);
        }
        append('}');
      }
      active.delete(value);
    }
  };
  visit(input, 0);
  return chunks.join('');
}

function validateIssue(issue: ReviewResult['issues'][number], file: SnapshotFile): void {
  exact(issue, ISSUE_KEYS);
  requireValue((RULES[file.format] as readonly string[]).includes(issue.ruleId));
  requireValue(issue.classification === (file.format === 'openapi' ? 'contract-consistency' : 'configuration-risk'));
  requireValue(issue.applicability === 'declared');
  text(issue.message);
  text(issue.remediation);
  requireValue(issue.message.length > 0 && issue.remediation.length > 0);
  exact(issue.evidence, ['file', 'pointer']);
  requireValue(issue.evidence.file === file.path);
  pointer(issue.evidence.pointer);
}

function validateFile(file: SnapshotFile, deadline: number): void {
  requireValue(Date.now() < deadline);
  exact(file, FILE_KEYS);
  portable(file.path);
  requireValue(file.format === 'openapi' || file.format === 'compose');
  requireValue((file.sha256 === null) === (file.bytes === null));
  if (file.sha256 !== null) {
    hash(file.sha256);
    integer(file.bytes, DEFAULT_LIMITS.maxBytes);
  }
  const result = file.result;
  exact(result, RESULT_KEYS);
  requireValue(
    result.schemaVersion === 1 && result.kind === 'offline-security-review' && result.format === file.format,
  );
  requireValue(['completed', 'partial', 'failed'].includes(result.status));
  requireValue(file.sha256 !== null || result.status === 'failed');
  exact(result.source, ['file']);
  requireValue(result.source.file === file.path);
  exact(result.limits, Object.keys(DEFAULT_LIMITS));
  for (const key of Object.keys(DEFAULT_LIMITS) as (keyof typeof DEFAULT_LIMITS)[])
    integer(result.limits[key], DEFAULT_LIMITS[key], 1);
  if (file.bytes !== null) requireValue(file.bytes <= result.limits.maxBytes);
  exact(result.scope, ['basis', 'deployedState', 'rules']);
  requireValue(result.scope.basis === 'local-declarations' && result.scope.deployedState === 'not-assessed');
  array(result.scope.rules, RULES[file.format].length);
  requireValue(result.scope.rules.length === RULES[file.format].length);
  const ruleStates = new Map<string, string>();
  for (const rule of result.scope.rules) {
    exact(rule, ['ruleId', 'state']);
    requireValue((RULES[file.format] as readonly string[]).includes(rule.ruleId) && !ruleStates.has(rule.ruleId));
    requireValue(['assessed', 'partial', 'unknown'].includes(rule.state));
    ruleStates.set(rule.ruleId, rule.state);
  }
  array(result.issues, 1000);
  array(result.diagnostics, 1000);
  array(file.observations, 1000);
  requireValue(
    result.issues.length + result.diagnostics.length <= 1000 && file.observations.length === result.issues.length,
  );
  const covered = new Set<string>();
  for (const diagnostic of result.diagnostics) {
    exact(diagnostic, ['code', 'pointer', 'ruleIds', 'message']);
    text(diagnostic.code, 256);
    requireValue(diagnostic.code.length > 0);
    pointer(diagnostic.pointer);
    text(diagnostic.message);
    requireValue(diagnostic.message.length > 0);
    array(diagnostic.ruleIds, RULES[file.format].length);
    requireValue(diagnostic.ruleIds.length > 0);
    requireValue(new Set(diagnostic.ruleIds).size === diagnostic.ruleIds.length);
    for (const ruleId of diagnostic.ruleIds) {
      requireValue((RULES[file.format] as readonly string[]).includes(ruleId));
      covered.add(ruleId);
    }
  }
  const issues = new Map<string, number>();
  const locations = new Set<string>();
  for (const issue of result.issues) {
    validateIssue(issue, file);
    const location = JSON.stringify([issue.ruleId, issue.evidence.pointer]);
    requireValue(!locations.has(location));
    locations.add(location);
    const key = canonical(issue, deadline);
    issues.set(key, (issues.get(key) ?? 0) + 1);
  }
  for (const observation of file.observations) {
    exact(observation, ['identity', 'issue']);
    if (observation.identity !== null) hash(observation.identity);
    validateIssue(observation.issue, file);
    const key = canonical(observation.issue, deadline);
    const count = issues.get(key) ?? 0;
    requireValue(count > 0);
    issues.set(key, count - 1);
  }
  if (result.status === 'failed') {
    requireValue(result.issues.length === 0 && result.diagnostics.length > 0);
    requireValue([...ruleStates.values()].every((state) => state === 'unknown'));
  } else {
    requireValue((result.status === 'completed') === (result.diagnostics.length === 0));
    for (const [ruleId, state] of ruleStates) requireValue(state === (covered.has(ruleId) ? 'partial' : 'assessed'));
  }
}

/** Internal shared deadline entrypoint used by comparison. Errors never contain input data. */
export function validateSnapshotBefore(input: unknown, deadline: number): RepositorySnapshot {
  try {
    const encoded = canonical(input, deadline);
    const snapshot = JSON.parse(encoded) as RepositorySnapshot;
    exact(snapshot, [
      'schemaVersion',
      'kind',
      'id',
      'status',
      'reviewer',
      'policy',
      'limits',
      'discovery',
      'files',
      'diagnostics',
    ]);
    requireValue(snapshot.schemaVersion === 1 && snapshot.kind === 'offline-repository-review');
    requireValue(['completed', 'partial', 'failed'].includes(snapshot.status));
    hash(snapshot.id);
    exact(snapshot.reviewer, ['name', 'semanticsVersion', 'digest']);
    requireValue(snapshot.reviewer.name === 'local-openapi-compose' && snapshot.reviewer.semanticsVersion === 1);
    hash(snapshot.reviewer.digest);
    exact(snapshot.limits, Object.keys(REPOSITORY_LIMITS));
    for (const key of Object.keys(REPOSITORY_LIMITS) as (keyof typeof REPOSITORY_LIMITS)[])
      integer(snapshot.limits[key], REPOSITORY_LIMITS[key], 1);
    requireValue(Buffer.byteLength(encoded) <= snapshot.limits.maxSnapshotBytes);
    exact(snapshot.policy, ['conventionalNames', 'excludedDirectories', 'includes', 'excludes']);
    for (const field of ['conventionalNames', 'excludedDirectories', 'excludes'] as const) {
      array(snapshot.policy[field], REPOSITORY_LIMITS.maxEntries);
      const seen = new Set<string>();
      for (const entry of snapshot.policy[field]) {
        portable(entry);
        requireValue(!seen.has(entry));
        seen.add(entry);
        if (field !== 'excludes') requireValue(!entry.includes('/'));
      }
    }
    requireValue(snapshot.policy.conventionalNames.length > 0);
    array(snapshot.policy.includes, REPOSITORY_LIMITS.maxFiles);
    const selections = new Set<string>();
    for (const include of snapshot.policy.includes) {
      exact(include, ['format', 'path']);
      portable(include.path);
      requireValue(include.format === 'compose' || include.format === 'openapi');
      requireValue(!selections.has(include.path));
      selections.add(include.path);
    }
    exact(snapshot.discovery, ['state', 'entriesVisited', 'selectedBytes', 'ignoredFiles', 'skipped']);
    requireValue(snapshot.discovery.state === 'complete' || snapshot.discovery.state === 'incomplete');
    integer(snapshot.discovery.entriesVisited, snapshot.limits.maxEntries);
    integer(snapshot.discovery.selectedBytes, snapshot.limits.maxBytes);
    integer(snapshot.discovery.ignoredFiles, snapshot.discovery.entriesVisited);
    array(snapshot.discovery.skipped, REPOSITORY_LIMITS.maxEntries);
    const skipped = new Set<string>();
    for (const entry of snapshot.discovery.skipped) {
      exact(entry, ['path', 'reason']);
      portable(entry.path, true);
      text(entry.reason, 256);
      requireValue(entry.reason.length > 0);
      const key = JSON.stringify([entry.path, entry.reason]);
      requireValue(!skipped.has(key));
      skipped.add(key);
      if (snapshot.discovery.state === 'complete') {
        requireValue(entry.reason === 'excluded-directory' || entry.reason === 'excluded-path');
        requireValue(entry.path !== '');
        requireValue(
          entry.reason === 'excluded-directory'
            ? entry.path.split('/').some((segment) => snapshot.policy.excludedDirectories.includes(segment))
            : snapshot.policy.excludes.some(
                (exclude) => entry.path === exclude || entry.path.startsWith(`${exclude}/`),
              ),
        );
      }
    }
    array(snapshot.diagnostics, REPOSITORY_LIMITS.maxEntries);
    for (const diagnostic of snapshot.diagnostics) {
      exact(diagnostic, ['code', 'path', 'message']);
      portable(diagnostic.path, true);
      text(diagnostic.code, 256);
      text(diagnostic.message);
      requireValue(diagnostic.code.length > 0 && diagnostic.message.length > 0);
    }
    array(snapshot.files, snapshot.limits.maxFiles);
    requireValue(snapshot.discovery.entriesVisited >= snapshot.files.length + snapshot.discovery.ignoredFiles);
    const paths = new Set<string>();
    const fingerprints = new Map<string, number>();
    let knownBytes = 0;
    for (const file of snapshot.files) {
      validateFile(file, deadline);
      requireValue(!paths.has(file.path));
      paths.add(file.path);
      if (file.sha256 !== null && file.bytes !== null) {
        requireValue(!fingerprints.has(file.sha256) || fingerprints.get(file.sha256) === file.bytes);
        fingerprints.set(file.sha256, file.bytes);
        knownBytes += file.bytes;
      }
      requireValue(
        !snapshot.policy.excludedDirectories.some((directory) => file.path.split('/').slice(0, -1).includes(directory)),
      );
      requireValue(
        !snapshot.policy.excludes.some((exclude) => file.path === exclude || file.path.startsWith(`${exclude}/`)),
      );
      const explicit = snapshot.policy.includes.find((include) => include.path === file.path);
      const basename = file.path.split('/').at(-1);
      requireValue(
        explicit ? explicit.format === file.format : snapshot.policy.conventionalNames.includes(basename ?? ''),
      );
    }
    requireValue(knownBytes <= snapshot.discovery.selectedBytes);
    if (snapshot.discovery.state === 'complete') {
      for (const include of snapshot.policy.includes) {
        requireValue(
          paths.has(include.path) ||
            snapshot.policy.excludedDirectories.some((directory) =>
              include.path.split('/').slice(0, -1).includes(directory),
            ) ||
            snapshot.policy.excludes.some(
              (exclude) => include.path === exclude || include.path.startsWith(`${exclude}/`),
            ),
        );
      }
    }
    const incomplete =
      snapshot.discovery.state !== 'complete' ||
      snapshot.diagnostics.length > 0 ||
      snapshot.files.some((file) => file.result.status !== 'completed');
    requireValue((snapshot.status === 'completed') === !incomplete);
    if (snapshot.status === 'failed')
      requireValue(
        snapshot.discovery.state === 'incomplete' && snapshot.files.length === 0 && snapshot.diagnostics.length > 0,
      );
    const { id, ...body } = snapshot;
    requireValue(createHash('sha256').update(canonical(body, deadline)).digest('hex') === id);
    return snapshot;
  } catch {
    throw new Error(FAILURE);
  }
}

export function validateSnapshot(input: unknown): RepositorySnapshot {
  return validateSnapshotBefore(input, Date.now() + 30_000);
}

export function sealSnapshot(body: Omit<RepositorySnapshot, 'id'>, deadline = Date.now() + 30_000): RepositorySnapshot {
  try {
    deadline = Math.min(deadline, Date.now() + 30_000);
    const encoded = canonical(body, deadline);
    const copied = JSON.parse(encoded) as Omit<RepositorySnapshot, 'id'>;
    return validateSnapshotBefore({ ...copied, id: createHash('sha256').update(encoded).digest('hex') }, deadline);
  } catch {
    throw new Error(FAILURE);
  }
}
