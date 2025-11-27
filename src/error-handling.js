// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import chalk from 'chalk';
import { fs, path } from 'zx';

// Custom error class for pentest operations
export class PentestError extends Error {
  constructor(message, type, retryable = false, context = {}) {
    super(message);
    this.name = 'PentestError';
    this.type = type; // 'config', 'network', 'tool', 'prompt', 'filesystem', 'validation'
    this.retryable = retryable;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}

// Centralized error logging function
export const logError = async (error, contextMsg, sourceDir = null) => {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    context: contextMsg,
    error: {
      name: error.name || error.constructor.name,
      message: error.message,
      type: error.type || 'unknown',
      retryable: error.retryable || false,
      stack: error.stack
    }
  };
  
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
      console.log(chalk.gray(`   (Failed to write error log: ${logErr.message})`));
    }
  }
  
  return logEntry;
};

// Handle tool execution errors
export const handleToolError = (toolName, error) => {
  const isRetryable = error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND';
  
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
    )
  };
};

// Handle prompt loading errors
export const handlePromptError = (promptName, error) => {
  return {
    success: false,
    error: new PentestError(
      `Failed to load prompt '${promptName}': ${error.message}`,
      'prompt',
      false,
      { promptName, originalError: error.message }
    )
  };
};


// Check if an error should trigger a retry for Claude agents
export const isRetryableError = (error) => {
  const message = error.message.toLowerCase();
  
  // Network and connection errors - always retryable
  if (message.includes('network') || 
      message.includes('connection') || 
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('enotfound') ||
      message.includes('econnrefused')) {
    return true;
  }
  
  // Rate limiting - retryable with longer backoff
  if (message.includes('rate limit') || 
      message.includes('429') ||
      message.includes('too many requests')) {
    return true;
  }
  
  // Server errors - retryable
  if (message.includes('server error') ||
      message.includes('5xx') ||
      message.includes('internal server error') ||
      message.includes('service unavailable') ||
      message.includes('bad gateway')) {
    return true;
  }
  
  // Claude API specific errors - retryable
  if (message.includes('mcp server') ||
      message.includes('model unavailable') ||
      message.includes('service temporarily unavailable') ||
      message.includes('api error') ||
      message.includes('terminated')) {
    return true;
  }
  
  // Max turns without completion - retryable once
  if (message.includes('max turns') || 
      message.includes('maximum turns')) {
    return true;
  }
  
  // Non-retryable errors
  if (message.includes('authentication') ||
      message.includes('invalid prompt') ||
      message.includes('out of memory') ||
      message.includes('permission denied') ||
      message.includes('session limit reached') ||
      message.includes('invalid api key')) {
    return false;
  }
  
  // Default to non-retryable for unknown errors
  return false;
};

// Get retry delay based on error type and attempt number
export const getRetryDelay = (error, attempt) => {
  const message = error.message.toLowerCase();
  
  // Rate limiting gets longer delays
  if (message.includes('rate limit') || message.includes('429')) {
    return Math.min(30000 + (attempt * 10000), 120000); // 30s, 40s, 50s, max 2min
  }
  
  // Exponential backoff with jitter for other retryable errors
  const baseDelay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
  const jitter = Math.random() * 1000; // 0-1s random
  return Math.min(baseDelay + jitter, 30000); // Max 30s
};