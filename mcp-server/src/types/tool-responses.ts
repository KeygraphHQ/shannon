// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Tool Response Type Definitions
 *
 * Defines structured response formats for MCP tools to ensure
 * consistent error handling and success reporting.
 */

export interface ErrorResponse {
  status: 'error';
  message: string;
  errorType: string; // ValidationError, FileSystemError, CryptoError, etc.
  retryable: boolean;
  context?: Record<string, unknown>;
}

export interface SuccessResponse {
  status: 'success';
  message: string;
}

export interface SaveDeliverableResponse {
  status: 'success';
  message: string;
  filepath: string;
  deliverableType: string;
  validated: boolean; // true if queue JSON was validated
}

export interface GenerateTotpResponse {
  status: 'success';
  message: string;
  totpCode: string;
  timestamp: string;
  expiresIn: number; // seconds until expiration
}

export interface OptimizeSkillsResponse {
  status: 'success';
  message: string;
  summary: {
    totalSkills: number;
    optimalCount: number;
    needsWorkCount: number;
    scopesScanned: string[];
  };
  skills: Array<{
    path: string;
    name: string;
    description: string;
    lineCount: number;
    criteria: Array<{
      id: string;
      name: string;
      passed: boolean;
      severity: string;
      message: string;
      suggestion?: string;
      value?: string | number;
      limit?: number;
    }>;
    score: number;
    optimal: boolean;
  }>;
}

export interface ForgeOptimizeResponse {
  status: 'success';
  message: string;
  timestamp: string;
  candidatesAnalyzed: number;
  optimizationsAttempted: number;
  promotions: number;
  rejections: number;
  needsReview: number;
  details: Array<{
    type: string;
    skillId: string;
    versionId: string;
    reason?: string;
    report?: Record<string, unknown>;
  }>;
}

export interface ForgeStatusResponse {
  status: 'success';
  message: string;
  dbPath: string;
  totalExecutions: number;
  skillStats: Array<{
    skill_id: string;
    total_runs: number;
    avg_duration_ms: number;
    p95_duration_ms: number;
    avg_tokens_in: number;
    avg_tokens_out: number;
    avg_cost_usd: number;
    success_rate: number;
    last_run_at: string;
    trend: string;
  }>;
  candidates: Array<{
    skillId: string;
    reason: string;
    priority: string;
    suggestedAction: string;
  }>;
  analysisSummary: {
    total: number;
    highPriority: number;
    mediumPriority: number;
    lowPriority: number;
    byReason: Record<string, number>;
  };
  versions: Record<string, { total: number; active: string | null }>;
}

export type ToolResponse =
  | ErrorResponse
  | SuccessResponse
  | SaveDeliverableResponse
  | GenerateTotpResponse
  | OptimizeSkillsResponse
  | ForgeOptimizeResponse
  | ForgeStatusResponse;

export interface ToolResultContent {
  type: string;
  text: string;
}

export interface ToolResult {
  content: ToolResultContent[];
  isError: boolean;
}

/**
 * Helper to create tool result from response
 * MCP tools should return this format
 */
export function createToolResult(response: ToolResponse): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response, null, 2),
      },
    ],
    isError: response.status === 'error',
  };
}
