// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import chalk from 'chalk';
import { fs, path } from 'zx';
import type {
  PentestErrorType,
  PentestErrorContext,
  LogEntry,
  ToolErrorResult,
  PromptErrorResult,
} from './types/errors.js';

// Custom error class for pentest operations
export class PentestError extends Error {
  name = 'PentestError' as const;
  type: PentestErrorType;
  retryable: boolean;
  context: PentestErrorContext;
  timestamp: string;

  constructor(
    message: string,
    type: PentestErrorType,
    retryable: boolean = false,
    context: PentestErrorContext = {}
  ) {
    super(message);
    this.type = type;
    this.retryable = retryable;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}

// Centralized error logging function
export async function logError(
  error: Error & { type?: PentestErrorType; retryable?: boolean; context?: PentestErrorContext },
  contextMsg: string,
  sourceDir: string | null = null
): Promise<LogEntry> {
  const timestamp = new Date().toISOString();
  const logEntry: LogEntry = {
    timestamp,
    context: contextMsg,
    error: {
      name: error.name || error.constructor.name,
      message: error.message,
      type: error.type || 'unknown',
      retryable: error.retryable || false,
    },
  };
  // Only add stack if it exists
  if (error.stack) {
    logEntry.error.stack = error.stack;
  }

  // Console logging with color
  const prefix = error.retryable ? '⚠️' : '❌';
  const color = error.retryable ? chalk.yellow : chalk.red;
  console.log(color(`${prefix} ${contextMsg}:`));
  console.log(color(`   ${error.message}`));

  if (error.context && Object.keys(error.context).length > 0) {
    console.log(chalk.gray(`   Context: ${JSON.stringify(error.context)}`));
  }

  // File logging (if source directory available)
  if (sourceDir) {
    try {
      const logPath = path.join(sourceDir, 'error.log');
      await fs.appendFile(logPath, JSON.stringify(logEntry) + '\n');
    } catch (logErr) {
      const errMsg = logErr instanceof Error ? logErr.message : String(logErr);
      console.log(chalk.gray(`   (Failed to write error log: ${errMsg})`));
    }
  }

  return logEntry;
}

// Handle tool execution errors
export function handleToolError(
  toolName: string,
  error: Error & { code?: string }
): ToolErrorResult {
  const isRetryable =
    error.code === 'ECONNRESET' ||
    error.code === 'ETIMEDOUT' ||
    error.code === 'ENOTFOUND';

  return {
    tool: toolName,
    output: `Error: ${error.message}`,
    status: 'error',
    duration: 0,
    success: false,
    error: new PentestError(
      `${toolName} execution failed: ${error.message}`,
      'tool',
      isRetryable,
      { toolName, originalError: error.message, errorCode: error.code }
    ),
  };
}

// Handle prompt loading errors
export function handlePromptError(
  promptName: string,
  error: Error
): PromptErrorResult {
  return {
    success: false,
    error: new PentestError(
      `Failed to load prompt '${promptName}': ${error.message}`,
      'prompt',
      false,
      { promptName, originalError: error.message }
    ),
  };
}

// Patterns that indicate retryable errors
const RETRYABLE_PATTERNS = [
  // Network and connection errors
  'network',
  'connection',
  'timeout',
  'econnreset',
  'enotfound',
  'econnrefused',
  // Rate limiting
  'rate limit',
  '429',
  'too many requests',
  // Server errors
  'server error',
  '5xx',
  'internal server error',
  'service unavailable',
  'bad gateway',
  // Claude API errors
  'mcp server',
  'model unavailable',
  'service temporarily unavailable',
  'api error',
  'terminated',
  // Max turns
  'max turns',
  'maximum turns',
];

// Patterns that indicate non-retryable errors (checked before default)
const NON_RETRYABLE_PATTERNS = [
  'authentication',
  'invalid prompt',
  'out of memory',
  'permission denied',
  'session limit reached',
  'invalid api key',
];

// Conservative retry classification - unknown errors don't retry (fail-safe default)
export function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Check for explicit non-retryable patterns first
  if (NON_RETRYABLE_PATTERNS.some((pattern) => message.includes(pattern))) {
    return false;
  }

  // Check for retryable patterns
  return RETRYABLE_PATTERNS.some((pattern) => message.includes(pattern));
}

// Rate limit errors get longer base delay (30s) vs standard exponential backoff (2s)
export function getRetryDelay(error: Error, attempt: number): number {
  const message = error.message.toLowerCase();

  // Rate limiting gets longer delays
  if (message.includes('rate limit') || message.includes('429')) {
    return Math.min(30000 + attempt * 10000, 120000); // 30s, 40s, 50s, max 2min
  }

  // Exponential backoff with jitter for other retryable errors
  const baseDelay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
  const jitter = Math.random() * 1000; // 0-1s random
  return Math.min(baseDelay + jitter, 30000); // Max 30s
}
