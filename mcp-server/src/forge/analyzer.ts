// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Skill Forge — Analyzer (Module 3)
 *
 * Queries the profiler database and flags skills that are candidates
 * for optimization based on configurable thresholds.
 *
 * Flagging rules:
 * - Avg execution time > threshold (2000ms tools, 120s agents)
 * - Success rate < 50%
 * - Avg tokens_out > 3000 for tool responses
 * - Token ratio (out/in) > 5x for analysis phases
 * - Cost per run > $0.50 per agent phase
 * - Degrading trend over last N runs
 */

import { getForgeDb } from './db.js';
import type {
  OptimizationCandidate,
  SkillStats,
  ForgeConfig,
  Priority,
  OptimizationReason,
} from './types.js';

// ---------------------------------------------------------------------------
// Default thresholds (overridden by ForgeConfig)
// ---------------------------------------------------------------------------

export interface AnalyzerThresholds {
  slowToolMs: number;
  slowAgentMs: number;
  minSuccessRate: number;
  maxTokenRatio: number;
  maxCostPerRun: number;
  maxToolTokensOut: number;
}

const DEFAULT_THRESHOLDS: AnalyzerThresholds = {
  slowToolMs: 2000,
  slowAgentMs: 120_000,
  minSuccessRate: 0.50,
  maxTokenRatio: 5.0,
  maxCostPerRun: 0.50,
  maxToolTokensOut: 3000,
};

function thresholdsFromConfig(config?: Partial<ForgeConfig>): AnalyzerThresholds {
  const t = config?.thresholds;
  return {
    slowToolMs: t?.slow_tool_ms ?? DEFAULT_THRESHOLDS.slowToolMs,
    slowAgentMs: t?.slow_agent_ms ?? DEFAULT_THRESHOLDS.slowAgentMs,
    minSuccessRate: t?.min_success_rate ?? DEFAULT_THRESHOLDS.minSuccessRate,
    maxTokenRatio: t?.max_token_ratio ?? DEFAULT_THRESHOLDS.maxTokenRatio,
    maxCostPerRun: t?.max_cost_per_run ?? DEFAULT_THRESHOLDS.maxCostPerRun,
    maxToolTokensOut: DEFAULT_THRESHOLDS.maxToolTokensOut,
  };
}

// ---------------------------------------------------------------------------
// Analyzer core
// ---------------------------------------------------------------------------

/**
 * Analyze all profiled skills and return optimization candidates.
 * Refreshes skill_stats then applies threshold rules.
 */
export function analyzeSkills(
  config?: Partial<ForgeConfig>
): OptimizationCandidate[] {
  const db = getForgeDb(config);
  db.refreshSkillStats();

  const allStats = db.getAllSkillStats();
  const thresholds = thresholdsFromConfig(config);
  const candidates: OptimizationCandidate[] = [];

  for (const stats of allStats) {
    const skillCandidates = evaluateSkill(stats, thresholds);
    candidates.push(...skillCandidates);
  }

  // Sort by priority: high > medium > low
  const priorityOrder: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  candidates.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return candidates;
}

/**
 * Analyze a single skill and return optimization candidates (0 or more).
 */
function evaluateSkill(
  stats: SkillStats,
  thresholds: AnalyzerThresholds
): OptimizationCandidate[] {
  const candidates: OptimizationCandidate[] = [];
  const isToolType = isMcpTool(stats.skill_id);
  const skillType = isToolType ? 'mcp_tool' as const : 'agent_phase' as const;

  const currentMetrics = {
    avgDurationMs: stats.avg_duration_ms,
    avgTokensIn: stats.avg_tokens_in,
    avgTokensOut: stats.avg_tokens_out,
    successRate: stats.success_rate,
    avgCostUsd: stats.avg_cost_usd,
  };

  // Rule 1: Slow execution
  const slowThreshold = isToolType ? thresholds.slowToolMs : thresholds.slowAgentMs;
  if (stats.avg_duration_ms > slowThreshold) {
    candidates.push({
      skillId: stats.skill_id,
      skillType,
      reason: 'slow',
      currentMetrics,
      threshold: {
        metric: 'avg_duration_ms',
        limit: slowThreshold,
        actual: stats.avg_duration_ms,
      },
      priority: 'high',
      suggestedAction: isToolType
        ? 'Optimize tool handler: add caching, reduce I/O, simplify response payload.'
        : 'Optimize prompt: reduce verbosity, consolidate instructions, limit unnecessary exploration.',
    });
  }

  // Rule 2: High failure rate
  if (stats.total_runs >= 3 && stats.success_rate < thresholds.minSuccessRate) {
    candidates.push({
      skillId: stats.skill_id,
      skillType,
      reason: 'high_failure',
      currentMetrics,
      threshold: {
        metric: 'success_rate',
        limit: thresholds.minSuccessRate,
        actual: stats.success_rate,
      },
      priority: 'high',
      suggestedAction: 'Investigate failure causes; add error recovery, input validation, or retry logic.',
    });
  }

  // Rule 3: Token-heavy tool responses
  if (isToolType && stats.avg_tokens_out > thresholds.maxToolTokensOut) {
    candidates.push({
      skillId: stats.skill_id,
      skillType,
      reason: 'token_heavy',
      currentMetrics,
      threshold: {
        metric: 'avg_tokens_out',
        limit: thresholds.maxToolTokensOut,
        actual: stats.avg_tokens_out,
      },
      priority: 'medium',
      suggestedAction: 'Reduce tool response size: return only essential fields, use references instead of inline content.',
    });
  }

  // Rule 4: High token ratio for agent phases
  if (!isToolType && stats.avg_tokens_in > 0) {
    const ratio = stats.avg_tokens_out / stats.avg_tokens_in;
    if (ratio > thresholds.maxTokenRatio) {
      candidates.push({
        skillId: stats.skill_id,
        skillType,
        reason: 'token_heavy',
        currentMetrics,
        threshold: {
          metric: 'token_ratio_out_in',
          limit: thresholds.maxTokenRatio,
          actual: parseFloat(ratio.toFixed(2)),
        },
        priority: 'medium',
        suggestedAction: 'Prompt produces disproportionate output; tighten output format, add length constraints.',
      });
    }
  }

  // Rule 5: Cost outlier
  if (!isToolType && stats.avg_cost_usd > thresholds.maxCostPerRun) {
    candidates.push({
      skillId: stats.skill_id,
      skillType,
      reason: 'cost_outlier',
      currentMetrics,
      threshold: {
        metric: 'avg_cost_usd',
        limit: thresholds.maxCostPerRun,
        actual: stats.avg_cost_usd,
      },
      priority: 'low',
      suggestedAction: 'Reduce cost: fewer turns, smaller context window, model downgrade for non-critical phases.',
    });
  }

  // Rule 6: Degrading trend
  if (stats.trend === 'degrading' && stats.total_runs >= 5) {
    candidates.push({
      skillId: stats.skill_id,
      skillType,
      reason: 'degrading_trend',
      currentMetrics,
      threshold: {
        metric: 'trend',
        limit: 0, // N/A
        actual: 0, // N/A
      },
      priority: 'medium',
      suggestedAction: 'Performance degrading over recent runs; check for prompt drift, increased target complexity, or model changes.',
    });
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Known MCP tool names — expand as new tools are added */
const MCP_TOOL_IDS = new Set([
  'save_deliverable',
  'generate_totp',
  'optimize_skills',
  'forge_optimize',
  'forge_status',
]);

function isMcpTool(skillId: string): boolean {
  return MCP_TOOL_IDS.has(skillId);
}

/**
 * Get analysis summary for display purposes.
 */
export function getAnalysisSummary(
  candidates: OptimizationCandidate[]
): {
  total: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
  byReason: Record<string, number>;
} {
  const byReason: Record<string, number> = {};
  let highPriority = 0;
  let mediumPriority = 0;
  let lowPriority = 0;

  for (const c of candidates) {
    byReason[c.reason] = (byReason[c.reason] ?? 0) + 1;
    if (c.priority === 'high') highPriority++;
    else if (c.priority === 'medium') mediumPriority++;
    else lowPriority++;
  }

  return {
    total: candidates.length,
    highPriority,
    mediumPriority,
    lowPriority,
    byReason,
  };
}
