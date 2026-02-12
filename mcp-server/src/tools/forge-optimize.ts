// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * forge_optimize MCP Tool
 *
 * Triggers a full Skill Forge optimization cycle:
 * PROFILE → ANALYZE → GENERATE → VALIDATE → PROMOTE → VERSION
 *
 * Returns a structured report with candidates analyzed, optimizations
 * attempted, and actions taken (promote/reject/needs_review).
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { createToolResult, type ToolResult } from '../types/tool-responses.js';
import { createGenericError } from '../utils/error-formatter.js';
import { runForgeCycle } from '../forge/core.js';
import type { ForgeConfig } from '../forge/types.js';

/**
 * Input schema for forge_optimize tool
 */
export const ForgeOptimizeInputSchema = z.object({
  project_root: z
    .string()
    .describe('Root of the Shannon project (for resolving skill/prompt files)'),
  auto_promote: z
    .boolean()
    .default(false)
    .describe('If true, automatically promote versions that pass A/B testing (v2 mode). Default: manual review (v1).'),
  slow_tool_ms: z
    .number()
    .optional()
    .describe('Override: max avg duration for MCP tools (default: 2000ms)'),
  slow_agent_ms: z
    .number()
    .optional()
    .describe('Override: max avg duration for agent phases (default: 120000ms)'),
  min_success_rate: z
    .number()
    .optional()
    .describe('Override: minimum success rate threshold (default: 0.50)'),
  improvement_threshold: z
    .number()
    .optional()
    .describe('Override: minimum improvement to promote (default: 0.20 = 20%)'),
});

export type ForgeOptimizeInput = z.infer<typeof ForgeOptimizeInputSchema>;

/**
 * forge_optimize handler
 */
export async function forgeOptimize(args: ForgeOptimizeInput): Promise<ToolResult> {
  try {
    const config: Partial<ForgeConfig> = {
      auto_promote: args.auto_promote,
      thresholds: {
        slow_tool_ms: args.slow_tool_ms ?? 2000,
        slow_agent_ms: args.slow_agent_ms ?? 120_000,
        min_success_rate: args.min_success_rate ?? 0.50,
        max_token_ratio: 5.0,
        max_cost_per_run: 0.50,
        improvement_threshold: args.improvement_threshold ?? 0.20,
      },
    };

    const report = runForgeCycle(args.project_root, config);

    return createToolResult({
      status: 'success',
      message: `Forge cycle complete: ${report.candidatesAnalyzed} candidates analyzed, ${report.optimizationsAttempted} optimized, ${report.promotions} promoted, ${report.rejections} rejected, ${report.needsReview} need review.`,
      ...report,
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  } catch (error) {
    return createToolResult(createGenericError(error, false));
  }
}

/**
 * Tool definition for MCP server
 */
export const forgeOptimizeTool = tool(
  'forge_optimize',
  'Run a full Skill Forge optimization cycle: profiles all skills, detects slow/failing/token-heavy ones, generates optimized versions, validates via A/B comparison, and promotes winners. Call when the user wants to optimize Shannon pentest skills and prompts.',
  ForgeOptimizeInputSchema.shape,
  forgeOptimize
);
