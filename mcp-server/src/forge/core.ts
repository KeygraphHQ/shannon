// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Skill Forge — Core Orchestrator (Module 7)
 *
 * On-demand optimization: runs once when the agent calls forge_optimize,
 * returns a report, and stops. Runs again only when the user asks.
 *
 * Single-invocation pipeline:
 *   PROFILE → ANALYZE → GENERATE → VALIDATE → PROMOTE → VERSION
 *
 * Exposed as the `forge_optimize` MCP tool for the agent to trigger.
 * No timers, no scheduling, no background processes.
 *
 * Approval flow:
 * - v1 (manual, default): returns report with recommendations, human confirms
 * - v2 (auto): promotes if ABTestResult.promotionEligible && confidence high
 */

import fs from 'node:fs';
import path from 'node:path';
import { getForgeDb } from './db.js';
import { analyzeSkills, getAnalysisSummary } from './analyzer.js';
import {
  generateOptimization,
  createOptimizationRequest,
} from './optimizer.js';
import { runABTest } from './validator.js';
import { checkpointSkill, promoteVersion, pruneVersions } from './versioner.js';
import type {
  ForgeConfig,
  ForgeCycleReport,
  ForgeAction,
  OptimizationCandidate,
  SkillStats,
} from './types.js';

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: ForgeConfig = {
  enabled: true,
  db_path: '~/.shannon/forge.db',
  auto_promote: false,
  thresholds: {
    slow_tool_ms: 2000,
    slow_agent_ms: 120_000,
    min_success_rate: 0.50,
    max_token_ratio: 5.0,
    max_cost_per_run: 0.50,
    improvement_threshold: 0.20,
  },
  ab_test: {
    min_runs: 3,
    confidence_level: 0.95,
  },
  versioning: {
    max_versions_per_skill: 10,
    versions_dir: '~/.shannon/forge/versions/',
  },
};

export function mergeConfig(partial?: Partial<ForgeConfig>): ForgeConfig {
  if (!partial) return DEFAULT_CONFIG;
  return {
    enabled: partial.enabled ?? DEFAULT_CONFIG.enabled,
    db_path: partial.db_path ?? DEFAULT_CONFIG.db_path,
    auto_promote: partial.auto_promote ?? DEFAULT_CONFIG.auto_promote,
    thresholds: { ...DEFAULT_CONFIG.thresholds, ...partial.thresholds },
    ab_test: { ...DEFAULT_CONFIG.ab_test, ...partial.ab_test },
    versioning: { ...DEFAULT_CONFIG.versioning, ...partial.versioning },
  };
}

// ---------------------------------------------------------------------------
// Skill content resolver
// ---------------------------------------------------------------------------

/** Map of known prompt skill IDs to their file paths */
const PROMPT_PATHS: Record<string, string> = {
  'pre-recon': 'prompts/pre-recon-code.txt',
  'recon': 'prompts/recon.txt',
  'injection-vuln': 'prompts/vuln-injection.txt',
  'xss-vuln': 'prompts/vuln-xss.txt',
  'auth-vuln': 'prompts/vuln-auth.txt',
  'authz-vuln': 'prompts/vuln-authz.txt',
  'ssrf-vuln': 'prompts/vuln-ssrf.txt',
  'injection-exploit': 'prompts/exploit-injection.txt',
  'xss-exploit': 'prompts/exploit-xss.txt',
  'auth-exploit': 'prompts/exploit-auth.txt',
  'authz-exploit': 'prompts/exploit-authz.txt',
  'ssrf-exploit': 'prompts/exploit-ssrf.txt',
  'report': 'prompts/report-executive.txt',
};

/** Map of known MCP tool IDs to their source file paths */
const TOOL_PATHS: Record<string, string> = {
  'save_deliverable': 'mcp-server/src/tools/save-deliverable.ts',
  'generate_totp': 'mcp-server/src/tools/generate-totp.ts',
  'optimize_skills': 'mcp-server/src/tools/optimize-skills.ts',
};

/**
 * Resolve the content of a skill (prompt or tool source).
 * Returns null if the file cannot be found.
 */
function resolveSkillContent(
  skillId: string,
  projectRoot: string
): string | null {
  // Try prompts first
  const promptPath = PROMPT_PATHS[skillId];
  if (promptPath) {
    const fullPath = path.join(projectRoot, promptPath);
    try {
      return fs.readFileSync(fullPath, 'utf-8');
    } catch {
      return null;
    }
  }

  // Try tool source files
  const toolPath = TOOL_PATHS[skillId];
  if (toolPath) {
    const fullPath = path.join(projectRoot, toolPath);
    try {
      return fs.readFileSync(fullPath, 'utf-8');
    } catch {
      return null;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Core optimization cycle
// ---------------------------------------------------------------------------

/**
 * Run a full Skill Forge optimization cycle.
 *
 * 1. PROFILE: refresh stats from execution_log
 * 2. ANALYZE: detect candidates based on thresholds
 * 3. GENERATE: optimize each candidate
 * 4. VALIDATE: A/B test original vs. candidate
 * 5. PROMOTE: auto-swap if eligible (v2) or recommend (v1)
 * 6. VERSION: save history, prune old versions
 *
 * @param projectRoot - Root of the Shannon project (for resolving skill files)
 * @param config - Forge configuration
 * @returns Full cycle report
 */
export function runForgeCycle(
  projectRoot: string,
  config?: Partial<ForgeConfig>
): ForgeCycleReport {
  const mergedConfig = mergeConfig(config);
  const db = getForgeDb(mergedConfig);

  // Step 1: PROFILE — refresh aggregated stats
  db.refreshSkillStats();

  // Step 2: ANALYZE — flag candidates
  const candidates = analyzeSkills(mergedConfig);
  const analysisSummary = getAnalysisSummary(candidates);

  const actions: ForgeAction[] = [];
  let optimizationsAttempted = 0;
  let promotions = 0;
  let rejections = 0;
  let needsReview = 0;

  // Step 3-6: For each candidate: GENERATE → VALIDATE → PROMOTE/REJECT → VERSION
  for (const candidate of candidates) {
    const stats = db.getSkillStats(candidate.skillId);
    if (!stats) continue;

    // Resolve skill content
    const content = resolveSkillContent(candidate.skillId, projectRoot);
    if (!content) {
      actions.push({
        type: 'reject',
        skillId: candidate.skillId,
        versionId: 'N/A',
        reason: `Could not resolve skill content for "${candidate.skillId}"`,
      });
      rejections++;
      continue;
    }

    // CHECKPOINT: save current version before optimizing
    const currentVersionId = checkpointSkill(candidate.skillId, content, mergedConfig);

    // GENERATE: create optimized version
    optimizationsAttempted++;
    const request = createOptimizationRequest(candidate, content, stats);
    const result = generateOptimization(request);

    // Save the optimized version
    const candidateVersionId = checkpointSkill(
      candidate.skillId,
      result.optimizedContent,
      mergedConfig
    );

    // VALIDATE: A/B test
    const abResult = runABTest(
      candidate.skillId,
      currentVersionId,
      candidateVersionId,
      content,
      result.optimizedContent,
      mergedConfig
    );

    // PROMOTE or REJECT
    if (mergedConfig.auto_promote && abResult.promotionEligible) {
      // v2: auto-promote
      promoteVersion(
        candidate.skillId,
        candidateVersionId,
        `Auto-promoted: ${result.expectedImprovement.tokenReduction} token reduction, outputs semantically identical.`,
        mergedConfig
      );
      actions.push({
        type: 'promote',
        skillId: candidate.skillId,
        versionId: candidateVersionId,
        reason: `${result.expectedImprovement.tokenReduction} token reduction. Changes: ${result.changes.join('; ')}`,
      });
      promotions++;
    } else if (abResult.recommendation === 'reject') {
      actions.push({
        type: 'reject',
        skillId: candidate.skillId,
        versionId: candidateVersionId,
        reason: `A/B test failed: ${abResult.outputComparison.diffSummary}`,
      });
      rejections++;
    } else {
      // v1: manual review needed, or improvement below threshold
      actions.push({
        type: 'needs_review',
        skillId: candidate.skillId,
        versionId: candidateVersionId,
        report: abResult,
      });
      needsReview++;
    }

    // VERSION: prune old versions
    pruneVersions(candidate.skillId, mergedConfig);
  }

  return {
    timestamp: new Date().toISOString(),
    candidatesAnalyzed: candidates.length,
    optimizationsAttempted,
    promotions,
    rejections,
    needsReview,
    details: actions,
  };
}

// ---------------------------------------------------------------------------
// Status query
// ---------------------------------------------------------------------------

export interface ForgeStatusReport {
  dbPath: string;
  totalExecutions: number;
  skillStats: SkillStats[];
  candidates: OptimizationCandidate[];
  analysisSummary: ReturnType<typeof getAnalysisSummary>;
  versions: Record<string, { total: number; active: string | null }>;
}

/**
 * Get the current Forge status: skill stats, candidates, versions.
 */
export function getForgeStatus(
  config?: Partial<ForgeConfig>
): ForgeStatusReport {
  const db = getForgeDb(config);
  db.refreshSkillStats();

  const allStats = db.getAllSkillStats();
  const candidates = analyzeSkills(config);
  const summary = getAnalysisSummary(candidates);
  const allExecutions = db.getAllExecutions(10000);

  // Gather version info per skill
  const versions: Record<string, { total: number; active: string | null }> = {};
  for (const stats of allStats) {
    const skillVersions = db.getVersions(stats.skill_id);
    const active = db.getActiveVersion(stats.skill_id);
    versions[stats.skill_id] = {
      total: skillVersions.length,
      active: active?.version_id ?? null,
    };
  }

  return {
    dbPath: db.getStorePath(),
    totalExecutions: allExecutions.length,
    skillStats: allStats,
    candidates,
    analysisSummary: summary,
    versions,
  };
}
