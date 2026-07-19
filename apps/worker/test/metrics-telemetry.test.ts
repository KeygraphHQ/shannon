// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { MetricsTracker } from '../src/audit/metrics-tracker.js';
import { initializeAuditStructure } from '../src/audit/utils.js';
import type { AgentUsageMetrics } from '../src/types/metrics.js';

function usage(
  inputTokens: number,
  outputTokens: number,
  reasoningTokens: number | null,
  cacheReadTokens: number,
  cacheWriteTokens: number,
  numTurns: number,
  costUsd: number,
): AgentUsageMetrics {
  return { inputTokens, outputTokens, reasoningTokens, cacheReadTokens, cacheWriteTokens, numTurns, costUsd };
}

test('session metrics retain attempt totals and parent/child routing telemetry', async () => {
  const outputPath = await mkdtemp(path.join(os.tmpdir(), 'shannon-metrics-'));
  const metadata = { id: 'telemetry-test', webUrl: 'https://example.test', outputPath };
  try {
    await initializeAuditStructure(metadata);
    const tracker = new MetricsTracker(metadata);
    await tracker.initialize('workflow-test');

    const failedParent = usage(10, 4, 1, 2, 0, 1, 0.1);
    const failedChild = usage(20, 8, 3, 4, 1, 2, 0.2);
    const failedTotal = usage(30, 12, 4, 6, 1, 3, 0.3);
    await tracker.endAgent('pre-recon', {
      attemptNumber: 1,
      duration_ms: 100,
      cost_usd: 0.3,
      success: false,
      isFinalAttempt: false,
      model: 'gpt-5.6-sol',
      reasoningEffort: 'medium',
      childModel: 'gpt-5.6-terra',
      childReasoningEffort: 'medium',
      usage: failedTotal,
      parentUsage: failedParent,
      childUsage: failedChild,
    });

    const successParent = usage(5, 2, 0, 1, 0, 1, 0.05);
    const successChild = usage(7, 3, 1, 2, 0, 1, 0.07);
    const successTotal = usage(12, 5, 1, 3, 0, 2, 0.12);
    await tracker.endAgent('pre-recon', {
      attemptNumber: 2,
      duration_ms: 80,
      cost_usd: 0.12,
      success: true,
      model: 'gpt-5.6-sol',
      reasoningEffort: 'medium',
      childModel: 'gpt-5.6-terra',
      childReasoningEffort: 'medium',
      usage: successTotal,
      parentUsage: successParent,
      childUsage: successChild,
    });

    const terminalFailureUsage = usage(9, 3, 1, 0, 0, 1, 0.25);
    await tracker.endAgent('injection-vuln', {
      attemptNumber: 1,
      duration_ms: 60,
      cost_usd: 0.25,
      success: false,
      model: 'gpt-5.6-terra',
      reasoningEffort: 'medium',
      usage: terminalFailureUsage,
    });

    const data = tracker.getMetrics() as unknown as {
      metrics: {
        total_duration_ms: number;
        total_cost_usd: number;
        phases: Record<string, { duration_ms: number; cost_usd: number; agent_count: number }>;
        agents: Record<
          string,
          {
            status: string;
            attempts: Array<Record<string, unknown>>;
            total_cost_usd: number;
            total_usage: AgentUsageMetrics;
            final_usage: AgentUsageMetrics;
            model: string;
            reasoning_effort: string;
            child_model: string;
            child_reasoning_effort: string;
          }
        >;
      };
    };
    const agent = data.metrics.agents['pre-recon'];
    assert.ok(agent);
    assert.equal(agent.attempts.length, 2);
    assert.deepEqual(agent.attempts[0]?.parent_usage, failedParent);
    assert.deepEqual(agent.attempts[0]?.child_usage, failedChild);
    assert.deepEqual(agent.attempts[1]?.usage, successTotal);
    assert.equal(agent.total_cost_usd, 0.42);
    assert.deepEqual(agent.total_usage, usage(42, 17, 5, 9, 1, 5, 0.42));
    assert.deepEqual(agent.final_usage, successTotal);
    assert.equal(agent.model, 'gpt-5.6-sol');
    assert.equal(agent.reasoning_effort, 'medium');
    assert.equal(agent.child_model, 'gpt-5.6-terra');
    assert.equal(agent.child_reasoning_effort, 'medium');
    assert.equal(data.metrics.agents['injection-vuln']?.status, 'failed');
    assert.equal(data.metrics.total_duration_ms, 80);
    assert.ok(Math.abs(data.metrics.total_cost_usd - 0.67) < Number.EPSILON);
    assert.equal(data.metrics.phases['pre-recon']?.cost_usd, 0.42);
    assert.deepEqual(data.metrics.phases['vulnerability-analysis'], {
      duration_ms: 0,
      duration_percentage: 0,
      cost_usd: 0.25,
      agent_count: 0,
    });
  } finally {
    await rm(outputPath, { recursive: true, force: true });
  }
});
