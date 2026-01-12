// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Append-Only Agent Logger
 *
 * Provides crash-safe, append-only logging for agent execution.
 * Uses file streams with immediate flush to prevent data loss.
 */

import fs from 'fs';
import {
  generateLogPath,
  generatePromptPath,
  type SessionMetadata,
} from './utils.js';
import { atomicWrite } from '../utils/file-io.js';
import { formatTimestamp } from '../utils/formatting.js';

interface LogEvent {
  type: string;
  timestamp: string;
  data: unknown;
}

/**
 * AgentLogger - Manages append-only logging for a single agent execution
 */
export class AgentLogger {
  private sessionMetadata: SessionMetadata;
  private agentName: string;
  private attemptNumber: number;
  private timestamp: number;
  private logPath: string;
  private stream: fs.WriteStream | null = null;
  private isOpen: boolean = false;

  constructor(sessionMetadata: SessionMetadata, agentName: string, attemptNumber: number) {
    this.sessionMetadata = sessionMetadata;
    this.agentName = agentName;
    this.attemptNumber = attemptNumber;
    this.timestamp = Date.now();

    // Generate log file path
    this.logPath = generateLogPath(sessionMetadata, agentName, this.timestamp, attemptNumber);
  }

  /**
   * Initialize the log stream (creates file and opens stream)
   */
  async initialize(): Promise<void> {
    if (this.isOpen) {
      return; // Already initialized
    }

    // Create write stream with append mode and auto-flush
    this.stream = fs.createWriteStream(this.logPath, {
      flags: 'a', // Append mode
      encoding: 'utf8',
      autoClose: true,
    });

    this.isOpen = true;

    // Write header
    await this.writeHeader();
  }

  /**
   * Write header to log file
   */
  private async writeHeader(): Promise<void> {
    const header = [
      `========================================`,
      `Agent: ${this.agentName}`,
      `Attempt: ${this.attemptNumber}`,
      `Started: ${formatTimestamp(this.timestamp)}`,
      `Session: ${this.sessionMetadata.id}`,
      `Web URL: ${this.sessionMetadata.webUrl}`,
      `========================================\n`,
    ].join('\n');

    return this.writeRaw(header);
  }

  /**
   * Write raw text to log file with immediate flush
   */
  private writeRaw(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.isOpen || !this.stream) {
        reject(new Error('Logger not initialized'));
        return;
      }

      const needsDrain = !this.stream.write(text, 'utf8', (error) => {
        if (error) reject(error);
      });

      if (needsDrain) {
        this.stream.once('drain', resolve);
      } else {
        resolve();
      }
    });
  }

  /**
   * Log an event (tool_start, tool_end, llm_response, etc.)
   * Events are logged as JSON for parseability
   */
  async logEvent(eventType: string, eventData: unknown): Promise<void> {
    const event: LogEvent = {
      type: eventType,
      timestamp: formatTimestamp(),
      data: eventData,
    };

    const eventLine = `${JSON.stringify(event)}\n`;
    return this.writeRaw(eventLine);
  }

  /**
   * Close the log stream
   */
  async close(): Promise<void> {
    if (!this.isOpen || !this.stream) {
      return;
    }

    return new Promise((resolve) => {
      this.stream!.end(() => {
        this.isOpen = false;
        resolve();
      });
    });
  }

  /**
   * Save prompt snapshot to prompts directory
   * Static method - doesn't require logger instance
   */
  static async savePrompt(
    sessionMetadata: SessionMetadata,
    agentName: string,
    promptContent: string
  ): Promise<void> {
    const promptPath = generatePromptPath(sessionMetadata, agentName);

    // Create header with metadata
    const header = [
      `# Prompt Snapshot: ${agentName}`,
      ``,
      `**Session:** ${sessionMetadata.id}`,
      `**Web URL:** ${sessionMetadata.webUrl}`,
      `**Saved:** ${formatTimestamp()}`,
      ``,
      `---`,
      ``,
    ].join('\n');

    const fullContent = header + promptContent;

    // Use atomic write for safety
    await atomicWrite(promptPath, fullContent);
  }
}
