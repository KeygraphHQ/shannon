/**
 * Shared types for Shannon Desktop MCP Server
 *
 * Types here mirror the Temporal workflow types from the main Shannon package
 * but are defined independently to avoid pulling in heavy dependencies.
 */

// --- Pipeline types (mirrors src/temporal/shared.ts) ---

export interface PipelineInput {
  webUrl: string;
  repoPath: string;
  configPath?: string;
  outputPath?: string;
  pipelineTestingMode?: boolean;
  workflowId?: string;
}

export interface AgentMetrics {
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  numTurns: number | null;
  model?: string | undefined;
}

export interface PipelineSummary {
  totalCostUsd: number;
  totalDurationMs: number;
  totalTurns: number;
  agentCount: number;
}

export interface PipelineState {
  status: 'running' | 'completed' | 'failed';
  currentPhase: string | null;
  currentAgent: string | null;
  completedAgents: string[];
  failedAgent: string | null;
  error: string | null;
  startTime: number;
  agentMetrics: Record<string, AgentMetrics>;
  summary: PipelineSummary | null;
}

export interface PipelineProgress extends PipelineState {
  workflowId: string;
  elapsedMs: number;
}

// --- Session metadata (mirrors src/audit/utils.ts) ---

export interface SessionMetadata {
  id: string;
  webUrl: string;
  repoPath?: string;
  outputPath?: string;
  [key: string]: unknown;
}

// --- Config types (mirrors src/types/config.ts) ---

export type RuleType =
  | 'path'
  | 'subdomain'
  | 'domain'
  | 'method'
  | 'header'
  | 'parameter';

export interface Rule {
  description: string;
  type: RuleType;
  url_path: string;
}

export interface Rules {
  avoid?: Rule[];
  focus?: Rule[];
}

export type LoginType = 'form' | 'sso' | 'api' | 'basic';
export type SuccessConditionType = 'url' | 'cookie' | 'element' | 'redirect';

export interface Authentication {
  login_type: LoginType;
  login_url: string;
  credentials: {
    username: string;
    password: string;
    totp_secret?: string;
  };
  login_flow: string[];
  success_condition: {
    type: SuccessConditionType;
    value: string;
  };
}

export interface Config {
  rules?: Rules;
  authentication?: Authentication;
  login?: unknown;
}

// --- MCP tool result helpers ---
// The MCP SDK CallToolResult expects `[x: string]: unknown` index signature,
// so we use a plain object type instead of strict interfaces.

export type ToolResult = {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean | undefined;
};

export function toolSuccess(data: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

export function toolError(message: string, context?: Record<string, unknown>): ToolResult {
  const payload = context ? { error: message, ...context } : { error: message };
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    isError: true,
  };
}
