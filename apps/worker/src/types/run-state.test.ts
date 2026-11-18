// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isOrderedPartialReasonSet, type PartialReason, prunePartialReasonsForRetry } from './run-state.js';

/** The #532 run-1 reason set: three classes failed mid-run, report finalized partial. */
const ISSUE_532_REASONS: readonly PartialReason[] = [
  { code: 'class_pipeline_failed', vulnerabilityClass: 'xss' },
  { code: 'class_pipeline_failed', vulnerabilityClass: 'auth' },
  { code: 'class_pipeline_failed', vulnerabilityClass: 'ssrf' },
];

test('issue #532: pruning the three failed classes leaves no reason behind', () => {
  const pruned = prunePartialReasonsForRetry(ISSUE_532_REASONS, ['xss', 'auth', 'ssrf']);
  assert.deepEqual(pruned, []);
  assert.ok(isOrderedPartialReasonSet(pruned));
});

test('reasons for classes that are not retried survive the prune', () => {
  const reasons: readonly PartialReason[] = [
    { code: 'agentic_sast_failed', stage: 'workflow' },
    { code: 'class_pipeline_failed', vulnerabilityClass: 'injection' },
    { code: 'class_pipeline_failed', vulnerabilityClass: 'xss' },
    { code: 'class_pipeline_failed', vulnerabilityClass: 'auth' },
    { code: 'class_pipeline_failed', vulnerabilityClass: 'ssrf' },
    { code: 'class_reconciliation_failed', vulnerabilityClass: 'authz' },
    { code: 'report_renumber_failed', vulnerabilityClass: 'injection' },
    { code: 'report_compaction_failed' },
    { code: 'report_class_omitted', vulnerabilityClass: 'miscellaneous' },
    { code: 'report_sarif_failed' },
  ];
  assert.ok(isOrderedPartialReasonSet(reasons));
  const pruned = prunePartialReasonsForRetry(reasons, ['xss', 'auth', 'ssrf']);
  assert.deepEqual(pruned, [
    { code: 'class_pipeline_failed', vulnerabilityClass: 'injection' },
    { code: 'class_reconciliation_failed', vulnerabilityClass: 'authz' },
  ]);
  assert.ok(isOrderedPartialReasonSet(pruned));
});

test('report-stage and SAST reasons are dropped even for classes that are not retried', () => {
  const reasons: readonly PartialReason[] = [
    { code: 'agentic_sast_reduced' },
    { code: 'class_pipeline_failed', vulnerabilityClass: 'injection' },
    { code: 'report_renumber_failed', vulnerabilityClass: 'injection' },
    { code: 'report_class_omitted', vulnerabilityClass: 'miscellaneous' },
  ];
  assert.ok(isOrderedPartialReasonSet(reasons));
  // Nothing is retried, yet the report stages and SAST are re-derived by the re-run
  // phases, so their reasons do not survive a report reset.
  const pruned = prunePartialReasonsForRetry(reasons, []);
  assert.deepEqual(pruned, [{ code: 'class_pipeline_failed', vulnerabilityClass: 'injection' }]);
});

test('retried miscellaneous drops only its own class reason', () => {
  const reasons: readonly PartialReason[] = [
    { code: 'class_pipeline_failed', vulnerabilityClass: 'injection' },
    { code: 'class_pipeline_failed', vulnerabilityClass: 'miscellaneous' },
  ];
  assert.ok(isOrderedPartialReasonSet(reasons));
  const pruned = prunePartialReasonsForRetry(reasons, ['miscellaneous']);
  assert.deepEqual(pruned, [{ code: 'class_pipeline_failed', vulnerabilityClass: 'injection' }]);
});

test('an unordered reason set fails closed instead of pruning', () => {
  const reasons: readonly PartialReason[] = [
    { code: 'class_pipeline_failed', vulnerabilityClass: 'ssrf' },
    { code: 'class_pipeline_failed', vulnerabilityClass: 'xss' },
  ];
  assert.equal(isOrderedPartialReasonSet(reasons), false);
  assert.throws(
    () => prunePartialReasonsForRetry(reasons, ['xss', 'ssrf']),
    (error: unknown) =>
      typeof error === 'object' &&
      error !== null &&
      (error as { checkCode?: unknown }).checkCode === 'partial-reasons-retry-prune-invalid',
  );
});
