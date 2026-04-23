/**
 * KiroCliExecutor -- executes Shannon agents via kiro-cli headless mode.
 *
 * Spawns kiro-cli chat --no-interactive as a child process, captures stdout/stderr,
 * maps exit codes to ClaudePromptResult, and strips ANSI escape codes from output.
 */

import { execSync, spawn } from 'node:child_process';
import { readFile as fsReadFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Executor, ExecutorOptions } from '../interfaces/executor.js';
import { PentestError } from '../services/error-handling.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import { ErrorCode } from '../types/errors.js';
import { matchesBillingApiPattern, matchesBillingTextPattern } from '../utils/billing-detection.js';
import type { ClaudePromptResult } from './claude-executor.js';
import type { ModelTier } from './models.js';

// === ANSI Stripping ===

/** Regex source for matching ANSI escape codes in terminal output. */
const ANSI_PATTERN = String.raw`\x1B\[[0-9;]*[a-zA-Z]`;

/** Patterns for kiro-cli metadata lines to strip from output. */
const KIRO_METADATA_PATTERNS: readonly RegExp[] = [
  /^\s*\u26A0\uFE0F/,
  /^\s*Checkpoint saved/i,
  /^\s*Credits used:/i,
  /^\s*Time elapsed:/i,
  /^\s*\d+ credits?/i,
];

/**
 * Strip ANSI escape codes from text.
 *
 * Uses a simple regex replace. Wraps in try/catch for edge cases with
 * truly malformed binary data -- falls back to raw text on failure.
 */
export function stripAnsi(text: string): string {
  try {
    const regex = new RegExp(ANSI_PATTERN, 'g');
    return text.replaceAll(regex, '');
  } catch {
    return text;
  }
}

/**
 * Filter out kiro-cli metadata lines (warnings, checkpoint notices, credits/time footer).
 */
export function stripMetadataLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => !KIRO_METADATA_PATTERNS.some((pattern) => pattern.test(line)))
    .join('\n');
}

// === Agent JSON Interfaces ===

interface KiroAgentJson {
  readonly name: string;
  readonly description?: string;
  readonly prompt: string;
  readonly tools: readonly string[];
  readonly allowedTools: readonly string[];
  readonly model: string;
  readonly mcpServers?: Record<string, McpServerConfig>;
  readonly hooks?: KiroAgentHooks;
}

interface McpServerConfig {
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Record<string, string>;
  readonly timeout?: number;
}

export interface KiroAgentHooks {
  readonly preToolUse?: readonly HookDef[];
  readonly postToolUse?: readonly HookDef[];
  readonly stop?: readonly HookDef[];
  readonly agentSpawn?: readonly HookDef[];
  readonly userPromptSubmit?: readonly HookDef[];
}

interface HookDef {
  readonly matcher?: string;
  readonly command: string;
  readonly timeout_ms?: number;
}

// === Model Tier Mapping ===

const KIRO_MODEL_MAP: Readonly<Record<ModelTier, string>> = {
  small: 'claude-haiku-4.5',
  medium: 'claude-sonnet-4.6',
  large: 'claude-opus-4.6',
};

const MODEL_TIER_ENV_VARS: Readonly<Record<ModelTier, string>> = {
  small: 'ANTHROPIC_SMALL_MODEL',
  medium: 'ANTHROPIC_MEDIUM_MODEL',
  large: 'ANTHROPIC_LARGE_MODEL',
};

/**
 * Resolve a model tier to a kiro-cli model identifier.
 *
 * Checks env var overrides first (ANTHROPIC_SMALL_MODEL, etc.),
 * translating SDK hyphen notation to kiro-cli dot notation.
 */
export function resolveKiroModel(tier: ModelTier): string {
  const envVar = MODEL_TIER_ENV_VARS[tier];
  const envOverride = process.env[envVar];

  if (envOverride) {
    return envOverride.replace(/(\d+)-(\d+)$/, '$1.$2');
  }

  return KIRO_MODEL_MAP[tier];
}

// === Agent JSON Options ===

export interface AgentJsonOptions {
  readonly description?: string;
  readonly playwrightExecutablePath?: string;
  readonly playwrightOutputDir?: string;
  readonly playwrightSession?: string;
  readonly hooks?: KiroAgentHooks;
}

// === Agent JSON Generation ===

/** Build Playwright MCP server config from options. */
function buildMcpServers(options?: AgentJsonOptions): Record<string, McpServerConfig> | undefined {
  if (!options?.playwrightExecutablePath || !options?.playwrightOutputDir) {
    return undefined;
  }

  return {
    playwright: {
      command: options.playwrightExecutablePath,
      args: ['--output-dir', options.playwrightOutputDir],
      ...(options.playwrightSession ? { env: { PLAYWRIGHT_SESSION: options.playwrightSession } } : {}),
      timeout: 120000,
    },
  };
}

/** Build the KiroAgentJson object from agent parameters. */
function buildAgentJsonObject(
  agentName: string,
  promptFilename: string,
  modelTier: ModelTier,
  options?: AgentJsonOptions,
): KiroAgentJson {
  const mcpServers = buildMcpServers(options);

  return {
    name: agentName,
    ...(options?.description ? { description: options.description } : {}),
    prompt: `file://${promptFilename}`,
    tools: ['*'],
    allowedTools: ['read', 'write', 'shell'],
    model: resolveKiroModel(modelTier),
    ...(mcpServers ? { mcpServers } : {}),
    ...(options?.hooks ? { hooks: options.hooks } : {}),
  };
}

/**
 * Generate a .kiro/agents/<name>.json file and the corresponding prompt file.
 *
 * Writes the interpolated prompt to .kiro/agents/<name>-prompt.txt,
 * then builds and writes the agent JSON definition.
 *
 * Retries with exponential backoff on filesystem errors.
 */
export async function generateAgentJson(
  sourceDir: string,
  agentName: string,
  prompt: string,
  modelTier: ModelTier,
  options?: AgentJsonOptions,
): Promise<void> {
  const agentsDir = join(sourceDir, '.kiro', 'agents');
  const promptFilename = `${agentName}-prompt.txt`;
  const promptPath = join(agentsDir, promptFilename);
  const jsonPath = join(agentsDir, `${agentName}.json`);

  const maxRetries = 5;
  const baseDelayMs = 1000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await mkdir(agentsDir, { recursive: true });
      await writeFile(promptPath, prompt, 'utf8');

      const agentJson = buildAgentJsonObject(agentName, promptFilename, modelTier, options);
      await writeFile(jsonPath, JSON.stringify(agentJson, null, 2), 'utf8');
      return;
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      const delay = baseDelayMs * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// === Structured Output Helpers ===

/**
 * Augment a prompt with structured output instructions for vuln agents.
 *
 * When an agent has a JsonSchemaOutputFormat, appends instructions telling
 * the agent to write the queue JSON file directly to disk using fs_write.
 */
export function augmentPromptForStructuredOutput(
  prompt: string,
  queueFilename: string,
  deliverablesPath: string,
  jsonSchema: Record<string, unknown>,
): string {
  const schemaStr = JSON.stringify(jsonSchema, null, 2);
  const instructions = [
    '',
    '## STRUCTURED OUTPUT INSTRUCTIONS',
    '',
    `You MUST write your structured output as a JSON file to: ${deliverablesPath}/${queueFilename}`,
    'Use the fs_write tool to write the file.',
    '',
    'The JSON MUST conform to this schema:',
    '```json',
    schemaStr,
    '```',
    '',
    `The file MUST be named exactly: ${queueFilename}`,
    `The file MUST be written to: ${deliverablesPath}/`,
    '',
  ].join('\n');

  return prompt + instructions;
}

/**
 * Generate validation hooks for vuln agents that produce structured queue output.
 *
 * Creates:
 * - preToolUse hook on 'write' that validates *_queue.json against schema
 * - stop hook that verifies the queue file exists after execution
 *
 * Also writes the validation scripts alongside the agent JSON.
 */
export async function generateQueueValidationHooks(
  sourceDir: string,
  queueFilename: string,
  deliverablesPath: string,
  jsonSchema: Record<string, unknown>,
): Promise<KiroAgentHooks> {
  const agentsDir = join(sourceDir, '.kiro', 'agents');
  await mkdir(agentsDir, { recursive: true });

  const validateScript = generateValidateQueueScript(queueFilename, jsonSchema);
  await writeFile(join(agentsDir, 'validate-queue-json.js'), validateScript, 'utf8');

  const verifyScript = generateVerifyQueueScript(queueFilename, deliverablesPath);
  await writeFile(join(agentsDir, 'verify-queue-file.js'), verifyScript, 'utf8');

  return {
    preToolUse: [
      {
        matcher: 'write',
        command: `node ${join(agentsDir, 'validate-queue-json.js')}`,
        timeout_ms: 30000,
      },
    ],
    stop: [
      {
        command: `node ${join(agentsDir, 'verify-queue-file.js')}`,
        timeout_ms: 30000,
      },
    ],
  };
}

function generateValidateQueueScript(queueFilename: string, jsonSchema: Record<string, unknown>): string {
  return [
    '// Auto-generated queue JSON validation script',
    `const QUEUE_FILENAME = ${JSON.stringify(queueFilename)};`,
    `const SCHEMA = ${JSON.stringify(jsonSchema)};`,
    '',
    'process.stdin.setEncoding("utf8");',
    'let input = "";',
    'process.stdin.on("data", (chunk) => { input += chunk; });',
    'process.stdin.on("end", () => {',
    '  try {',
    '    const event = JSON.parse(input);',
    '    const filePath = event?.tool_input?.path || "";',
    '    if (!filePath.endsWith(QUEUE_FILENAME)) { process.exit(0); }',
    '    const content = event?.tool_input?.content || "";',
    '    JSON.parse(content);',
    '    process.exit(0);',
    '  } catch (e) {',
    '    console.error("Queue JSON validation failed:", e.message);',
    '    process.exit(2);',
    '  }',
    '});',
    '',
  ].join('\n');
}

function generateVerifyQueueScript(queueFilename: string, deliverablesPath: string): string {
  return [
    '// Auto-generated queue file verification script',
    'const fs = require("fs");',
    'const path = require("path");',
    `const queuePath = path.join(${JSON.stringify(deliverablesPath)}, ${JSON.stringify(queueFilename)});`,
    'try {',
    '  const content = fs.readFileSync(queuePath, "utf8");',
    '  JSON.parse(content);',
    '  process.exit(0);',
    '} catch (e) {',
    '  console.error("Queue file verification failed:", e.message);',
    '  process.exit(1);',
    '}',
    '',
  ].join('\n');
}

/**
 * Read structured output from a queue file on disk after kiro-cli execution.
 *
 * Retries with exponential backoff if the file doesn't exist or JSON is invalid.
 * Returns undefined if still missing after all retries.
 */
export async function readStructuredOutputFromDisk(
  deliverablesPath: string,
  queueFilename: string,
  retryBaseDelayMs: number = 1000,
): Promise<unknown> {
  const queuePath = join(deliverablesPath, queueFilename);
  const maxRetries = 5;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const content = await fsReadFile(queuePath, 'utf8');
      return JSON.parse(content);
    } catch {
      if (attempt === maxRetries) {
        return undefined;
      }
      const delay = retryBaseDelayMs * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return undefined;
}

// === Error Classification ===

/**
 * Write a diagnostic error log file on kiro-cli failure.
 *
 * Writes `<agentName>-error.log` to `.shannon/agents/` in the source directory.
 * Non-fatal — filesystem errors are silently swallowed so the execution result
 * is never affected.
 */
export async function writeKiroErrorLog(
  agentName: string,
  exitCode: number | null,
  stderr: string,
  stdoutTail: string,
  duration: number,
  promptPath: string,
  sourceDir: string,
): Promise<void> {
  try {
    const logDir = join(sourceDir, '.shannon', 'agents');
    await mkdir(logDir, { recursive: true });
    const logPath = join(logDir, `${agentName}-error.log`);
    const content = [
      `Agent: ${agentName}`,
      `Exit code: ${exitCode}`,
      `Duration: ${duration}ms`,
      `Prompt: ${promptPath}`,
      `Stderr:\n${stderr.slice(0, 2000)}`,
      `Stdout (tail):\n${stdoutTail.slice(-500)}`,
    ].join('\n\n');
    await writeFile(logPath, content, 'utf8');
  } catch {
    // Non-fatal — don't affect execution result
  }
}

/**
 * Classify a kiro-cli execution error into a PentestError.
 *
 * Maps exit codes and stderr patterns to Shannon's error taxonomy
 * for compatibility with classifyErrorForTemporal.
 */
export function classifyKiroCliError(exitCode: number | null, stderr: string, timedOut: boolean): PentestError {
  if (timedOut) {
    return new PentestError('Kiro CLI execution timed out', 'network', true);
  }

  if (exitCode === 3) {
    return new PentestError(
      `Kiro CLI config/MCP failure: ${stderr.slice(0, 200)}`,
      'config',
      false,
      { exitCode, stderr: stderr.slice(0, 500) },
      ErrorCode.CONFIG_VALIDATION_FAILED,
    );
  }

  if (/authentication/i.test(stderr) || /invalid.*key/i.test(stderr) || /unauthorized/i.test(stderr)) {
    return new PentestError(
      `Kiro CLI authentication failed: ${stderr.slice(0, 200)}`,
      'config',
      false,
      { exitCode, stderr: stderr.slice(0, 500) },
      ErrorCode.AUTH_FAILED,
    );
  }

  const lowerStderr = stderr.toLowerCase();
  if (matchesBillingTextPattern(lowerStderr) || matchesBillingApiPattern(lowerStderr)) {
    return new PentestError(
      `Kiro CLI billing/rate-limit error: ${stderr.slice(0, 200)}`,
      'billing',
      true,
      { exitCode, stderr: stderr.slice(0, 500) },
      ErrorCode.BILLING_ERROR,
    );
  }

  return new PentestError(
    `Kiro CLI execution failed: ${stderr.slice(0, 200)}`,
    'validation',
    true,
    { exitCode, stderr: stderr.slice(0, 500) },
    ErrorCode.AGENT_EXECUTION_FAILED,
  );
}

// === Subprocess Spawning ===

/** Spawn kiro-cli and capture output with timeout enforcement. */
function spawnKiroCli(
  args: string[],
  cwd: string,
  env: Record<string, string>,
  timeoutMs: number,
): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (result: { exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      clearTimeout(sigkillTimer);
      resolve(result);
    };

    const child = spawn('kiro-cli', args, { cwd, env, stdio: 'pipe' });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let sigkillTimer: ReturnType<typeof setTimeout>;

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // Handle spawn errors (binary not found, permission denied, etc.)
    child.on('error', (err) => {
      finish({
        exitCode: null,
        stdout,
        stderr: stderr || `Failed to spawn kiro-cli: ${err.message}`,
        timedOut: false,
      });
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      // Escalate to SIGKILL if SIGTERM doesn't work within 10s
      sigkillTimer = setTimeout(() => {
        child.kill('SIGKILL');
      }, 10_000);
    }, timeoutMs);

    child.on('close', (code) => {
      finish({ exitCode: code, stdout, stderr, timedOut });
    });
  });
}

// === Retryable Classification ===

/** Auth patterns in stderr -- non-retryable. */
const AUTH_PATTERNS = [/authentication/i, /invalid.*key/i, /unauthorized/i];

/**
 * Classify whether an exit code 1 error is retryable based on stderr content.
 * Auth errors are non-retryable; billing errors and unclassified errors are retryable.
 */
function classifyRetryable(stderr: string): boolean {
  if (AUTH_PATTERNS.some((pattern) => pattern.test(stderr))) return false;
  return true;
}

// === Exit Code to ClaudePromptResult Mapping ===

// === Cost Extraction ===

/** Pattern to extract credits used from kiro-cli output footer. */
const CREDITS_PATTERN = /^\s*Credits used:\s*([\d.]+)/im;

/**
 * Extract cost from kiro-cli "Credits used:" footer line.
 * Returns 0 if not found.
 */
export function extractCreditsUsed(stdout: string): number {
  const match = CREDITS_PATTERN.exec(stripAnsi(stdout));
  if (!match?.[1]) return 0;
  const credits = Number.parseFloat(match[1]);
  return Number.isNaN(credits) ? 0 : credits;
}

/** Pattern to extract turn/interaction/message count from kiro-cli output footer. */
const TURNS_PATTERN = /^\s*(?:Turns|Interactions|Messages):\s*(\d+)/im;

/**
 * Extract turn count from kiro-cli stdout footer.
 *
 * Looks for patterns like "Turns: 5", "Interactions: 12", or "Messages: 3"
 * in the ANSI-stripped output. Returns `undefined` when not parseable (no regression).
 */
export function extractTurns(stdout: string): number | undefined {
  const match = TURNS_PATTERN.exec(stripAnsi(stdout));
  return match?.[1] ? Number.parseInt(match[1], 10) : undefined;
}

/**
 * Map kiro-cli exit code, stdout, stderr, and timing to a ClaudePromptResult.
 *
 * - Exit 0: success with cleaned stdout as result
 * - Exit 1: failure with stderr as error, retryable based on stderr classification
 * - Exit 3: non-retryable MCP startup failure
 * - Timeout: retryable timeout error
 */
export function mapExitCodeToResult(
  exitCode: number | null,
  stdout: string,
  stderr: string,
  duration: number,
  model: string,
  timedOut: boolean,
): ClaudePromptResult {
  if (timedOut) {
    return {
      success: false,
      duration,
      cost: 0,
      partialCost: 0,
      error: 'Kiro CLI execution timed out',
      errorType: 'KiroCliError',
      retryable: true,
    };
  }

  if (exitCode === 0) {
    const cost = extractCreditsUsed(stdout);
    const cleaned = stripMetadataLines(stripAnsi(stdout));
    return {
      success: true,
      result: cleaned,
      duration,
      cost,
      partialCost: cost,
      model,
      turns: extractTurns(stdout),
    };
  }

  if (exitCode === 3) {
    return {
      success: false,
      duration,
      cost: 0,
      partialCost: 0,
      error: stderr,
      errorType: 'KiroCliError',
      retryable: false,
    };
  }

  return {
    success: false,
    duration,
    cost: 0,
    partialCost: 0,
    error: stderr,
    errorType: 'KiroCliError',
    retryable: classifyRetryable(stderr),
  };
}

// === Environment Construction ===

/** Environment variables that must NEVER be forwarded to kiro-cli. */
export const EXCLUDED_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
] as const;

/**
 * Build a curated environment for the kiro-cli subprocess.
 *
 * Includes required variables (KIRO_API_KEY, KIRO_LOG_NO_COLOR, HOME, PATH)
 * and conditionally includes SHANNON_DELIVERABLES_SUBDIR and Playwright vars.
 * Explicitly excludes Claude SDK-specific credentials.
 */
export function buildSubprocessEnv(
  kiroApiKey: string,
  options?: { deliverablesSubdir?: string; playwrightOutputDir?: string },
): Record<string, string> {
  const env: Record<string, string> = {
    KIRO_API_KEY: kiroApiKey,
    KIRO_LOG_NO_COLOR: '1',
  };

  if (process.env.HOME) env.HOME = process.env.HOME;
  if (process.env.PATH) env.PATH = process.env.PATH;

  // Pass through proxy and SSL vars so kiro-cli can reach the API
  const passthroughVars = [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'NO_PROXY',
    'http_proxy',
    'https_proxy',
    'no_proxy',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
    'NODE_EXTRA_CA_CERTS',
    'LANG',
    'LC_ALL',
    'TERM',
    'TMPDIR',
  ];
  for (const name of passthroughVars) {
    const val = process.env[name];
    if (val) env[name] = val;
  }

  if (options?.deliverablesSubdir) {
    env.SHANNON_DELIVERABLES_SUBDIR = options.deliverablesSubdir;
  }
  if (options?.playwrightOutputDir) {
    env.PLAYWRIGHT_MCP_OUTPUT_DIR = options.playwrightOutputDir;
  }
  if (process.env.PLAYWRIGHT_MCP_EXECUTABLE_PATH) {
    env.PLAYWRIGHT_MCP_EXECUTABLE_PATH = process.env.PLAYWRIGHT_MCP_EXECUTABLE_PATH;
  }

  for (const key of EXCLUDED_ENV_VARS) {
    delete env[key];
  }

  return env;
}

// === Playwright Skill Installation ===

/** Known locations where the Playwright skill may be installed in the container. */
const PLAYWRIGHT_SKILL_SOURCES = ['/tmp/.claude/skills/playwright-cli', '/tmp/.kiro/skills/playwright-cli'];

/**
 * Install the Playwright skill into the kiro-cli working directory.
 *
 * Copies the skill from the container's pre-installed location
 * (set up by `playwright-cli install --skills` in the Dockerfile)
 * into `<sourceDir>/.kiro/skills/playwright-cli/` so kiro-cli
 * discovers it automatically.
 *
 * Also writes a `.kiro/settings/playwright.json` with the session
 * ID so the skill uses the correct browser isolation session.
 *
 * Non-fatal — logs a warning and continues if the skill source is missing.
 */
async function installPlaywrightSkill(
  sourceDir: string,
  session: string | undefined,
  logger: ActivityLogger,
): Promise<void> {
  try {
    const destDir = join(sourceDir, '.kiro', 'skills', 'playwright-cli');

    // Find the first available skill source
    let skillSource: string | undefined;
    for (const src of PLAYWRIGHT_SKILL_SOURCES) {
      try {
        await fsReadFile(join(src, 'SKILL.md'), 'utf8');
        skillSource = src;
        break;
      } catch {
        // Try next source
      }
    }

    if (!skillSource) {
      logger.warn('[kiro-cli] Playwright skill not found in container — browser tools unavailable');
      return;
    }

    await mkdir(join(destDir, '..'), { recursive: true });
    execSync(`cp -r "${skillSource}" "${destDir}"`);

    // Write session config so playwright-cli uses the correct browser session
    if (session) {
      const settingsDir = join(sourceDir, '.kiro', 'settings');
      await mkdir(settingsDir, { recursive: true });
      await writeFile(join(settingsDir, 'playwright.json'), JSON.stringify({ session }, null, 2), 'utf8');
    }

    logger.info(`[kiro-cli] Installed Playwright skill for ${session ?? 'default'} session`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`[kiro-cli] Failed to install Playwright skill: ${msg}`);
  }
}

// === Queue Hook Options ===

/**
 * Build AgentJsonOptions with queue validation hooks for vuln agents.
 *
 * When the executor options include an outputFormat with a JSON schema,
 * a queueFilename, and a deliverablesSubdir, generates preToolUse and stop
 * hooks that validate queue JSON at write time and verify the file exists.
 *
 * Returns `undefined` for non-vuln agents or when required fields are missing.
 * Non-fatal — returns `undefined` on hook generation failure.
 */
async function buildQueueHookOptions(
  sourceDir: string,
  options?: ExecutorOptions,
): Promise<AgentJsonOptions | undefined> {
  if (!options?.outputFormat || !options?.queueFilename || !options?.deliverablesSubdir) {
    return undefined;
  }

  const outputFmt = options.outputFormat as { schema?: Record<string, unknown> };
  if (!outputFmt.schema) {
    return undefined;
  }

  try {
    const hooks = await generateQueueValidationHooks(
      sourceDir,
      options.queueFilename,
      options.deliverablesSubdir,
      outputFmt.schema,
    );
    return { hooks };
  } catch {
    // Non-fatal — proceed without hooks
    return undefined;
  }
}

// === KiroCliExecutor Class ===

export class KiroCliExecutor implements Executor {
  private readonly defaultTimeoutMs: number;
  private readonly requireMcpStartup: boolean;

  constructor(options?: { timeoutMs?: number; requireMcpStartup?: boolean }) {
    this.defaultTimeoutMs = options?.timeoutMs ?? 7_200_000;
    this.requireMcpStartup = options?.requireMcpStartup ?? false;
  }

  async execute(
    prompt: string,
    sourceDir: string,
    agentName: string,
    modelTier: ModelTier,
    logger: ActivityLogger,
    options?: ExecutorOptions,
  ): Promise<ClaudePromptResult> {
    const startTime = Date.now();

    // 1. Validate KIRO_API_KEY is present
    const kiroApiKey = process.env.KIRO_API_KEY;
    if (!kiroApiKey) {
      return {
        success: false,
        duration: Date.now() - startTime,
        cost: 0,
        error: 'KIRO_API_KEY environment variable is not set',
        errorType: 'config',
        retryable: false,
      };
    }

    // 2. Build agent JSON options (queue hooks only — Playwright uses skills, not MCP)
    const queueHookOptions = await buildQueueHookOptions(sourceDir, options);
    const agentJsonOptions: AgentJsonOptions | undefined = queueHookOptions ?? undefined;

    // 2a. Install Playwright skill for kiro-cli (copies from Claude Code skill location)
    if (options?.playwrightExecutablePath) {
      await installPlaywrightSkill(sourceDir, options.playwrightSession, logger);
    }

    // 3. Generate agent JSON in sourceDir/.kiro/agents/
    try {
      await generateAgentJson(sourceDir, agentName, prompt, modelTier, agentJsonOptions);
      logger.info(`Generated agent JSON for ${agentName}`, { modelTier });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        duration: Date.now() - startTime,
        cost: 0,
        error: `Failed to generate agent JSON: ${errorMessage}`,
        errorType: 'config',
        retryable: false,
      };
    }

    // 4. Build subprocess args — prompt is already in the agent JSON (file:// reference),
    // so the CLI input is just a short trigger. Passing the full prompt as a positional
    // arg can exceed OS arg length limits and corrupt argument parsing.
    const args = ['chat', '--no-interactive', '--agent', agentName, '--wrap', 'never', '--trust-all-tools', 'begin'];
    if (this.requireMcpStartup) {
      args.push('--require-mcp-startup');
    }

    // 5. Build curated environment
    const env = buildSubprocessEnv(kiroApiKey, {
      ...(options?.deliverablesSubdir ? { deliverablesSubdir: options.deliverablesSubdir } : {}),
    });

    // 6. Audit: log execution start
    logger.info(`[kiro-cli] Starting agent ${agentName}`, {
      executor: 'kiro-cli',
      agent: agentName,
      modelTier,
      cwd: sourceDir,
    });
    // 7. Spawn subprocess with heartbeat
    const heartbeatInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      logger.info(`[${elapsed}s] Agent ${agentName} running...`);
    }, 30_000);

    const spawnResult = await spawnKiroCli(args, sourceDir, env, this.defaultTimeoutMs);
    clearInterval(heartbeatInterval);

    // 8. Map exit code to result
    const duration = Date.now() - startTime;
    const agentModel = resolveKiroModel(modelTier);
    const result = mapExitCodeToResult(
      spawnResult.exitCode,
      spawnResult.stdout,
      spawnResult.stderr,
      duration,
      agentModel,
      spawnResult.timedOut,
    );

    // 9. API error detection on exit 0
    if (result.success && spawnResult.stderr) {
      const hasApiErrors = /dispatch failure|error sending request|connection refused/i.test(spawnResult.stderr);
      if (hasApiErrors) {
        result.apiErrorDetected = true;
        logger.warn(`[kiro-cli] API errors detected in stderr for ${agentName}, will validate deliverables`);
      }
    }

    // 10. Check for spending cap in successful output
    if (result.success && result.result && matchesBillingTextPattern(result.result)) {
      return {
        success: false,
        duration,
        cost: 0,
        error: `Spending cap detected in kiro-cli output: ${result.result.slice(0, 100)}`,
        errorType: 'KiroCliError',
        retryable: true,
      };
    }

    // 11. Audit: log execution result
    if (result.success) {
      logger.info(`[kiro-cli] Agent ${agentName} completed successfully`, {
        executor: 'kiro-cli',
        agent: agentName,
        success: true,
        duration,
        cost: result.cost,
      });
    } else {
      logger.error(`[kiro-cli] Agent ${agentName} failed`, {
        executor: 'kiro-cli',
        agent: agentName,
        success: false,
        duration,
        cost: result.cost,
        error: result.error?.slice(0, 500),
        retryable: result.retryable,
      });
    }

    // 12. Write error log file on failure
    if (!result.success) {
      const promptPath = join(sourceDir, '.kiro', 'agents', `${agentName}-prompt.txt`);
      await writeKiroErrorLog(
        agentName,
        spawnResult.exitCode,
        spawnResult.stderr,
        spawnResult.stdout,
        duration,
        promptPath,
        sourceDir,
      );
    }

    return result;
  }
}
