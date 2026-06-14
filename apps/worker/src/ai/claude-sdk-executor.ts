/**
 * ClaudeSdkExecutor — thin adapter wrapping runClaudePrompt to satisfy the Executor interface.
 *
 * Maps the structured ExecutorOptions to runClaudePrompt's positional arguments.
 * No new behavior — purely a delegation layer for DI compatibility.
 */

import type { JsonSchemaOutputFormat } from '@anthropic-ai/claude-agent-sdk';
import type { Executor, ExecutorOptions } from '../interfaces/executor.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import type { ClaudePromptResult } from './claude-executor.js';
import { runClaudePrompt } from './claude-executor.js';
import type { ModelTier } from './models.js';

export class ClaudeSdkExecutor implements Executor {
  /** Delegate to runClaudePrompt, mapping ExecutorOptions fields to positional args. */
  async execute(
    prompt: string,
    sourceDir: string,
    agentName: string,
    modelTier: ModelTier,
    logger: ActivityLogger,
    options?: ExecutorOptions,
  ): Promise<ClaudePromptResult> {
    return runClaudePrompt(
      prompt,
      sourceDir,
      options?.context ?? '',
      options?.description ?? agentName,
      agentName,
      options?.auditSession ?? null,
      logger,
      modelTier,
      options?.outputFormat as JsonSchemaOutputFormat | undefined,
      options?.apiKey,
      options?.deliverablesSubdir,
      options?.providerConfig,
      options?.mcpServers,
    );
  }
}
