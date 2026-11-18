// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  DURABLE_SCAN_STATE_SCHEMA_VERSION,
  isDurableScanState,
  type PartialReason,
  prunePartialReasonsForRetry,
} from '../types/run-state.js';
import { MetricsTracker } from './metrics-tracker.js';
import { generateSessionJsonPath } from './utils.js';

const CHECKPOINT = 'a'.repeat(40);
const MANIFEST_SHA = 'b'.repeat(64);

const EXPECTED_AGENTS = [
  'pre-recon',
  'recon',
  'injection-vuln',
  'xss-vuln',
  'auth-vuln',
  'authz-vuln',
  'ssrf-vuln',
  'injection-exploit',
  'xss-exploit',
  'auth-exploit',
  'authz-exploit',
  'ssrf-exploit',
  'report',
] as const;

function agentEntry(status: 'success' | 'failed', withCheckpoint: boolean) {
  return {
    status,
    attempts: [
      {
        attempt_number: 1,
        duration_ms: 1000,
        cost_usd: 0.1,
        success: status === 'success',
        timestamp: '2026-11-18T12:00:00.000Z',
        ...(status === 'failed' ? { error: 'AGENT_EXECUTION_FAILED (unknown)' } : {}),
      },
    ],
    final_duration_ms: 1000,
    total_cost_usd: 0.1,
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_cache_read_tokens: 0,
    total_cache_write_tokens: 0,
    ...(withCheckpoint ? { checkpoint: CHECKPOINT, model: 'anthropic:claude-opus-5' } : {}),
  };
}

/**
 * The #532 run-1 outcome: a scan that closed `partial` with a finalized report after
 * xss-vuln, auth-exploit and ssrf-exploit failed (xss-exploit never started). Returns the
 * tracker over a temp session.json holding that state.
 */
async function trackerOverIssue532Fixture() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'shannon-532-tracker-'));
  const metadata = { id: 'test-532', webUrl: 'https://example.local', repoPath: tmp, outputPath: tmp };
  const sessionJsonPath = generateSessionJsonPath(metadata);
  const successAgents = [
    'pre-recon',
    'recon',
    'injection-vuln',
    'injection-exploit',
    'auth-vuln',
    'authz-vuln',
    'authz-exploit',
    'ssrf-vuln',
    'report',
  ];
  const failedAgents = ['xss-vuln', 'auth-exploit', 'ssrf-exploit'];
  const agents: Record<string, unknown> = {};
  for (const name of successAgents) agents[name] = agentEntry('success', true);
  for (const name of failedAgents) agents[name] = agentEntry('failed', false);
  const sessionData = {
    session: {
      id: 'test-532',
      webUrl: 'https://example.local',
      status: 'partial',
      createdAt: '2026-11-18T12:00:00.000Z',
      originalWorkflowId: 'wf-run-1',
      resumeAttempts: [],
    },
    metrics: {
      total_duration_ms: 0,
      total_agent_duration_ms: 0,
      total_operational_duration_ms: 0,
      total_cost_usd: 0,
      total_turns: 0,
      usage_accounting_complete: true,
      phases: {},
      agents,
      operational: {},
      stages: {},
      runs: {},
    },
    durableScanState: {
      schema_version: DURABLE_SCAN_STATE_SCHEMA_VERSION,
      exploit: true,
      participating_classes: ['injection', 'xss', 'auth', 'authz', 'ssrf'],
      expected_agents: [...EXPECTED_AGENTS],
      report: {
        stage: 'finalized',
        renumber_failed_classes: [],
        partial_reasons: [
          { code: 'class_pipeline_failed', vulnerabilityClass: 'xss' },
          { code: 'class_pipeline_failed', vulnerabilityClass: 'auth' },
          { code: 'class_pipeline_failed', vulnerabilityClass: 'ssrf' },
        ],
        model_checkpoint: CHECKPOINT,
        canonical_checkpoint: CHECKPOINT,
        final_checkpoint: CHECKPOINT,
        finalization_manifest_sha256: MANIFEST_SHA,
        sarif_disposition: 'committed',
      },
    },
  };
  assert.ok(isDurableScanState(sessionData.durableScanState));
  await fs.mkdir(path.dirname(sessionJsonPath), { recursive: true });
  await fs.writeFile(sessionJsonPath, `${JSON.stringify(sessionData, null, 2)}\n`);
  const tracker = new MetricsTracker(metadata);
  await tracker.initialize();
  return { tracker, sessionJsonPath };
}

async function readSession(sessionJsonPath: string) {
  return JSON.parse(await fs.readFile(sessionJsonPath, 'utf8')) as {
    metrics: { agents: Record<string, { status: string; checkpoint?: string; model?: string; attempts: unknown[] }> };
    durableScanState?: { report?: { stage: string } };
  };
}

function hasCheckCode(checkCode: string) {
  return (error: unknown) =>
    typeof error === 'object' && error !== null && (error as { checkCode?: unknown }).checkCode === checkCode;
}

test('issue #532: reset clears a finalized report and withdraws the report agent success', async () => {
  const { tracker, sessionJsonPath } = await trackerOverIssue532Fixture();
  const before = tracker.getDurableScanState();
  assert.equal(before.report?.stage, 'finalized');

  const pruned: readonly PartialReason[] = prunePartialReasonsForRetry(before.report?.partial_reasons ?? [], [
    'xss',
    'auth',
    'ssrf',
  ]);
  assert.deepEqual(pruned, []);
  await tracker.resetReportProgressForRetry(pruned);

  const after = await readSession(sessionJsonPath);
  assert.equal(after.durableScanState?.report, undefined);
  const reportAgent = after.metrics.agents.report;
  assert.equal(reportAgent?.status, 'in-progress');
  assert.equal(reportAgent?.checkpoint, undefined);
  assert.equal(reportAgent?.model, undefined);
  assert.equal(reportAgent?.attempts.length, 1);
  // No other agent is touched: the failed classes stay failed, the rest stay successful.
  assert.equal(after.metrics.agents['xss-vuln']?.status, 'failed');
  assert.equal(after.metrics.agents['auth-exploit']?.status, 'failed');
  assert.equal(after.metrics.agents['ssrf-exploit']?.status, 'failed');
  assert.equal(after.metrics.agents['injection-vuln']?.status, 'success');
  assert.equal(after.metrics.agents['injection-vuln']?.checkpoint, CHECKPOINT);
});

test('issue #532: after a reset the report pipeline starts again from pending', async () => {
  const { tracker } = await trackerOverIssue532Fixture();
  await tracker.resetReportProgressForRetry([]);
  const pending = await tracker.initializeReportProgress([], []);
  assert.equal(pending.stage, 'pending');
  assert.deepEqual(pending.partial_reasons, []);
  assert.deepEqual(pending.renumber_failed_classes, []);
});

test('issue #532: reset keeps a later resume consistent', async () => {
  const { tracker, sessionJsonPath } = await trackerOverIssue532Fixture();
  await tracker.resetReportProgressForRetry([]);
  // loadResumeState refuses a workspace where the report agent's recorded success
  // disagrees with the durable report stage. After the reset the two agree again:
  // no finalized report, and the report agent is no longer recorded as successful.
  const after = await readSession(sessionJsonPath);
  const reportAgentSucceeded = after.metrics.agents.report?.status === 'success';
  const reportIsFinalized = after.durableScanState?.report?.stage === 'finalized';
  assert.equal(reportAgentSucceeded, false);
  assert.equal(reportIsFinalized, false);
  assert.equal(reportAgentSucceeded, reportIsFinalized);
});

test('reset refuses a report that is not drafted or finalized', async () => {
  const { tracker } = await trackerOverIssue532Fixture();
  await tracker.resetReportProgressForRetry([]);
  await tracker.initializeReportProgress([], []);
  assert.equal(tracker.getDurableScanState().report?.stage, 'pending');
  await assert.rejects(
    tracker.resetReportProgressForRetry([]),
    hasCheckCode('report-retry-reset-invalid-source-stage'),
  );
});

test('reset refuses an invalid pruned reason set and leaves the report untouched', async () => {
  const { tracker } = await trackerOverIssue532Fixture();
  const invalid: readonly PartialReason[] = [
    { code: 'class_pipeline_failed', vulnerabilityClass: 'ssrf' },
    { code: 'class_pipeline_failed', vulnerabilityClass: 'xss' },
  ];
  await assert.rejects(
    tracker.resetReportProgressForRetry(invalid),
    hasCheckCode('report-retry-reset-reasons-invalid'),
  );
  assert.equal(tracker.getDurableScanState().report?.stage, 'finalized');
});
