// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Skill Forge — Optimizer (Modules 4-5)
 *
 * Spawns an optimizer subagent that takes skill content + profile data and
 * returns an optimized version. Enforces the critical constraint:
 * "Outputs must be semantically identical."
 *
 * For prompts (agent phases): rewrites prompts/*.txt — trims verbose
 * instructions, consolidates repeated patterns, removes redundant context.
 *
 * For MCP tools: rewrites tool handler code — reduces response payload,
 * adds caching, short-circuits where possible.
 */

import { getForgeDb } from './db.js';
import type {
  OptimizationRequest,
  OptimizationResult,
  OptimizationCandidate,
  SkillStats,
} from './types.js';

// ---------------------------------------------------------------------------
// Optimizer prompt templates
// ---------------------------------------------------------------------------

const PROMPT_OPTIMIZER_SYSTEM = `You are a Skill Forge optimizer. Your job is to rewrite a skill (prompt or tool code) to be more efficient while preserving EXACT semantic output.

CRITICAL CONSTRAINTS:
1. Outputs must be SEMANTICALLY IDENTICAL. Never remove required fields, change output schemas, or skip validation steps.
2. The optimized version must produce the same results for any valid input.
3. Focus on: reducing token count, removing verbose instructions, consolidating repeated patterns, eliminating redundant context.
4. For prompts: tighten instructions, use concise phrasing, remove unnecessary examples (keep 1 representative example).
5. For code: reduce response payload size, add early returns, simplify logic.

OUTPUT FORMAT:
Return ONLY a JSON object with these fields:
{
  "optimized_content": "the full rewritten content",
  "changes": ["change 1 description", "change 2 description"],
  "expected_token_reduction": "~XX%",
  "expected_speed_improvement": "description"
}`;

function buildOptimizerPrompt(request: OptimizationRequest): string {
  const metricsBlock = `
CURRENT PERFORMANCE METRICS:
- Avg Duration: ${request.profileData.avg_duration_ms}ms
- Avg Tokens In: ${request.profileData.avg_tokens_in}
- Avg Tokens Out: ${request.profileData.avg_tokens_out}
- Success Rate: ${(request.profileData.success_rate * 100).toFixed(1)}%
- Avg Cost: $${request.profileData.avg_cost_usd}
- Total Runs: ${request.profileData.total_runs}
- Trend: ${request.profileData.trend}

ANALYSIS REPORT:
- Reason flagged: ${request.analysisReport.reason}
- Priority: ${request.analysisReport.priority}
- Threshold breached: ${request.analysisReport.threshold.metric} = ${request.analysisReport.threshold.actual} (limit: ${request.analysisReport.threshold.limit})
- Suggested action: ${request.analysisReport.suggestedAction}

OPTIMIZATION CONSTRAINTS:
- Target token reduction: ${(request.constraints.maxTokenReduction * 100).toFixed(0)}%
- Preserve output schema: ${request.constraints.preserveOutputSchema}
- Preserve semantic meaning: ${request.constraints.preserveSemanticMeaning}`;

  const contentType = request.skillType === 'agent_phase' ? 'PROMPT' : 'TOOL CODE';

  return `Optimize the following ${contentType} for skill "${request.skillId}".

${metricsBlock}

CURRENT ${contentType}:
---
${request.currentContent}
---

Rewrite the above to be more efficient. Remember: outputs must remain semantically identical.`;
}

// ---------------------------------------------------------------------------
// Optimizer engine
// ---------------------------------------------------------------------------

/**
 * Generate an optimization for a skill.
 *
 * In the MVP, this uses a deterministic heuristic-based approach for prompts
 * (removing common patterns of verbosity) and returns the optimizer prompt
 * for manual execution by a human/agent.
 *
 * In v2, this would spawn a Claude subagent via claude-executor.
 */
export function generateOptimization(
  request: OptimizationRequest
): OptimizationResult {
  const db = getForgeDb();
  const versions = db.getVersions(request.skillId);
  const nextVersionNum = versions.length + 1;
  const versionId = `v${nextVersionNum}`;

  // For the MVP: apply heuristic optimizations for prompts
  if (request.skillType === 'agent_phase') {
    return optimizePrompt(request, versionId);
  }

  // For tools: return the content with suggestions (manual optimization)
  return {
    skillId: request.skillId,
    optimizedContent: request.currentContent,
    changes: ['Tool optimization requires manual review — see optimizer prompt below.'],
    expectedImprovement: {
      tokenReduction: 'TBD (manual)',
      speedImprovement: 'TBD (manual)',
    },
    versionId,
  };
}

/**
 * Heuristic prompt optimizer — applies pattern-based reductions.
 */
function optimizePrompt(
  request: OptimizationRequest,
  versionId: string
): OptimizationResult {
  let content = request.currentContent;
  const changes: string[] = [];

  // 1. Remove excessive blank lines (3+ → 2)
  const beforeBlankLines = content.length;
  content = content.replace(/\n{4,}/g, '\n\n\n');
  if (content.length < beforeBlankLines) {
    changes.push(`Collapsed excessive blank lines (saved ${beforeBlankLines - content.length} chars)`);
  }

  // 2. Trim trailing whitespace on each line
  const beforeTrailing = content.length;
  content = content.replace(/[ \t]+$/gm, '');
  if (content.length < beforeTrailing) {
    changes.push(`Removed trailing whitespace (saved ${beforeTrailing - content.length} chars)`);
  }

  // 3. Consolidate repeated instruction patterns
  // Look for lines that are essentially "IMPORTANT:" or "NOTE:" repeated
  const importantPattern = /^(IMPORTANT|NOTE|CRITICAL|REMEMBER|WARNING):?\s*/gmi;
  const importantMatches = content.match(importantPattern);
  if (importantMatches && importantMatches.length > 3) {
    // Deduplicate by keeping first occurrence of each
    const seen = new Set<string>();
    const lines = content.split('\n');
    const filteredLines: string[] = [];
    for (const line of lines) {
      const normalized = line.trim().toLowerCase();
      if (importantMatches.some((m) => normalized.startsWith(m.trim().toLowerCase()))) {
        if (!seen.has(normalized)) {
          seen.add(normalized);
          filteredLines.push(line);
        } else {
          changes.push(`Removed duplicate instruction: "${line.trim().slice(0, 60)}..."`);
        }
      } else {
        filteredLines.push(line);
      }
    }
    content = filteredLines.join('\n');
  }

  // 4. Remove HTML-style comments if present
  const beforeComments = content.length;
  content = content.replace(/<!--[\s\S]*?-->/g, '');
  if (content.length < beforeComments) {
    changes.push(`Removed HTML comments (saved ${beforeComments - content.length} chars)`);
  }

  // 5. Shorten overly verbose section dividers
  const beforeDividers = content.length;
  content = content.replace(/[=]{10,}/g, '========');
  content = content.replace(/[-]{10,}/g, '--------');
  content = content.replace(/[#]{10,}/g, '########');
  if (content.length < beforeDividers) {
    changes.push(`Shortened verbose dividers (saved ${beforeDividers - content.length} chars)`);
  }

  const originalTokens = Math.ceil(request.currentContent.length / 4);
  const optimizedTokens = Math.ceil(content.length / 4);
  const reduction = originalTokens > 0
    ? ((originalTokens - optimizedTokens) / originalTokens * 100).toFixed(1)
    : '0';

  if (changes.length === 0) {
    changes.push('No heuristic optimizations applicable. Consider manual review or subagent optimization (v2).');
  }

  return {
    skillId: request.skillId,
    optimizedContent: content,
    changes,
    expectedImprovement: {
      tokenReduction: `~${reduction}%`,
      speedImprovement: 'Proportional to token reduction',
    },
    versionId,
  };
}

/**
 * Build the full optimizer prompt for use by a Claude subagent.
 * This is the prompt you'd send to Claude to do the optimization.
 */
export function buildSubagentPrompt(request: OptimizationRequest): {
  system: string;
  user: string;
} {
  return {
    system: PROMPT_OPTIMIZER_SYSTEM,
    user: buildOptimizerPrompt(request),
  };
}

/**
 * Create an optimization request from a candidate and the skill's content.
 */
export function createOptimizationRequest(
  candidate: OptimizationCandidate,
  skillContent: string,
  stats: SkillStats,
  targetReduction: number = 0.50
): OptimizationRequest {
  return {
    skillId: candidate.skillId,
    skillType: candidate.skillType,
    currentContent: skillContent,
    profileData: stats,
    analysisReport: candidate,
    constraints: {
      maxTokenReduction: targetReduction,
      preserveOutputSchema: true,
      preserveSemanticMeaning: true,
    },
  };
}
