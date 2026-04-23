/**
 * Executor — injectable interface for AI agent execution backends.
 *
 * Abstracts the underlying execution mechanism (Claude Agent SDK, kiro-cli, etc.)
 * so that AgentExecutionService can dispatch without knowing the backend.
 *
 * Default: ClaudeSdkExecutor (wraps runClaudePrompt).
 */

import type { ClaudePromptResult } from '../ai/claude-executor.js';
import type { ModelTier } from '../ai/models.js';
import type { AuditSession } from '../audit/index.js';
import type { ActivityLogger } from '../types/activity-logger.js';

/** Optional configuration passed to an executor alongside the core arguments. */
export interface ExecutorOptions {
  readonly context?: string;
  readonly description?: string;
  readonly auditSession?: AuditSession | null;
  readonly outputFormat?: unknown;
  readonly apiKey?: string;
  readonly deliverablesSubdir?: string;
  readonly providerConfig?: import('../types/config.js').ProviderConfig;
  readonly queueFilename?: string;
  readonly playwrightExecutablePath?: string;
  readonly playwrightOutputDir?: string;
  readonly playwrightSession?: string;
}

export interface Executor {
  /**
   * Execute an AI agent with the given prompt and configuration.
   *
   * @param prompt - Fully interpolated agent prompt text.
   * @param sourceDir - Working directory (target repository path).
   * @param agentName - Shannon agent identifier (e.g., 'recon', 'xss').
   * @param modelTier - Capability tier: 'small', 'medium', or 'large'.
   * @param logger - Structured logger for activity-level messages.
   * @param options - Optional execution configuration (context, audit, output format, etc.).
   */
  execute(
    prompt: string,
    sourceDir: string,
    agentName: string,
    modelTier: ModelTier,
    logger: ActivityLogger,
    options?: ExecutorOptions,
  ): Promise<ClaudePromptResult>;
}
