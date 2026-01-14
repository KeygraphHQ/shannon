// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { $, fs, path } from 'zx';
import chalk, { type ChalkInstance } from 'chalk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { isRetryableError, getRetryDelay, PentestError } from '../error-handling.js';
import { ProgressIndicator } from '../progress-indicator.js';
import { timingResults, costResults, Timer } from '../utils/metrics.js';
import { formatDuration } from '../audit/utils.js';
import { createGitCheckpoint, commitGitSuccess, rollbackGitWorkspace } from '../utils/git-manager.js';
import { AGENT_VALIDATORS, MCP_AGENT_MAPPING } from '../constants.js';
import { filterJsonToolCalls, getAgentPrefix } from '../utils/output-formatter.js';
import { generateSessionLogPath } from '../session-manager.js';
import { AuditSession } from '../audit/index.js';
// Dynamic import for optional MCP server (may not be built yet)
// Uses SDK's createSdkMcpServer which returns McpSdkServerConfigWithInstance
type SdkMcpServerResult = {
  type: 'sdk';
  name: string;
  instance: unknown;
};

type ShannonHelperServerFactory = (sourceDir: string) => SdkMcpServerResult;

let createShannonHelperServer: ShannonHelperServerFactory | undefined;
try {
  // @ts-expect-error - Module may not exist if mcp-server is not built
  const mcpModule = await import('../../mcp-server/dist/index.js');
  createShannonHelperServer = mcpModule.createShannonHelperServer as ShannonHelperServerFactory;
} catch {
  // MCP server not built, will be undefined
}
import type { SessionMetadata } from '../audit/utils.js';
import type { PromptName } from '../types/index.js';

// Extend global for loader flag
declare global {
  var SHANNON_DISABLE_LOADER: boolean | undefined;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Result types
interface ClaudePromptResult {
  result?: string | null;
  success: boolean;
  duration: number;
  turns?: number;
  cost: number;
  partialCost?: number;
  apiErrorDetected?: boolean;
  logFile?: string;
  error?: string;
  errorType?: string;
  prompt?: string;
  retryable?: boolean;
}

// MCP Server types
interface StdioMcpServer {
  type: 'stdio';
  command: string;
  args: string[];
  env: Record<string, string>;
}

type McpServer = SdkMcpServerResult | StdioMcpServer;

/**
 * Convert agent name to prompt name for MCP_AGENT_MAPPING lookup
 */
function agentNameToPromptName(agentName: string): PromptName {
  // Special cases
  if (agentName === 'pre-recon') return 'pre-recon-code';
  if (agentName === 'report') return 'report-executive';
  if (agentName === 'recon') return 'recon';

  // Pattern: {type}-vuln → vuln-{type}
  const vulnMatch = agentName.match(/^(.+)-vuln$/);
  if (vulnMatch) {
    return `vuln-${vulnMatch[1]}` as PromptName;
  }

  // Pattern: {type}-exploit → exploit-{type}
  const exploitMatch = agentName.match(/^(.+)-exploit$/);
  if (exploitMatch) {
    return `exploit-${exploitMatch[1]}` as PromptName;
  }

  // Default: return as-is
  return agentName as PromptName;
}

// Simplified validation using direct agent name mapping
async function validateAgentOutput(
  result: ClaudePromptResult,
  agentName: string | null,
  sourceDir: string
): Promise<boolean> {
  console.log(chalk.blue(`    🔍 Validating ${agentName} agent output`));

  try {
    // Check if agent completed successfully
    if (!result.success || !result.result) {
      console.log(chalk.red(`    ❌ Validation failed: Agent execution was unsuccessful`));
      return false;
    }

    // Get validator function for this agent
    const validator = agentName ? AGENT_VALIDATORS[agentName as keyof typeof AGENT_VALIDATORS] : undefined;

    if (!validator) {
      console.log(chalk.yellow(`    ⚠️ No validator found for agent "${agentName}" - assuming success`));
      console.log(chalk.green(`    ✅ Validation passed: Unknown agent with successful result`));
      return true;
    }

    console.log(chalk.blue(`    📋 Using validator for agent: ${agentName}`));
    console.log(chalk.blue(`    📂 Source directory: ${sourceDir}`));

    // Apply validation function
    const validationResult = await validator(sourceDir);

    if (validationResult) {
      console.log(chalk.green(`    ✅ Validation passed: Required files/structure present`));
    } else {
      console.log(chalk.red(`    ❌ Validation failed: Missing required deliverable files`));
    }

    return validationResult;

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`    ❌ Validation failed with error: ${errMsg}`));
    return false; // Assume invalid on validation error
  }
}

// Pure function: Run Claude Code with SDK - Maximum Autonomy
// WARNING: This is a low-level function. Use runClaudePromptWithRetry() for agent execution
async function runClaudePrompt(
  prompt: string,
  sourceDir: string,
  _allowedTools: string = 'Read',
  context: string = '',
  description: string = 'Claude analysis',
  agentName: string | null = null,
  colorFn: ChalkInstance = chalk.cyan,
  sessionMetadata: SessionMetadata | null = null,
  auditSession: AuditSession | null = null,
  attemptNumber: number = 1
): Promise<ClaudePromptResult> {
  const timer = new Timer(`agent-${description.toLowerCase().replace(/\s+/g, '-')}`);
  const fullPrompt = context ? `${context}\n\n${prompt}` : prompt;
  let totalCost = 0;
  let partialCost = 0; // Track partial cost for crash safety

  // Auto-detect execution mode to adjust logging behavior
  const isParallelExecution = description.includes('vuln agent') || description.includes('exploit agent');
  const useCleanOutput = description.includes('Pre-recon agent') ||
                         description.includes('Recon agent') ||
                         description.includes('Executive Summary and Report Cleanup') ||
                         description.includes('vuln agent') ||
                         description.includes('exploit agent');

  // Disable status manager - using simple JSON filtering for all agents now
  const statusManager = null;

  // Setup progress indicator for clean output agents (unless disabled via flag)
  let progressIndicator: ProgressIndicator | null = null;
  if (useCleanOutput && !global.SHANNON_DISABLE_LOADER) {
    const agentType = description.includes('Pre-recon') ? 'pre-reconnaissance' :
                     description.includes('Recon') ? 'reconnaissance' :
                     description.includes('Report') ? 'report generation' : 'analysis';
    progressIndicator = new ProgressIndicator(`Running ${agentType}...`);
  }

  // NOTE: Logging now handled by AuditSession (append-only, crash-safe)
  let logFilePath: string | null = null;
  if (sessionMetadata && sessionMetadata.webUrl && sessionMetadata.id) {
    const timestamp = new Date().toISOString().replace(/T/, '_').replace(/[:.]/g, '-').slice(0, 19);
    const agentKey = description.toLowerCase().replace(/\s+/g, '-');
    const logDir = generateSessionLogPath(sessionMetadata.webUrl, sessionMetadata.id);
    logFilePath = path.join(logDir, `${timestamp}_${agentKey}_attempt-${attemptNumber}.log`);
  } else {
    console.log(chalk.blue(`  🤖 Running Claude Code: ${description}...`));
  }

  // Declare variables that need to be accessible in both try and catch blocks
  let turnCount = 0;

  try {
    // Create MCP server with target directory context (if available)
    const shannonHelperServer = createShannonHelperServer?.(sourceDir);

    // Look up agent's assigned Playwright MCP server
    let playwrightMcpName: string | null = null;
    if (agentName) {
      const promptName = agentNameToPromptName(agentName);
      playwrightMcpName = MCP_AGENT_MAPPING[promptName as keyof typeof MCP_AGENT_MAPPING] || null;

      if (playwrightMcpName) {
        console.log(chalk.gray(`    🎭 Assigned ${agentName} → ${playwrightMcpName}`));
      }
    }

    // Configure MCP servers: shannon-helper (SDK) + playwright-agentN (stdio)
    const mcpServers: Record<string, McpServer> = {};

    // Add shannon-helper server if available (built from mcp-server/)
    if (shannonHelperServer) {
      mcpServers['shannon-helper'] = shannonHelperServer;
    }

    // Add Playwright MCP server if this agent needs browser automation
    if (playwrightMcpName) {
      const userDataDir = `/tmp/${playwrightMcpName}`;

      // Detect if running in Docker via explicit environment variable
      const isDocker = process.env.SHANNON_DOCKER === 'true';

      // Build args array - conditionally add --executable-path for Docker
      const mcpArgs: string[] = [
        '@playwright/mcp@latest',
        '--isolated',
        '--user-data-dir', userDataDir,
      ];

      // Docker: Use system Chromium; Local: Use Playwright's bundled browsers
      if (isDocker) {
        mcpArgs.push('--executable-path', '/usr/bin/chromium-browser');
        mcpArgs.push('--browser', 'chromium');
      }

      // Filter out undefined env values for type safety
      const envVars: Record<string, string> = Object.fromEntries(
        Object.entries({
          ...process.env,
          PLAYWRIGHT_HEADLESS: 'true',
          ...(isDocker && { PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' }),
        }).filter((entry): entry is [string, string] => entry[1] !== undefined)
      );

      mcpServers[playwrightMcpName] = {
        type: 'stdio' as const,
        command: 'npx',
        args: mcpArgs,
        env: envVars,
      };
    }

    const options = {
      model: 'claude-sonnet-4-5-20250929', // Use latest Claude 4.5 Sonnet
      maxTurns: 10_000, // Maximum turns for autonomous work
      cwd: sourceDir, // Set working directory using SDK option
      permissionMode: 'bypassPermissions' as const, // Bypass all permission checks for pentesting
      mcpServers,
    };

    // SDK Options only shown for verbose agents (not clean output)
    if (!useCleanOutput) {
      console.log(chalk.gray(`    SDK Options: maxTurns=${options.maxTurns}, cwd=${sourceDir}, permissions=BYPASS`));
    }

    let result: string | null = null;
    const messages: string[] = [];
    let apiErrorDetected = false;

    // Start progress indicator for clean output agents
    if (progressIndicator) {
      progressIndicator.start();
    }

    let lastHeartbeat = Date.now();
    const HEARTBEAT_INTERVAL = 30000; // 30 seconds

    try {
      for await (const message of query({ prompt: fullPrompt, options })) {
        // Periodic heartbeat for long-running agents (only when loader is disabled)
        const now = Date.now();
        if (global.SHANNON_DISABLE_LOADER && now - lastHeartbeat > HEARTBEAT_INTERVAL) {
          console.log(chalk.blue(`    ⏱️  [${Math.floor((now - timer.startTime) / 1000)}s] ${description} running... (Turn ${turnCount})`));
          lastHeartbeat = now;
        }

        if (message.type === "assistant") {
          turnCount++;

          const messageContent = message.message as { content: unknown };
          const content = Array.isArray(messageContent.content)
            ? messageContent.content.map((c: { text?: string }) => c.text || JSON.stringify(c)).join('\n')
            : String(messageContent.content);

          if (statusManager) {
            // Smart status updates for parallel execution - disabled
          } else if (useCleanOutput) {
            // Clean output for all agents: filter JSON tool calls but show meaningful text
            const cleanedContent = filterJsonToolCalls(content);
            if (cleanedContent.trim()) {
              // Temporarily stop progress indicator to show output
              if (progressIndicator) {
                progressIndicator.stop();
              }

              if (isParallelExecution) {
                // Compact output for parallel agents with prefixes
                const prefix = getAgentPrefix(description);
                console.log(colorFn(`${prefix} ${cleanedContent}`));
              } else {
                // Full turn output for single agents
                console.log(colorFn(`\n    🤖 Turn ${turnCount} (${description}):`));
                console.log(colorFn(`    ${cleanedContent}`));
              }

              // Restart progress indicator after output
              if (progressIndicator) {
                progressIndicator.start();
              }
            }
          } else {
            // Full streaming output - show complete messages with specialist color
            console.log(colorFn(`\n    🤖 Turn ${turnCount} (${description}):`));
            console.log(colorFn(`    ${content}`));
          }

          // Log to audit system (crash-safe, append-only)
          if (auditSession) {
            await auditSession.logEvent('llm_response', {
              turn: turnCount,
              content,
              timestamp: new Date().toISOString()
            });
          }

          messages.push(content);

          // Check for API error patterns in assistant message content
          if (content && typeof content === 'string') {
            const lowerContent = content.toLowerCase();
            if (lowerContent.includes('session limit reached')) {
              throw new PentestError('Session limit reached', 'billing', false);
            }
            if (lowerContent.includes('api error') || lowerContent.includes('terminated')) {
              apiErrorDetected = true;
              console.log(chalk.red(`    ⚠️  API Error detected in assistant response: ${content.trim()}`));
            }
          }

        } else if (message.type === "system" && (message as { subtype?: string }).subtype === "init") {
          // Show useful system info only for verbose agents
          if (!useCleanOutput) {
            const initMsg = message as { model?: string; permissionMode?: string; mcp_servers?: Array<{ name: string; status: string }> };
            console.log(chalk.blue(`    ℹ️  Model: ${initMsg.model}, Permission: ${initMsg.permissionMode}`));
            if (initMsg.mcp_servers && initMsg.mcp_servers.length > 0) {
              const mcpStatus = initMsg.mcp_servers.map(s => `${s.name}(${s.status})`).join(', ');
              console.log(chalk.blue(`    📦 MCP: ${mcpStatus}`));
            }
          }

        } else if (message.type === "user") {
          // Skip user messages (these are our own inputs echoed back)
          continue;

        } else if ((message.type as string) === "tool_use") {
          const toolMsg = message as unknown as { name: string; input?: Record<string, unknown> };
          console.log(chalk.yellow(`\n    🔧 Using Tool: ${toolMsg.name}`));
          if (toolMsg.input && Object.keys(toolMsg.input).length > 0) {
            console.log(chalk.gray(`    Input: ${JSON.stringify(toolMsg.input, null, 2)}`));
          }

          // Log tool start event
          if (auditSession) {
            await auditSession.logEvent('tool_start', {
              toolName: toolMsg.name,
              parameters: toolMsg.input,
              timestamp: new Date().toISOString()
            });
          }
        } else if ((message.type as string) === "tool_result") {
          const resultMsg = message as unknown as { content?: unknown };
          console.log(chalk.green(`    ✅ Tool Result:`));
          if (resultMsg.content) {
            // Show tool results but truncate if too long
            const resultStr = typeof resultMsg.content === 'string' ? resultMsg.content : JSON.stringify(resultMsg.content, null, 2);
            if (resultStr.length > 500) {
              console.log(chalk.gray(`    ${resultStr.slice(0, 500)}...\n    [Result truncated - ${resultStr.length} total chars]`));
            } else {
              console.log(chalk.gray(`    ${resultStr}`));
            }
          }

          // Log tool end event
          if (auditSession) {
            await auditSession.logEvent('tool_end', {
              result: resultMsg.content,
              timestamp: new Date().toISOString()
            });
          }
        } else if (message.type === "result") {
          const resultMessage = message as {
            result?: string;
            total_cost_usd?: number;
            duration_ms?: number;
            subtype?: string;
            permission_denials?: unknown[];
          };
          result = resultMessage.result || null;

          if (!statusManager) {
            if (useCleanOutput) {
              // Clean completion output - just duration and cost
              console.log(chalk.magenta(`\n    🏁 COMPLETED:`));
              const cost = resultMessage.total_cost_usd || 0;
              console.log(chalk.gray(`    ⏱️  Duration: ${((resultMessage.duration_ms || 0)/1000).toFixed(1)}s, Cost: $${cost.toFixed(4)}`));

              if (resultMessage.subtype === "error_max_turns") {
                console.log(chalk.red(`    ⚠️  Stopped: Hit maximum turns limit`));
              } else if (resultMessage.subtype === "error_during_execution") {
                console.log(chalk.red(`    ❌ Stopped: Execution error`));
              }

              if (resultMessage.permission_denials && resultMessage.permission_denials.length > 0) {
                console.log(chalk.yellow(`    🚫 ${resultMessage.permission_denials.length} permission denials`));
              }
            } else {
              // Full completion output for agents without clean output
              console.log(chalk.magenta(`\n    🏁 COMPLETED:`));
              const cost = resultMessage.total_cost_usd || 0;
              console.log(chalk.gray(`    ⏱️  Duration: ${((resultMessage.duration_ms || 0)/1000).toFixed(1)}s, Cost: $${cost.toFixed(4)}`));

              if (resultMessage.subtype === "error_max_turns") {
                console.log(chalk.red(`    ⚠️  Stopped: Hit maximum turns limit`));
              } else if (resultMessage.subtype === "error_during_execution") {
                console.log(chalk.red(`    ❌ Stopped: Execution error`));
              }

              if (resultMessage.permission_denials && resultMessage.permission_denials.length > 0) {
                console.log(chalk.yellow(`    🚫 ${resultMessage.permission_denials.length} permission denials`));
              }

              // Show result content (if it's reasonable length)
              if (result && typeof result === 'string') {
                if (result.length > 1000) {
                  console.log(chalk.magenta(`    📄 ${result.slice(0, 1000)}... [${result.length} total chars]`));
                } else {
                  console.log(chalk.magenta(`    📄 ${result}`));
                }
              }
            }
          }

          // Track cost for all agents
          const cost = resultMessage.total_cost_usd || 0;
          const agentKey = description.toLowerCase().replace(/\s+/g, '-');
          costResults.agents[agentKey] = cost;
          costResults.total += cost;

          // Store cost for return value and partial tracking
          totalCost = cost;
          partialCost = cost;
          break;
        } else {
          // Log any other message types we might not be handling
          console.log(chalk.gray(`    💬 ${message.type}: ${JSON.stringify(message, null, 2)}`));
        }
      }
    } catch (queryError) {
      throw queryError; // Re-throw to outer catch
    }

    const duration = timer.stop();
    const agentKey = description.toLowerCase().replace(/\s+/g, '-');
    timingResults.agents[agentKey] = duration;

    // API error detection is logged but not immediately failed
    if (apiErrorDetected) {
      console.log(chalk.yellow(`  ⚠️ API Error detected in ${description} - will validate deliverables before failing`));
    }

    // Show completion messages based on agent type
    if (progressIndicator) {
      const agentType = description.includes('Pre-recon') ? 'Pre-recon analysis' :
                       description.includes('Recon') ? 'Reconnaissance' :
                       description.includes('Report') ? 'Report generation' : 'Analysis';
      progressIndicator.finish(`${agentType} complete! (${turnCount} turns, ${formatDuration(duration)})`);
    } else if (isParallelExecution) {
      const prefix = getAgentPrefix(description);
      console.log(chalk.green(`${prefix} ✅ Complete (${turnCount} turns, ${formatDuration(duration)})`));
    } else if (!useCleanOutput) {
      console.log(chalk.green(`  ✅ Claude Code completed: ${description} (${turnCount} turns) in ${formatDuration(duration)}`));
    }

    // Return result with log file path for all agents
    const returnData: ClaudePromptResult = {
      result,
      success: true,
      duration,
      turns: turnCount,
      cost: totalCost,
      partialCost,
      apiErrorDetected
    };
    if (logFilePath) {
      returnData.logFile = logFilePath;
    }
    return returnData;

  } catch (error) {
    const duration = timer.stop();
    const agentKey = description.toLowerCase().replace(/\s+/g, '-');
    timingResults.agents[agentKey] = duration;

    const err = error as Error & { code?: string; status?: number; duration?: number; cost?: number };

    // Log error to audit system
    if (auditSession) {
      await auditSession.logEvent('error', {
        message: err.message,
        errorType: err.constructor.name,
        stack: err.stack,
        duration,
        turns: turnCount,
        timestamp: new Date().toISOString()
      });
    }

    // Show error messages based on agent type
    if (progressIndicator) {
      progressIndicator.stop();
      const agentType = description.includes('Pre-recon') ? 'Pre-recon analysis' :
                       description.includes('Recon') ? 'Reconnaissance' :
                       description.includes('Report') ? 'Report generation' : 'Analysis';
      console.log(chalk.red(`❌ ${agentType} failed (${formatDuration(duration)})`));
    } else if (isParallelExecution) {
      const prefix = getAgentPrefix(description);
      console.log(chalk.red(`${prefix} ❌ Failed (${formatDuration(duration)})`));
    } else if (!useCleanOutput) {
      console.log(chalk.red(`  ❌ Claude Code failed: ${description} (${formatDuration(duration)})`));
    }
    console.log(chalk.red(`    Error Type: ${err.constructor.name}`));
    console.log(chalk.red(`    Message: ${err.message}`));
    console.log(chalk.gray(`    Agent: ${description}`));
    console.log(chalk.gray(`    Working Directory: ${sourceDir}`));
    console.log(chalk.gray(`    Retryable: ${isRetryableError(err) ? 'Yes' : 'No'}`));

    // Log additional context if available
    if (err.code) {
      console.log(chalk.gray(`    Error Code: ${err.code}`));
    }
    if (err.status) {
      console.log(chalk.gray(`    HTTP Status: ${err.status}`));
    }

    // Save detailed error to log file for debugging
    try {
      const errorLog = {
        timestamp: new Date().toISOString(),
        agent: description,
        error: {
          name: err.constructor.name,
          message: err.message,
          code: err.code,
          status: err.status,
          stack: err.stack
        },
        context: {
          sourceDir,
          prompt: fullPrompt.slice(0, 200) + '...',
          retryable: isRetryableError(err)
        },
        duration
      };

      const logPath = path.join(sourceDir, 'error.log');
      await fs.appendFile(logPath, JSON.stringify(errorLog) + '\n');
    } catch (logError) {
      const logErrMsg = logError instanceof Error ? logError.message : String(logError);
      console.log(chalk.gray(`    (Failed to write error log: ${logErrMsg})`));
    }

    return {
      error: err.message,
      errorType: err.constructor.name,
      prompt: fullPrompt.slice(0, 100) + '...',
      success: false,
      duration,
      cost: partialCost,
      retryable: isRetryableError(err)
    };
  }
}

// PREFERRED: Production-ready Claude agent execution with full orchestration
export async function runClaudePromptWithRetry(
  prompt: string,
  sourceDir: string,
  allowedTools: string = 'Read',
  context: string = '',
  description: string = 'Claude analysis',
  agentName: string | null = null,
  colorFn: ChalkInstance = chalk.cyan,
  sessionMetadata: SessionMetadata | null = null
): Promise<ClaudePromptResult> {
  const maxRetries = 3;
  let lastError: Error | undefined;
  let retryContext = context;

  console.log(chalk.cyan(`🚀 Starting ${description} with ${maxRetries} max attempts`));

  // Initialize audit session (crash-safe logging)
  let auditSession: AuditSession | null = null;
  if (sessionMetadata && agentName) {
    auditSession = new AuditSession(sessionMetadata);
    await auditSession.initialize();
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Create checkpoint before each attempt
    await createGitCheckpoint(sourceDir, description, attempt);

    // Start agent tracking in audit system (saves prompt snapshot automatically)
    if (auditSession && agentName) {
      const fullPrompt = retryContext ? `${retryContext}\n\n${prompt}` : prompt;
      await auditSession.startAgent(agentName, fullPrompt, attempt);
    }

    try {
      const result = await runClaudePrompt(prompt, sourceDir, allowedTools, retryContext, description, agentName, colorFn, sessionMetadata, auditSession, attempt);

      // Validate output after successful run
      if (result.success) {
        const validationPassed = await validateAgentOutput(result, agentName, sourceDir);

        if (validationPassed) {
          // Check if API error was detected but validation passed
          if (result.apiErrorDetected) {
            console.log(chalk.yellow(`📋 Validation: Ready for exploitation despite API error warnings`));
          }

          // Record successful attempt in audit system
          if (auditSession && agentName) {
            const commitHash = await getGitCommitHash(sourceDir);
            const endResult: {
              attemptNumber: number;
              duration_ms: number;
              cost_usd: number;
              success: true;
              checkpoint?: string;
            } = {
              attemptNumber: attempt,
              duration_ms: result.duration,
              cost_usd: result.cost || 0,
              success: true,
            };
            if (commitHash) {
              endResult.checkpoint = commitHash;
            }
            await auditSession.endAgent(agentName, endResult);
          }

          // Commit successful changes (will include the snapshot)
          await commitGitSuccess(sourceDir, description);
          console.log(chalk.green.bold(`🎉 ${description} completed successfully on attempt ${attempt}/${maxRetries}`));
          return result;
        } else {
          // Agent completed but output validation failed
          console.log(chalk.yellow(`⚠️ ${description} completed but output validation failed`));

          // Record failed validation attempt in audit system
          if (auditSession && agentName) {
            await auditSession.endAgent(agentName, {
              attemptNumber: attempt,
              duration_ms: result.duration,
              cost_usd: result.partialCost || result.cost || 0,
              success: false,
              error: 'Output validation failed',
              isFinalAttempt: attempt === maxRetries
            });
          }

          // If API error detected AND validation failed, this is a retryable error
          if (result.apiErrorDetected) {
            console.log(chalk.yellow(`⚠️ API Error detected with validation failure - treating as retryable`));
            lastError = new Error('API Error: terminated with validation failure');
          } else {
            lastError = new Error('Output validation failed');
          }

          if (attempt < maxRetries) {
            // Rollback contaminated workspace
            await rollbackGitWorkspace(sourceDir, 'validation failure');
            continue;
          } else {
            // FAIL FAST - Don't continue with broken pipeline
            throw new PentestError(
              `Agent ${description} failed output validation after ${maxRetries} attempts. Required deliverable files were not created.`,
              'validation',
              false,
              { description, sourceDir, attemptsExhausted: maxRetries }
            );
          }
        }
      }

    } catch (error) {
      const err = error as Error & { duration?: number; cost?: number; partialResults?: unknown };
      lastError = err;

      // Record failed attempt in audit system
      if (auditSession && agentName) {
        await auditSession.endAgent(agentName, {
          attemptNumber: attempt,
          duration_ms: err.duration || 0,
          cost_usd: err.cost || 0,
          success: false,
          error: err.message,
          isFinalAttempt: attempt === maxRetries
        });
      }

      // Check if error is retryable
      if (!isRetryableError(err)) {
        console.log(chalk.red(`❌ ${description} failed with non-retryable error: ${err.message}`));
        await rollbackGitWorkspace(sourceDir, 'non-retryable error cleanup');
        throw err;
      }

      if (attempt < maxRetries) {
        // Rollback for clean retry
        await rollbackGitWorkspace(sourceDir, 'retryable error cleanup');

        const delay = getRetryDelay(err, attempt);
        const delaySeconds = (delay / 1000).toFixed(1);
        console.log(chalk.yellow(`⚠️ ${description} failed (attempt ${attempt}/${maxRetries})`));
        console.log(chalk.gray(`    Error: ${err.message}`));
        console.log(chalk.gray(`    Workspace rolled back, retrying in ${delaySeconds}s...`));

        // Preserve any partial results for next retry
        if (err.partialResults) {
          retryContext = `${context}\n\nPrevious partial results: ${JSON.stringify(err.partialResults)}`;
        }

        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        await rollbackGitWorkspace(sourceDir, 'final failure cleanup');
        console.log(chalk.red(`❌ ${description} failed after ${maxRetries} attempts`));
        console.log(chalk.red(`    Final error: ${err.message}`));
      }
    }
  }

  throw lastError;
}

// Helper function to get git commit hash
async function getGitCommitHash(sourceDir: string): Promise<string | null> {
  try {
    const result = await $`cd ${sourceDir} && git rev-parse HEAD`;
    return result.stdout.trim();
  } catch {
    return null;
  }
}
