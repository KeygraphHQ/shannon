// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { $, fs, path } from 'zx';
import chalk from 'chalk';
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
import { createShannonHelperServer } from '../../mcp-server/src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Convert agent name to prompt name for MCP_AGENT_MAPPING lookup
 *
 * @param {string} agentName - Agent name (e.g., 'xss-vuln', 'injection-exploit')
 * @returns {string} Prompt name (e.g., 'vuln-xss', 'exploit-injection')
 */
function agentNameToPromptName(agentName) {
  // Special cases
  if (agentName === 'pre-recon') return 'pre-recon-code';
  if (agentName === 'report') return 'report-executive';
  if (agentName === 'recon') return 'recon';

  // Pattern: {type}-vuln → vuln-{type}
  const vulnMatch = agentName.match(/^(.+)-vuln$/);
  if (vulnMatch) {
    return `vuln-${vulnMatch[1]}`;
  }

  // Pattern: {type}-exploit → exploit-{type}
  const exploitMatch = agentName.match(/^(.+)-exploit$/);
  if (exploitMatch) {
    return `exploit-${exploitMatch[1]}`;
  }

  // Default: return as-is
  return agentName;
}

// Simplified validation using direct agent name mapping
async function validateAgentOutput(result, agentName, sourceDir) {
  console.log(chalk.blue(`    🔍 Validating ${agentName} agent output`));

  try {
    // Check if agent completed successfully
    if (!result.success || !result.result) {
      console.log(chalk.red(`    ❌ Validation failed: Agent execution was unsuccessful`));
      return false;
    }

    // Get validator function for this agent
    const validator = AGENT_VALIDATORS[agentName];

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
    console.log(chalk.red(`    ❌ Validation failed with error: ${error.message}`));
    return false; // Assume invalid on validation error
  }
}

// Pure function: Run Claude Code with SDK - Maximum Autonomy
// WARNING: This is a low-level function. Use runClaudePromptWithRetry() for agent execution to ensure:
// - Retry logic and error handling
// - Output validation
// - Prompt snapshotting for debugging
// - Git checkpoint/rollback safety
async function runClaudePrompt(prompt, sourceDir, allowedTools = 'Read', context = '', description = 'Claude analysis', agentName = null, colorFn = chalk.cyan, sessionMetadata = null, auditSession = null, attemptNumber = 1) {
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

  // Setup progress indicator for clean output agents
  let progressIndicator = null;
  if (useCleanOutput) {
    const agentType = description.includes('Pre-recon') ? 'pre-reconnaissance' :
                     description.includes('Recon') ? 'reconnaissance' :
                     description.includes('Report') ? 'report generation' : 'analysis';
    progressIndicator = new ProgressIndicator(`Running ${agentType}...`);
  }

  // NOTE: Logging now handled by AuditSession (append-only, crash-safe)
  // Legacy log path generation kept for compatibility
  let logFilePath = null;
  if (sessionMetadata && sessionMetadata.webUrl && sessionMetadata.id) {
    const timestamp = new Date().toISOString().replace(/T/, '_').replace(/[:.]/g, '-').slice(0, 19);
    const agentName = description.toLowerCase().replace(/\s+/g, '-');
    const logDir = generateSessionLogPath(sessionMetadata.webUrl, sessionMetadata.id);
    logFilePath = path.join(logDir, `${timestamp}_${agentName}_attempt-${attemptNumber}.log`);
  } else {
    console.log(chalk.blue(`  🤖 Running Claude Code: ${description}...`));
  }

  // Declare variables that need to be accessible in both try and catch blocks
  let turnCount = 0;

  try {
    // Create MCP server with target directory context
    const shannonHelperServer = createShannonHelperServer(sourceDir);

    // Look up agent's assigned Playwright MCP server
    // Convert agent name (e.g., 'xss-vuln') to prompt name (e.g., 'vuln-xss')
    let playwrightMcpName = null;
    if (agentName) {
      const promptName = agentNameToPromptName(agentName);
      playwrightMcpName = MCP_AGENT_MAPPING[promptName];

      if (playwrightMcpName) {
        console.log(chalk.gray(`    🎭 Assigned ${agentName} → ${playwrightMcpName}`));
      }
    }

    // Configure MCP servers: shannon-helper (SDK) + playwright-agentN (stdio)
    const mcpServers = {
      'shannon-helper': shannonHelperServer,
    };

    // Add Playwright MCP server if this agent needs browser automation
    if (playwrightMcpName) {
      const userDataDir = `/tmp/${playwrightMcpName}`;

      // Detect if running in Docker via explicit environment variable
      const isDocker = process.env.SHANNON_DOCKER === 'true';

      // Build args array - conditionally add --executable-path for Docker
      const mcpArgs = [
        '@playwright/mcp@latest',
        '--isolated',
        '--user-data-dir', userDataDir,
      ];

      // Docker: Use system Chromium; Local: Use Playwright's bundled browsers
      if (isDocker) {
        mcpArgs.push('--executable-path', '/usr/bin/chromium-browser');
        mcpArgs.push('--browser', 'chromium');
      }

      mcpServers[playwrightMcpName] = {
        type: 'stdio',
        command: 'npx',
        args: mcpArgs,
        env: {
          ...process.env,
          PLAYWRIGHT_HEADLESS: 'true', // Ensure headless mode for security and CI compatibility
          ...(isDocker && { PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' }), // Only skip in Docker
        },
      };
    }

    const options = {
      model: 'claude-sonnet-4-5-20250929', // Use latest Claude 4.5 Sonnet
      maxTurns: 10_000, // Maximum turns for autonomous work
      cwd: sourceDir, // Set working directory using SDK option
      permissionMode: 'bypassPermissions', // Bypass all permission checks for pentesting
      mcpServers,
    };

    // SDK Options only shown for verbose agents (not clean output)
    if (!useCleanOutput) {
      console.log(chalk.gray(`    SDK Options: maxTurns=${options.maxTurns}, cwd=${sourceDir}, permissions=BYPASS`));
    }

    let result = null;
    let messages = [];
    let apiErrorDetected = false;

    // Start progress indicator for clean output agents
    if (progressIndicator) {
      progressIndicator.start();
    }


    let messageCount = 0;
    try {
      for await (const message of query({ prompt: fullPrompt, options })) {
        messageCount++;

      if (message.type === "assistant") {
        turnCount++;

        const content = Array.isArray(message.message.content)
          ? message.message.content.map(c => c.text || JSON.stringify(c)).join('\n')
          : message.message.content;

        if (statusManager) {
          // Smart status updates for parallel execution
          const toolUse = statusManager.parseToolUse(content);
          statusManager.updateAgentStatus(description, {
            tool_use: toolUse,
            assistant_text: content,
            turnCount
          });
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
              console.log(colorFn(`\n    🤖 Turn ${turnCount} (${description}):`))
              console.log(colorFn(`    ${cleanedContent}`));
            }

            // Restart progress indicator after output
            if (progressIndicator) {
              progressIndicator.start();
            }
          }
        } else {
          // Full streaming output - show complete messages with specialist color
          console.log(colorFn(`\n    🤖 Turn ${turnCount} (${description}):`))
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

      } else if (message.type === "system" && message.subtype === "init") {
        // Show useful system info only for verbose agents
        if (!useCleanOutput) {
          console.log(chalk.blue(`    ℹ️  Model: ${message.model}, Permission: ${message.permissionMode}`));
          if (message.mcp_servers && message.mcp_servers.length > 0) {
            const mcpStatus = message.mcp_servers.map(s => `${s.name}(${s.status})`).join(', ');
            console.log(chalk.blue(`    📦 MCP: ${mcpStatus}`));
          }
        }

      } else if (message.type === "user") {
        // Skip user messages (these are our own inputs echoed back)
        continue;

      } else if (message.type === "tool_use") {
        console.log(chalk.yellow(`\n    🔧 Using Tool: ${message.name}`));
        if (message.input && Object.keys(message.input).length > 0) {
          console.log(chalk.gray(`    Input: ${JSON.stringify(message.input, null, 2)}`));
        }

        // Log tool start event
        if (auditSession) {
          await auditSession.logEvent('tool_start', {
            toolName: message.name,
            parameters: message.input,
            timestamp: new Date().toISOString()
          });
        }
      } else if (message.type === "tool_result") {
        console.log(chalk.green(`    ✅ Tool Result:`));
        if (message.content) {
          // Show tool results but truncate if too long
          const resultStr = typeof message.content === 'string' ? message.content : JSON.stringify(message.content, null, 2);
          if (resultStr.length > 500) {
            console.log(chalk.gray(`    ${resultStr.slice(0, 500)}...\n    [Result truncated - ${resultStr.length} total chars]`));
          } else {
            console.log(chalk.gray(`    ${resultStr}`));
          }
        }

        // Log tool end event
        if (auditSession) {
          await auditSession.logEvent('tool_end', {
            result: message.content,
            timestamp: new Date().toISOString()
          });
        }
      } else if (message.type === "result") {
        result = message.result;

        if (!statusManager) {
          if (useCleanOutput) {
            // Clean completion output - just duration and cost
            console.log(chalk.magenta(`\n    🏁 COMPLETED:`));
            const cost = message.total_cost_usd || 0;
            console.log(chalk.gray(`    ⏱️  Duration: ${(message.duration_ms/1000).toFixed(1)}s, Cost: $${cost.toFixed(4)}`));

            if (message.subtype === "error_max_turns") {
              console.log(chalk.red(`    ⚠️  Stopped: Hit maximum turns limit`));
            } else if (message.subtype === "error_during_execution") {
              console.log(chalk.red(`    ❌ Stopped: Execution error`));
            }

            if (message.permission_denials && message.permission_denials.length > 0) {
              console.log(chalk.yellow(`    🚫 ${message.permission_denials.length} permission denials`));
            }
          } else {
            // Full completion output for agents without clean output
            console.log(chalk.magenta(`\n    🏁 COMPLETED:`));
            const cost = message.total_cost_usd || 0;
            console.log(chalk.gray(`    ⏱️  Duration: ${(message.duration_ms/1000).toFixed(1)}s, Cost: $${cost.toFixed(4)}`));

            if (message.subtype === "error_max_turns") {
              console.log(chalk.red(`    ⚠️  Stopped: Hit maximum turns limit`));
            } else if (message.subtype === "error_during_execution") {
              console.log(chalk.red(`    ❌ Stopped: Execution error`));
            }

            if (message.permission_denials && message.permission_denials.length > 0) {
              console.log(chalk.yellow(`    🚫 ${message.permission_denials.length} permission denials`));
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
        const cost = message.total_cost_usd || 0;
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
    // Let the retry logic handle validation first
    if (apiErrorDetected) {
      console.log(chalk.yellow(`  ⚠️ API Error detected in ${description} - will validate deliverables before failing`));
    }

    // Finish status line for parallel execution
    if (statusManager) {
      statusManager.clearAgentStatus(description);
      statusManager.finishStatusLine();
    }

    // NOTE: Log writing now handled by AuditSession (crash-safe, append-only)
    // Legacy log writing removed - audit system handles this automatically

    // Show completion messages based on agent type
    if (progressIndicator) {
      // Single agents with progress indicator
      const agentType = description.includes('Pre-recon') ? 'Pre-recon analysis' :
                       description.includes('Recon') ? 'Reconnaissance' :
                       description.includes('Report') ? 'Report generation' : 'Analysis';
      progressIndicator.finish(`${agentType} complete! (${turnCount} turns, ${formatDuration(duration)})`);
    } else if (isParallelExecution) {
      // Compact completion for parallel agents
      const prefix = getAgentPrefix(description);
      console.log(chalk.green(`${prefix} ✅ Complete (${turnCount} turns, ${formatDuration(duration)})`));
    } else if (!useCleanOutput) {
      // Verbose completion for remaining agents
      console.log(chalk.green(`  ✅ Claude Code completed: ${description} (${turnCount} turns) in ${formatDuration(duration)}`));
    }

    // Return result with log file path for all agents
    const returnData = {
      result,
      success: true,
      duration,
      turns: turnCount,
      cost: totalCost,
      partialCost, // Include partial cost for crash recovery
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

    // Clear status for parallel execution before showing error
    if (statusManager) {
      statusManager.clearAgentStatus(description);
      statusManager.finishStatusLine();
    }

    // Log error to audit system
    if (auditSession) {
      await auditSession.logEvent('error', {
        message: error.message,
        errorType: error.constructor.name,
        stack: error.stack,
        duration,
        turns: turnCount,
        timestamp: new Date().toISOString()
      });
    }

    // Show error messages based on agent type
    if (progressIndicator) {
      // Single agents with progress indicator
      progressIndicator.stop();
      const agentType = description.includes('Pre-recon') ? 'Pre-recon analysis' :
                       description.includes('Recon') ? 'Reconnaissance' :
                       description.includes('Report') ? 'Report generation' : 'Analysis';
      console.log(chalk.red(`❌ ${agentType} failed (${formatDuration(duration)})`));
    } else if (isParallelExecution) {
      // Compact error for parallel agents
      const prefix = getAgentPrefix(description);
      console.log(chalk.red(`${prefix} ❌ Failed (${formatDuration(duration)})`));
    } else if (!useCleanOutput) {
      // Verbose error for remaining agents
      console.log(chalk.red(`  ❌ Claude Code failed: ${description} (${formatDuration(duration)})`));
    }
    console.log(chalk.red(`    Error Type: ${error.constructor.name}`));
    console.log(chalk.red(`    Message: ${error.message}`));
    console.log(chalk.gray(`    Agent: ${description}`));
    console.log(chalk.gray(`    Working Directory: ${sourceDir}`));
    console.log(chalk.gray(`    Retryable: ${isRetryableError(error) ? 'Yes' : 'No'}`));

    // Log additional context if available
    if (error.code) {
      console.log(chalk.gray(`    Error Code: ${error.code}`));
    }
    if (error.status) {
      console.log(chalk.gray(`    HTTP Status: ${error.status}`));
    }

    // Save detailed error to log file for debugging
    try {
      const errorLog = {
        timestamp: new Date().toISOString(),
        agent: description,
        error: {
          name: error.constructor.name,
          message: error.message,
          code: error.code,
          status: error.status,
          stack: error.stack
        },
        context: {
          sourceDir,
          prompt: fullPrompt.slice(0, 200) + '...',
          retryable: isRetryableError(error)
        },
        duration
      };

      const logPath = path.join(sourceDir, 'error.log');
      await fs.appendFile(logPath, JSON.stringify(errorLog) + '\n');
    } catch (logError) {
      // Ignore logging errors to avoid cascading failures
      console.log(chalk.gray(`    (Failed to write error log: ${logError.message})`));
    }

    return {
      error: error.message,
      errorType: error.constructor.name,
      prompt: fullPrompt.slice(0, 100) + '...',
      success: false,
      duration,
      cost: partialCost, // Include partial cost on error
      retryable: isRetryableError(error)
    };
  }
}

// PREFERRED: Production-ready Claude agent execution with full orchestration
// This is the standard function for all agent execution. Provides:
// - Intelligent retry logic with exponential backoff
// - Output validation to ensure deliverables are created
// - Prompt snapshotting for debugging and reproducibility
// - Git checkpoint/rollback safety for workspace protection
// - Comprehensive error handling and logging
// - Crash-safe audit logging via AuditSession
export async function runClaudePromptWithRetry(prompt, sourceDir, allowedTools = 'Read', context = '', description = 'Claude analysis', agentName = null, colorFn = chalk.cyan, sessionMetadata = null) {
  const maxRetries = 3;
  let lastError;
  let retryContext = context; // Preserve context between retries

  console.log(chalk.cyan(`🚀 Starting ${description} with ${maxRetries} max attempts`));

  // Initialize audit session (crash-safe logging)
  let auditSession = null;
  if (sessionMetadata && agentName) {
    auditSession = new AuditSession(sessionMetadata);
    await auditSession.initialize();
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Create checkpoint before each attempt
    await createGitCheckpoint(sourceDir, description, attempt);

    // Start agent tracking in audit system (saves prompt snapshot automatically)
    if (auditSession) {
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
          if (auditSession) {
            await auditSession.endAgent(agentName, {
              attemptNumber: attempt,
              duration_ms: result.duration,
              cost_usd: result.cost || 0,
              success: true,
              checkpoint: await getGitCommitHash(sourceDir)
            });
          }

          // Commit successful changes (will include the snapshot)
          await commitGitSuccess(sourceDir, description);
          console.log(chalk.green.bold(`🎉 ${description} completed successfully on attempt ${attempt}/${maxRetries}`));
          return result;
        } else {
          // Agent completed but output validation failed
          console.log(chalk.yellow(`⚠️ ${description} completed but output validation failed`));

          // Record failed validation attempt in audit system
          if (auditSession) {
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
      lastError = error;

      // Record failed attempt in audit system
      if (auditSession) {
        await auditSession.endAgent(agentName, {
          attemptNumber: attempt,
          duration_ms: error.duration || 0,
          cost_usd: error.cost || 0,
          success: false,
          error: error.message,
          isFinalAttempt: attempt === maxRetries
        });
      }

      // Check if error is retryable
      if (!isRetryableError(error)) {
        console.log(chalk.red(`❌ ${description} failed with non-retryable error: ${error.message}`));
        await rollbackGitWorkspace(sourceDir, 'non-retryable error cleanup');
        throw error;
      }

      if (attempt < maxRetries) {
        // Rollback for clean retry
        await rollbackGitWorkspace(sourceDir, 'retryable error cleanup');

        const delay = getRetryDelay(error, attempt);
        const delaySeconds = (delay / 1000).toFixed(1);
        console.log(chalk.yellow(`⚠️ ${description} failed (attempt ${attempt}/${maxRetries})`));
        console.log(chalk.gray(`    Error: ${error.message}`));
        console.log(chalk.gray(`    Workspace rolled back, retrying in ${delaySeconds}s...`));

        // Preserve any partial results for next retry
        if (error.partialResults) {
          retryContext = `${context}\n\nPrevious partial results: ${JSON.stringify(error.partialResults)}`;
        }

        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        await rollbackGitWorkspace(sourceDir, 'final failure cleanup');
        console.log(chalk.red(`❌ ${description} failed after ${maxRetries} attempts`));
        console.log(chalk.red(`    Final error: ${error.message}`));
      }
    }
  }

  throw lastError;
}

// Helper function to get git commit hash
async function getGitCommitHash(sourceDir) {
  try {
    const result = await $`cd ${sourceDir} && git rev-parse HEAD`;
    return result.stdout.trim();
  } catch (error) {
    return null;
  }
}