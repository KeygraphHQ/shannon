// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * forge_status MCP Tool
 *
 * Returns the current Skill Forge status: profiler stats, optimization
 * candidates, version info, and analysis summary for all tracked skills.
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { createToolResult, type ToolResult } from '../types/tool-responses.js';
import { createGenericError } from '../utils/error-formatter.js';
import { getForgeStatus } from '../forge/core.js';

/**
 * Input schema for forge_status tool
 */
export const ForgeStatusInputSchema = z.object({
  skill_id: z
    .string()
    .optional()
    .describe('Optional: filter status to a specific skill ID. Omit for all skills.'),
});

export type ForgeStatusInput = z.infer<typeof ForgeStatusInputSchema>;

/**
 * forge_status handler
 */
export async function forgeStatus(args: ForgeStatusInput): Promise<ToolResult> {
  try {
    const report = getForgeStatus();

    // If filtering by skill_id, narrow the results
    if (args.skill_id) {
      const filteredStats = report.skillStats.filter((s) => s.skill_id === args.skill_id);
      const filteredCandidates = report.candidates.filter((c) => c.skillId === args.skill_id);
      const filteredVersions: typeof report.versions = {};
      if (args.skill_id in report.versions) {
        filteredVersions[args.skill_id] = report.versions[args.skill_id]!;
      }

      return createToolResult({
        status: 'success',
        message: `Forge status for skill "${args.skill_id}".`,
        dbPath: report.dbPath,
        totalExecutions: report.totalExecutions,
        skillStats: filteredStats,
        candidates: filteredCandidates,
        analysisSummary: {
          total: filteredCandidates.length,
          highPriority: filteredCandidates.filter((c) => c.priority === 'high').length,
          mediumPriority: filteredCandidates.filter((c) => c.priority === 'medium').length,
          lowPriority: filteredCandidates.filter((c) => c.priority === 'low').length,
          byReason: filteredCandidates.reduce((acc: Record<string, number>, c) => {
            acc[c.reason] = (acc[c.reason] ?? 0) + 1;
            return acc;
          }, {}),
        },
        versions: filteredVersions,
      } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    }

    return createToolResult({
      status: 'success',
      message: `Forge status: ${report.skillStats.length} skills tracked, ${report.totalExecutions} total executions, ${report.analysisSummary.total} optimization candidates.`,
      ...report,
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  } catch (error) {
    return createToolResult(createGenericError(error, false));
  }
}

/**
 * Tool definition for MCP server
 */
export const forgeStatusTool = tool(
  'forge_status',
  'Returns current Skill Forge status: profiler stats (duration, tokens, success rate, cost, trend) for all tracked skills, optimization candidates, version history, and analysis summary. Call to inspect skill performance or check for optimization opportunities.',
  ForgeStatusInputSchema.shape,
  forgeStatus
);
