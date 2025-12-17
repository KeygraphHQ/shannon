// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { $, fs, path } from 'zx';
import chalk from 'chalk';
import { Ollama } from 'ollama';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { isRetryableError, getRetryDelay, PentestError } from '../error-handling.js';
import { ProgressIndicator } from '../progress-indicator.js';
import { timingResults, costResults, Timer } from '../utils/metrics.js';
import { formatDuration } from '../audit/utils.js';
import { createGitCheckpoint, commitGitSuccess, rollbackGitWorkspace } from '../utils/git-manager.js';
import { AGENT_VALIDATORS } from '../constants.js';
import { filterJsonToolCalls, getAgentPrefix } from '../utils/output-formatter.js';
import { generateSessionLogPath } from '../session-manager.js';
import { AuditSession } from '../audit/index.js';

// Browser automation state (lazy loaded)
let browserInstance = null;
let browserContext = null;
let browserPage = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ollama configuration
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3:32b';

// Define tools for file operations and command execution
const OLLAMA_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file at the given path',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The file path to read' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file at the given path',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The file path to write to' },
          content: { type: 'string', description: 'The content to write' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List files and directories at the given path',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The directory path to list' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Execute a shell command and return its output',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The command to execute' },
          cwd: { type: 'string', description: 'Working directory for the command (optional)' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search for files matching a pattern using grep',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'The pattern to search for' },
          directory: { type: 'string', description: 'The directory to search in' },
          file_pattern: { type: 'string', description: 'File glob pattern (e.g., "*.js")' }
        },
        required: ['pattern', 'directory']
      }
    }
  },
  // Browser automation tools
  {
    type: 'function',
    function: {
      name: 'browser_navigate',
      description: 'Navigate to a URL in the browser. Initializes browser if not already running.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to navigate to' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_click',
      description: 'Click on an element in the browser page',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector or text content to click' }
        },
        required: ['selector']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_type',
      description: 'Type text into an input field',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector for the input field' },
          text: { type: 'string', description: 'Text to type' }
        },
        required: ['selector', 'text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_screenshot',
      description: 'Take a screenshot of the current page',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to save the screenshot' },
          fullPage: { type: 'boolean', description: 'Whether to capture full page (default: false)' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_get_content',
      description: 'Get the text content or HTML of the current page',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'Content type: "text" or "html" (default: text)' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_evaluate',
      description: 'Execute JavaScript code in the browser and return the result',
      parameters: {
        type: 'object',
        properties: {
          script: { type: 'string', description: 'JavaScript code to execute' }
        },
        required: ['script']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_fill_form',
      description: 'Fill a form field and optionally submit',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector for the form or input' },
          value: { type: 'string', description: 'Value to fill' },
          submit: { type: 'boolean', description: 'Whether to submit the form after filling' }
        },
        required: ['selector', 'value']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_wait',
      description: 'Wait for an element to appear or for a specified time',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector to wait for (optional)' },
          timeout: { type: 'number', description: 'Timeout in milliseconds (default: 5000)' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_close',
      description: 'Close the browser instance',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  }
];

// Initialize browser lazily
async function initBrowser() {
  if (!browserInstance) {
    try {
      const { chromium } = await import('playwright');
      browserInstance = await chromium.launch({ headless: true });
      browserContext = await browserInstance.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      browserPage = await browserContext.newPage();
      console.log(chalk.green('    🌐 Browser initialized successfully'));
    } catch (error) {
      console.log(chalk.yellow(`    ⚠️ Browser initialization failed: ${error.message}`));
      console.log(chalk.yellow('    📦 Install Playwright: npx playwright install chromium'));
      throw error;
    }
  }
  return browserPage;
}

// Close browser
async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
    browserContext = null;
    browserPage = null;
    console.log(chalk.gray('    🌐 Browser closed'));
  }
}

// Tool execution handlers
async function executeToolCall(toolName, args, sourceDir) {
  try {
    switch (toolName) {
      case 'read_file': {
        const filePath = path.isAbsolute(args.path) ? args.path : path.join(sourceDir, args.path);
        const content = await fs.readFile(filePath, 'utf-8');
        return { success: true, content };
      }
      case 'write_file': {
        const filePath = path.isAbsolute(args.path) ? args.path : path.join(sourceDir, args.path);
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, args.content, 'utf-8');
        return { success: true, message: `File written to ${filePath}` };
      }
      case 'list_directory': {
        const dirPath = path.isAbsolute(args.path) ? args.path : path.join(sourceDir, args.path);
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const result = entries.map(e => ({
          name: e.name,
          type: e.isDirectory() ? 'directory' : 'file'
        }));
        return { success: true, entries: result };
      }
      case 'run_command': {
        const cwd = args.cwd ? (path.isAbsolute(args.cwd) ? args.cwd : path.join(sourceDir, args.cwd)) : sourceDir;
        $.cwd = cwd;
        const result = await $`${args.command.split(' ')}`;
        return { success: true, stdout: result.stdout, stderr: result.stderr };
      }
      case 'search_files': {
        const dirPath = path.isAbsolute(args.directory) ? args.directory : path.join(sourceDir, args.directory);
        const filePattern = args.file_pattern || '*';
        try {
          const result = await $`grep -r -l ${args.pattern} ${dirPath} --include=${filePattern}`;
          return { success: true, files: result.stdout.trim().split('\n').filter(Boolean) };
        } catch (e) {
          return { success: true, files: [], message: 'No matches found' };
        }
      }
      // Browser automation tools
      case 'browser_navigate': {
        const page = await initBrowser();
        await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const title = await page.title();
        const url = page.url();
        return { success: true, title, url, message: `Navigated to ${url}` };
      }
      case 'browser_click': {
        const page = await initBrowser();
        // Try CSS selector first, then text
        try {
          await page.click(args.selector, { timeout: 5000 });
        } catch (e) {
          // Try clicking by text content
          await page.click(`text=${args.selector}`, { timeout: 5000 });
        }
        return { success: true, message: `Clicked on ${args.selector}` };
      }
      case 'browser_type': {
        const page = await initBrowser();
        await page.fill(args.selector, args.text);
        return { success: true, message: `Typed into ${args.selector}` };
      }
      case 'browser_screenshot': {
        const page = await initBrowser();
        const screenshotPath = path.isAbsolute(args.path) ? args.path : path.join(sourceDir, args.path);
        await fs.ensureDir(path.dirname(screenshotPath));
        await page.screenshot({
          path: screenshotPath,
          fullPage: args.fullPage || false
        });
        return { success: true, path: screenshotPath, message: `Screenshot saved to ${screenshotPath}` };
      }
      case 'browser_get_content': {
        const page = await initBrowser();
        const contentType = args.type || 'text';
        let content;
        if (contentType === 'html') {
          content = await page.content();
        } else {
          content = await page.innerText('body');
        }
        // Truncate if too long
        if (content.length > 10000) {
          content = content.slice(0, 10000) + '\n... [truncated]';
        }
        return { success: true, content, url: page.url() };
      }
      case 'browser_evaluate': {
        const page = await initBrowser();
        const result = await page.evaluate(args.script);
        return { success: true, result };
      }
      case 'browser_fill_form': {
        const page = await initBrowser();
        await page.fill(args.selector, args.value);
        if (args.submit) {
          await page.press(args.selector, 'Enter');
        }
        return { success: true, message: `Filled ${args.selector} with value` };
      }
      case 'browser_wait': {
        const page = await initBrowser();
        const timeout = args.timeout || 5000;
        if (args.selector) {
          await page.waitForSelector(args.selector, { timeout });
          return { success: true, message: `Element ${args.selector} appeared` };
        } else {
          await page.waitForTimeout(timeout);
          return { success: true, message: `Waited ${timeout}ms` };
        }
      }
      case 'browser_close': {
        await closeBrowser();
        return { success: true, message: 'Browser closed' };
      }
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Simplified validation using direct agent name mapping
async function validateAgentOutput(result, agentName, sourceDir) {
  console.log(chalk.blue(`    🔍 Validating ${agentName} agent output`));

  try {
    if (!result.success || !result.result) {
      console.log(chalk.red(`    ❌ Validation failed: Agent execution was unsuccessful`));
      return false;
    }

    const validator = AGENT_VALIDATORS[agentName];

    if (!validator) {
      console.log(chalk.yellow(`    ⚠️ No validator found for agent "${agentName}" - assuming success`));
      console.log(chalk.green(`    ✅ Validation passed: Unknown agent with successful result`));
      return true;
    }

    console.log(chalk.blue(`    📋 Using validator for agent: ${agentName}`));
    console.log(chalk.blue(`    📂 Source directory: ${sourceDir}`));

    const validationResult = await validator(sourceDir);

    if (validationResult) {
      console.log(chalk.green(`    ✅ Validation passed: Required files/structure present`));
    } else {
      console.log(chalk.red(`    ❌ Validation failed: Missing required deliverable files`));
    }

    return validationResult;

  } catch (error) {
    console.log(chalk.red(`    ❌ Validation failed with error: ${error.message}`));
    return false;
  }
}

// Run Ollama prompt - core execution function
async function runOllamaPrompt(prompt, sourceDir, allowedTools = 'Read', context = '', description = 'Ollama analysis', agentName = null, colorFn = chalk.cyan, sessionMetadata = null, auditSession = null, attemptNumber = 1) {
  const timer = new Timer(`agent-${description.toLowerCase().replace(/\s+/g, '-')}`);
  const fullPrompt = context ? `${context}\n\n${prompt}` : prompt;

  // Auto-detect execution mode
  const isParallelExecution = description.includes('vuln agent') || description.includes('exploit agent');
  const useCleanOutput = description.includes('Pre-recon agent') ||
    description.includes('Recon agent') ||
    description.includes('Executive Summary and Report Cleanup') ||
    description.includes('vuln agent') ||
    description.includes('exploit agent');

  // Setup progress indicator
  let progressIndicator = null;
  if (useCleanOutput && !global.SHANNON_DISABLE_LOADER) {
    const agentType = description.includes('Pre-recon') ? 'pre-reconnaissance' :
      description.includes('Recon') ? 'reconnaissance' :
        description.includes('Report') ? 'report generation' : 'analysis';
    progressIndicator = new ProgressIndicator(`Running ${agentType} (Ollama: ${OLLAMA_MODEL})...`);
  }

  // Log file path
  let logFilePath = null;
  if (sessionMetadata && sessionMetadata.webUrl && sessionMetadata.id) {
    const timestamp = new Date().toISOString().replace(/T/, '_').replace(/[:.]/g, '-').slice(0, 19);
    const logAgentName = description.toLowerCase().replace(/\s+/g, '-');
    const logDir = generateSessionLogPath(sessionMetadata.webUrl, sessionMetadata.id);
    logFilePath = path.join(logDir, `${timestamp}_${logAgentName}_attempt-${attemptNumber}.log`);
  } else {
    console.log(chalk.blue(`  🦙 Running Ollama (${OLLAMA_MODEL}): ${description}...`));
  }

  let turnCount = 0;
  let messages = [];

  try {
    // Initialize Ollama client
    const ollama = new Ollama({ host: OLLAMA_HOST });

    // System message for pentesting context
    const systemMessage = `You are an expert security researcher and penetration tester. 
You have access to tools to read/write files, execute commands, and search through code.
You are analyzing a web application for security vulnerabilities.
Working directory: ${sourceDir}

Important guidelines:
1. Be thorough and systematic in your analysis
2. Create deliverable files in the 'deliverables' directory
3. Document all findings with evidence
4. Focus on actionable, exploitable vulnerabilities`;

    // Initialize conversation
    let conversation = [
      { role: 'system', content: systemMessage },
      { role: 'user', content: fullPrompt }
    ];

    // Start progress indicator
    if (progressIndicator) {
      progressIndicator.start();
    }

    const maxTurns = 100; // Limit turns to prevent infinite loops
    let result = null;
    let lastHeartbeat = Date.now();
    const HEARTBEAT_INTERVAL = 30000;

    while (turnCount < maxTurns) {
      turnCount++;

      // Periodic heartbeat
      const now = Date.now();
      if (global.SHANNON_DISABLE_LOADER && now - lastHeartbeat > HEARTBEAT_INTERVAL) {
        console.log(chalk.blue(`    ⏱️  [${Math.floor((now - timer.startTime) / 1000)}s] ${description} running... (Turn ${turnCount})`));
        lastHeartbeat = now;
      }

      // Call Ollama
      const response = await ollama.chat({
        model: OLLAMA_MODEL,
        messages: conversation,
        tools: OLLAMA_TOOLS,
        stream: false
      });

      const assistantMessage = response.message;
      conversation.push(assistantMessage);

      // Display output
      if (assistantMessage.content) {
        if (progressIndicator) {
          progressIndicator.stop();
        }

        const cleanedContent = filterJsonToolCalls(assistantMessage.content);
        if (cleanedContent.trim()) {
          if (isParallelExecution) {
            const prefix = getAgentPrefix(description);
            console.log(colorFn(`${prefix} ${cleanedContent}`));
          } else {
            console.log(colorFn(`\n    🦙 Turn ${turnCount} (${description}):`));
            console.log(colorFn(`    ${cleanedContent}`));
          }
        }

        if (progressIndicator) {
          progressIndicator.start();
        }

        messages.push(assistantMessage.content);

        // Log to audit system
        if (auditSession) {
          await auditSession.logEvent('llm_response', {
            turn: turnCount,
            content: assistantMessage.content,
            timestamp: new Date().toISOString()
          });
        }
      }

      // Check for tool calls
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        const toolResults = [];

        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = toolCall.function.arguments;

          console.log(chalk.yellow(`\n    🔧 Using Tool: ${toolName}`));
          if (toolArgs && Object.keys(toolArgs).length > 0) {
            console.log(chalk.gray(`    Input: ${JSON.stringify(toolArgs, null, 2)}`));
          }

          // Log tool start
          if (auditSession) {
            await auditSession.logEvent('tool_start', {
              toolName,
              parameters: toolArgs,
              timestamp: new Date().toISOString()
            });
          }

          // Execute tool
          const toolResult = await executeToolCall(toolName, toolArgs, sourceDir);

          console.log(chalk.green(`    ✅ Tool Result:`));
          const resultStr = JSON.stringify(toolResult, null, 2);
          if (resultStr.length > 500) {
            console.log(chalk.gray(`    ${resultStr.slice(0, 500)}...\n    [Result truncated - ${resultStr.length} total chars]`));
          } else {
            console.log(chalk.gray(`    ${resultStr}`));
          }

          // Log tool end
          if (auditSession) {
            await auditSession.logEvent('tool_end', {
              result: toolResult,
              timestamp: new Date().toISOString()
            });
          }

          toolResults.push({
            role: 'tool',
            content: JSON.stringify(toolResult)
          });
        }

        // Add tool results to conversation
        conversation.push(...toolResults);
      } else {
        // No tool calls - check if the model is done
        const content = assistantMessage.content?.toLowerCase() || '';
        if (content.includes('complete') || content.includes('finished') || content.includes('done')) {
          result = assistantMessage.content;
          break;
        }

        // If no tools and no completion signal, we might be stuck
        if (turnCount > 5 && !assistantMessage.tool_calls) {
          result = assistantMessage.content;
          break;
        }
      }
    }

    const duration = timer.stop();
    const agentKey = description.toLowerCase().replace(/\s+/g, '-');
    timingResults.agents[agentKey] = duration;

    // Ollama is local, no cost
    costResults.agents[agentKey] = 0;

    // Show completion
    if (progressIndicator) {
      const agentType = description.includes('Pre-recon') ? 'Pre-recon analysis' :
        description.includes('Recon') ? 'Reconnaissance' :
          description.includes('Report') ? 'Report generation' : 'Analysis';
      progressIndicator.finish(`${agentType} complete! (${turnCount} turns, ${formatDuration(duration)})`);
    } else if (isParallelExecution) {
      const prefix = getAgentPrefix(description);
      console.log(chalk.green(`${prefix} ✅ Complete (${turnCount} turns, ${formatDuration(duration)})`));
    } else if (!useCleanOutput) {
      console.log(chalk.green(`  ✅ Ollama completed: ${description} (${turnCount} turns) in ${formatDuration(duration)}`));
    }

    const returnData = {
      result,
      success: true,
      duration,
      turns: turnCount,
      cost: 0, // Local model, no cost
      partialCost: 0,
      apiErrorDetected: false
    };

    if (logFilePath) {
      returnData.logFile = logFilePath;
    }

    return returnData;

  } catch (error) {
    const duration = timer.stop();
    const agentKey = description.toLowerCase().replace(/\s+/g, '-');
    timingResults.agents[agentKey] = duration;

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
      console.log(chalk.red(`  ❌ Ollama failed: ${description} (${formatDuration(duration)})`));
    }

    console.log(chalk.red(`    Error Type: ${error.constructor.name}`));
    console.log(chalk.red(`    Message: ${error.message}`));
    console.log(chalk.gray(`    Agent: ${description}`));
    console.log(chalk.gray(`    Working Directory: ${sourceDir}`));
    console.log(chalk.gray(`    Retryable: ${isRetryableError(error) ? 'Yes' : 'No'}`));

    // Save error log
    try {
      const errorLog = {
        timestamp: new Date().toISOString(),
        agent: description,
        error: {
          name: error.constructor.name,
          message: error.message,
          stack: error.stack
        },
        context: {
          sourceDir,
          model: OLLAMA_MODEL,
          host: OLLAMA_HOST,
          retryable: isRetryableError(error)
        },
        duration
      };

      const logPath = path.join(sourceDir, 'error.log');
      await fs.appendFile(logPath, JSON.stringify(errorLog) + '\n');
    } catch (logError) {
      console.log(chalk.gray(`    (Failed to write error log: ${logError.message})`));
    }

    return {
      error: error.message,
      errorType: error.constructor.name,
      prompt: fullPrompt.slice(0, 100) + '...',
      success: false,
      duration,
      cost: 0,
      retryable: isRetryableError(error)
    };
  }
}

// Production-ready Ollama agent execution with full orchestration
export async function runOllamaPromptWithRetry(prompt, sourceDir, allowedTools = 'Read', context = '', description = 'Ollama analysis', agentName = null, colorFn = chalk.cyan, sessionMetadata = null) {
  const maxRetries = 3;
  let lastError;
  let retryContext = context;

  console.log(chalk.cyan(`🦙 Starting ${description} with Ollama (${OLLAMA_MODEL}) - ${maxRetries} max attempts`));

  // Initialize audit session
  let auditSession = null;
  if (sessionMetadata && agentName) {
    auditSession = new AuditSession(sessionMetadata);
    await auditSession.initialize();
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await createGitCheckpoint(sourceDir, description, attempt);

    if (auditSession) {
      const fullPrompt = retryContext ? `${retryContext}\n\n${prompt}` : prompt;
      await auditSession.startAgent(agentName, fullPrompt, attempt);
    }

    try {
      const result = await runOllamaPrompt(prompt, sourceDir, allowedTools, retryContext, description, agentName, colorFn, sessionMetadata, auditSession, attempt);

      if (result.success) {
        const validationPassed = await validateAgentOutput(result, agentName, sourceDir);

        if (validationPassed) {
          if (auditSession) {
            await auditSession.endAgent(agentName, {
              attemptNumber: attempt,
              duration_ms: result.duration,
              cost_usd: 0,
              success: true,
              checkpoint: await getGitCommitHash(sourceDir)
            });
          }

          await commitGitSuccess(sourceDir, description);
          console.log(chalk.green.bold(`🎉 ${description} completed successfully on attempt ${attempt}/${maxRetries}`));
          return result;
        } else {
          console.log(chalk.yellow(`⚠️ ${description} completed but output validation failed`));

          if (auditSession) {
            await auditSession.endAgent(agentName, {
              attemptNumber: attempt,
              duration_ms: result.duration,
              cost_usd: 0,
              success: false,
              error: 'Output validation failed',
              isFinalAttempt: attempt === maxRetries
            });
          }

          lastError = new Error('Output validation failed');

          if (attempt < maxRetries) {
            await rollbackGitWorkspace(sourceDir, 'validation failure');
            continue;
          } else {
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

      if (auditSession) {
        await auditSession.endAgent(agentName, {
          attemptNumber: attempt,
          duration_ms: error.duration || 0,
          cost_usd: 0,
          success: false,
          error: error.message,
          isFinalAttempt: attempt === maxRetries
        });
      }

      if (!isRetryableError(error)) {
        console.log(chalk.red(`❌ ${description} failed with non-retryable error: ${error.message}`));
        await rollbackGitWorkspace(sourceDir, 'non-retryable error cleanup');
        throw error;
      }

      if (attempt < maxRetries) {
        await rollbackGitWorkspace(sourceDir, 'retryable error cleanup');

        const delay = getRetryDelay(error, attempt);
        const delaySeconds = (delay / 1000).toFixed(1);
        console.log(chalk.yellow(`⚠️ ${description} failed (attempt ${attempt}/${maxRetries})`));
        console.log(chalk.gray(`    Error: ${error.message}`));
        console.log(chalk.gray(`    Workspace rolled back, retrying in ${delaySeconds}s...`));

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

// Export configuration for external access
export const ollamaConfig = {
  host: OLLAMA_HOST,
  model: OLLAMA_MODEL
};
