// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * GitHub Copilot SDK executor.
 *
 * Provides an alternative execution path using @github/copilot-sdk instead of
 * @anthropic-ai/claude-agent-sdk. Authenticates via GITHUB_TOKEN and accesses
 * Claude models through the Copilot API.
 *
 * Returns the same ClaudePromptResult interface so the rest of the pipeline
 * (agent-execution service, Temporal activities, validators) works unchanged.
 */

import { CopilotClient, approveAll } from '@github/copilot-sdk';
import type {
  SessionConfig,
  MCPLocalServerConfig,
  MCPServerConfig,
  SessionEvent,
  Tool,
} from '@github/copilot-sdk';
import { path, fs } from 'zx';

import { AGENTS, MCP_AGENT_MAPPING } from '../session-manager.js';
import { AuditSession } from '../audit/index.js';
import { Timer } from '../utils/metrics.js';
import { isRetryableError, PentestError } from '../services/error-handling.js';
import { isSpendingCapBehavior } from '../utils/billing-detection.js';
import { resolveCopilotModel } from './models.js';
import type { ModelTier } from './models.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import type { ClaudePromptResult } from './claude-executor.js';
import type { AgentName } from '../types/index.js';

// Singleton client — reused across agent executions within the same worker process
let sharedClient: CopilotClient | null = null;

function getGitHubToken(): string | undefined {
  return process.env.COPILOT_GITHUB_TOKEN
    || process.env.GH_TOKEN
    || process.env.GITHUB_TOKEN;
}

/** Check whether the Copilot provider is configured. */
export function isCopilotProvider(): boolean {
  if (process.env.COPILOT_PROVIDER === 'true') {
    return true;
  }
  // Auto-detect: if a GitHub token is set and no real Anthropic key, use Copilot
  const hasGitHubToken = !!getGitHubToken();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const hasRealAnthropicKey = !!(
    (apiKey && apiKey !== 'copilot-mode' && apiKey !== 'router-mode')
    || process.env.CLAUDE_CODE_OAUTH_TOKEN
  );
  return hasGitHubToken && !hasRealAnthropicKey;
}

async function getOrCreateClient(logger: ActivityLogger): Promise<CopilotClient> {
  if (sharedClient) {
    const state = sharedClient.getState();
    if (state === 'connected') {
      return sharedClient;
    }
    // Stale connection — clean up and recreate
    try { await sharedClient.stop(); } catch { /* best effort */ }
    sharedClient = null;
  }

  const token = getGitHubToken();
  if (!token) {
    throw new PentestError(
      'GitHub Copilot requires a token. Set GITHUB_TOKEN, GH_TOKEN, or COPILOT_GITHUB_TOKEN.',
      'config',
      false,
    );
  }

  logger.info('Initializing GitHub Copilot SDK client...');

  const client = new CopilotClient({
    githubToken: token,
    useStdio: true,
    autoStart: true,
    autoRestart: true,
    logLevel: process.env.COPILOT_LOG_LEVEL as 'none' | 'error' | 'warning' | 'info' | 'debug' || 'warning',
  });

  await client.start();
  sharedClient = client;

  logger.info('Copilot SDK client connected');
  return client;
}

/**
 * Build MCP server configs for the Copilot SDK session.
 *
 * Playwright MCP is added when the agent's prompt template has a mapping
 * in MCP_AGENT_MAPPING. The shannon-helper tools are registered as native
 * Copilot SDK tools instead (see buildShannonTools).
 */
function buildCopilotMcpServers(
  _sourceDir: string,
  agentName: string | null,
  logger: ActivityLogger
): Record<string, MCPServerConfig> {
  const servers: Record<string, MCPServerConfig> = {};

  // Playwright MCP (when mapped)
  if (agentName) {
    const promptTemplate = AGENTS[agentName as AgentName].promptTemplate;
    const playwrightMcpName = MCP_AGENT_MAPPING[promptTemplate as keyof typeof MCP_AGENT_MAPPING] || null;

    if (playwrightMcpName) {
      logger.info(`Assigned ${agentName} -> ${playwrightMcpName} (Copilot mode)`);

      const userDataDir = `/tmp/${playwrightMcpName}`;
      const isDocker = process.env.SHANNON_DOCKER === 'true';

      const mcpArgs: string[] = [
        '@playwright/mcp@latest',
        '--isolated',
        '--user-data-dir', userDataDir,
      ];

      if (isDocker) {
        mcpArgs.push('--executable-path', '/usr/bin/chromium-browser');
        mcpArgs.push('--browser', 'chromium');
      }

      const envVars: Record<string, string> = {
        PLAYWRIGHT_HEADLESS: 'true',
        ...(isDocker ? { PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' } : {}),
      };

      servers[playwrightMcpName] = {
        command: 'npx',
        args: mcpArgs,
        tools: ['*'],
        env: envVars,
      } satisfies MCPLocalServerConfig;
    }
  }

  return servers;
}

/**
 * Build native Copilot SDK tools that replicate the shannon-helper MCP server.
 *
 * Registers save_deliverable as a native tool. This avoids needing a separate
 * stdio MCP server process.
 */
function buildShannonTools(sourceDir: string): Tool<any>[] {
  const deliverableDir = path.join(sourceDir, 'deliverables');

  return [
    {
      name: 'save_deliverable',
      description: 'Save a deliverable file (analysis reports, exploitation evidence, or vulnerability queues) to the deliverables directory.',
      parameters: {
        type: 'object',
        properties: {
          deliverable_type: {
            type: 'string',
            description: 'Type of deliverable to save (e.g., code_analysis, recon, injection_analysis, xss_analysis, auth_analysis, ssrf_analysis, authz_analysis, injection_exploitation, xss_exploitation, auth_exploitation, ssrf_exploitation, authz_exploitation, injection_queue, xss_queue, auth_queue, ssrf_queue, authz_queue, report)',
          },
          content: {
            type: 'string',
            description: 'File content (markdown for analysis/evidence, JSON for queues)',
          },
          file_path: {
            type: 'string',
            description: 'Path to a file whose contents should be used as the deliverable content. Use this instead of content for large reports.',
          },
        },
        required: ['deliverable_type'],
      },
      handler: async (args: { deliverable_type: string; content?: string; file_path?: string }) => {
        try {
          await fs.mkdirp(deliverableDir);

          // Resolve filename from deliverable type
          const filenameMap: Record<string, string> = {
            code_analysis: 'code_analysis_deliverable.md',
            recon: 'recon_deliverable.md',
            injection_analysis: 'injection_analysis_deliverable.md',
            xss_analysis: 'xss_analysis_deliverable.md',
            auth_analysis: 'auth_analysis_deliverable.md',
            ssrf_analysis: 'ssrf_analysis_deliverable.md',
            authz_analysis: 'authz_analysis_deliverable.md',
            injection_exploitation: 'injection_exploitation_evidence.md',
            xss_exploitation: 'xss_exploitation_evidence.md',
            auth_exploitation: 'auth_exploitation_evidence.md',
            ssrf_exploitation: 'ssrf_exploitation_evidence.md',
            authz_exploitation: 'authz_exploitation_evidence.md',
            injection_queue: 'injection_queue.json',
            xss_queue: 'xss_queue.json',
            auth_queue: 'auth_queue.json',
            ssrf_queue: 'ssrf_queue.json',
            authz_queue: 'authz_queue.json',
            report: 'comprehensive_security_assessment_report.md',
          };

          const filename = filenameMap[args.deliverable_type] || `${args.deliverable_type}.md`;
          const filePath = path.join(deliverableDir, filename);

          // Resolve content
          let content = args.content;
          if (!content && args.file_path) {
            const resolvedPath = path.isAbsolute(args.file_path)
              ? args.file_path
              : path.resolve(sourceDir, args.file_path);

            // Security: prevent path traversal
            if (!resolvedPath.startsWith(path.resolve(sourceDir))) {
              return `Error: Path "${args.file_path}" resolves outside allowed directory`;
            }

            content = await fs.readFile(resolvedPath, 'utf-8');
          }

          if (!content) {
            return 'Error: Either "content" or "file_path" must be provided';
          }

          await fs.writeFile(filePath, content, 'utf-8');
          return `Deliverable saved: ${filename}`;
        } catch (error) {
          return `Error saving deliverable: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    },
  ];
}

/**
 * Execute an agent prompt via the GitHub Copilot SDK.
 *
 * Drop-in replacement for runClaudePrompt — same signature, same return type.
 */
export async function runCopilotPrompt(
  prompt: string,
  sourceDir: string,
  context: string = '',
  description: string = 'Copilot analysis',
  agentName: string | null = null,
  _auditSession: AuditSession | null = null,
  logger: ActivityLogger,
  modelTier: ModelTier = 'medium'
): Promise<ClaudePromptResult> {
  const timer = new Timer(`copilot-${description.toLowerCase().replace(/\s+/g, '-')}`);
  const fullPrompt = context ? `${context}\n\n${prompt}` : prompt;

  logger.info(`Running Copilot agent: ${description}...`);

  let turnCount = 0;
  let result: string | null = null;
  let totalCost = 0;
  let model: string | undefined;
  let apiErrorDetected = false;

  try {
    // 1. Get or create the shared Copilot client
    const client = await getOrCreateClient(logger);

    // 2. Resolve model for this tier
    const resolvedModel = resolveCopilotModel(modelTier);
    logger.info(`Copilot model: ${resolvedModel} (tier: ${modelTier})`);

    // 3. Build MCP servers and native tools
    const mcpServers = buildCopilotMcpServers(sourceDir, agentName, logger);
    const tools = buildShannonTools(sourceDir);

    // 4. Create a session
    const sessionConfig: SessionConfig = {
      model: resolvedModel,
      workingDirectory: sourceDir,
      onPermissionRequest: approveAll,
      mcpServers,
      tools,
      systemMessage: {
        mode: 'replace' as const,
        content: 'You are a security testing agent. Follow the instructions in the user prompt precisely. Use the available tools to perform file operations, run commands, and interact with applications.',
      },
    };

    const session = await client.createSession(sessionConfig);
    model = resolvedModel;

    // 5. Collect events for audit and result extraction
    const assistantMessages: string[] = [];
    let sessionError: string | undefined;

    const unsubscribe = session.on((event: SessionEvent) => {
      switch (event.type) {
        case 'assistant.turn_start':
          turnCount++;
          break;
        case 'assistant.message':
          if (event.data.content) {
            assistantMessages.push(event.data.content);
          }
          break;
        case 'assistant.usage':
          if (event.data.cost) {
            totalCost += event.data.cost;
          }
          if (event.data.model) {
            model = event.data.model;
          }
          break;
        case 'session.error':
          sessionError = event.data.message;
          logger.error(`Copilot session error: ${event.data.message}`);
          break;
        case 'tool.execution_complete':
          if (!event.data.success && event.data.error) {
            logger.warn(`Tool ${event.data.toolCallId} failed: ${event.data.error.message}`);
          }
          break;
      }
    });

    // 6. Send prompt and wait for completion
    // Use a generous timeout — pentest agents can run for 30+ minutes
    const AGENT_TIMEOUT_MS = 45 * 60 * 1000; // 45 minutes
    const response = await session.sendAndWait({ prompt: fullPrompt }, AGENT_TIMEOUT_MS);

    unsubscribe();

    // 7. Extract final result
    if (response?.data.content) {
      result = response.data.content;
    } else if (assistantMessages.length > 0) {
      result = assistantMessages[assistantMessages.length - 1] ?? null;
    }

    if (sessionError) {
      apiErrorDetected = true;
    }

    // 8. Clean up session
    try {
      await session.destroy();
    } catch {
      // Best effort — session may already be closed
    }

    // 9. Spending cap detection
    if (isSpendingCapBehavior(turnCount, totalCost, result || '')) {
      throw new PentestError(
        `Spending cap likely reached (turns=${turnCount}, cost=$${totalCost}): ${(result || '').slice(0, 100)}`,
        'billing',
        true
      );
    }

    // 10. Return result
    const duration = timer.stop();
    logger.info(`Copilot agent ${description} completed: ${turnCount} turns, $${totalCost.toFixed(4)}, ${duration}ms`);

    return {
      result,
      success: !!result,
      duration,
      turns: turnCount,
      cost: totalCost,
      model,
      partialCost: totalCost,
      apiErrorDetected,
    };

  } catch (error) {
    const duration = timer.stop();
    const err = error as Error & { code?: string; status?: number };

    logger.error(`Copilot agent ${description} failed: ${err.message}`);

    return {
      error: err.message,
      errorType: err.constructor.name,
      prompt: fullPrompt.slice(0, 100) + '...',
      success: false,
      duration,
      cost: totalCost,
      retryable: isRetryableError(err),
    };
  }
}

/** Gracefully shut down the shared Copilot client. Called during worker shutdown. */
export async function shutdownCopilotClient(): Promise<void> {
  if (sharedClient) {
    try {
      await sharedClient.stop();
    } catch {
      try { await sharedClient.forceStop(); } catch { /* ignore */ }
    }
    sharedClient = null;
  }
}
