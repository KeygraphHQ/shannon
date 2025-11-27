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
import { generateLogPath, generatePromptPath, atomicWrite, formatTimestamp } from './utils.js';

/**
 * AgentLogger - Manages append-only logging for a single agent execution
 */
export class AgentLogger {
  /**
   * @param {Object} sessionMetadata - Session metadata
   * @param {string} agentName - Name of the agent
   * @param {number} attemptNumber - Attempt number (1, 2, 3, ...)
   */
  constructor(sessionMetadata, agentName, attemptNumber) {
    this.sessionMetadata = sessionMetadata;
    this.agentName = agentName;
    this.attemptNumber = attemptNumber;
    this.timestamp = Date.now();

    // Generate log file path
    this.logPath = generateLogPath(sessionMetadata, agentName, this.timestamp, attemptNumber);

    // Create write stream (append mode)
    this.stream = null;
    this.isOpen = false;
  }

  /**
   * Initialize the log stream (creates file and opens stream)
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isOpen) {
      return; // Already initialized
    }

    // Create write stream with append mode and auto-flush
    this.stream = fs.createWriteStream(this.logPath, {
      flags: 'a', // Append mode
      encoding: 'utf8',
      autoClose: true
    });

    this.isOpen = true;

    // Write header
    await this.writeHeader();
  }

  /**
   * Write header to log file
   * @private
   * @returns {Promise<void>}
   */
  async writeHeader() {
    const header = [
      `========================================`,
      `Agent: ${this.agentName}`,
      `Attempt: ${this.attemptNumber}`,
      `Started: ${formatTimestamp(this.timestamp)}`,
      `Session: ${this.sessionMetadata.id}`,
      `Web URL: ${this.sessionMetadata.webUrl}`,
      `========================================\n`
    ].join('\n');

    return this.writeRaw(header);
  }

  /**
   * Write raw text to log file with immediate flush
   * @private
   * @param {string} text - Text to write
   * @returns {Promise<void>}
   */
  writeRaw(text) {
    return new Promise((resolve, reject) => {
      if (!this.isOpen || !this.stream) {
        reject(new Error('Logger not initialized'));
        return;
      }

      // Write and flush immediately (crash-safe)
      const needsDrain = !this.stream.write(text, 'utf8', (error) => {
        if (error) {
          reject(error);
        }
      });

      if (needsDrain) {
        // Buffer is full, wait for drain
        const drainHandler = () => {
          this.stream.removeListener('drain', drainHandler);
          resolve();
        };
        this.stream.once('drain', drainHandler);
      } else {
        // Buffer has space, resolve immediately
        resolve();
      }
    });
  }

  /**
   * Log an event (tool_start, tool_end, llm_response, etc.)
   * Events are logged as JSON for parseability
   * @param {string} eventType - Type of event
   * @param {Object} eventData - Event data
   * @returns {Promise<void>}
   */
  async logEvent(eventType, eventData) {
    const event = {
      type: eventType,
      timestamp: formatTimestamp(),
      data: eventData
    };

    const eventLine = `${JSON.stringify(event)}\n`;
    return this.writeRaw(eventLine);
  }

  /**
   * Close the log stream
   * @returns {Promise<void>}
   */
  async close() {
    if (!this.isOpen || !this.stream) {
      return;
    }

    return new Promise((resolve) => {
      this.stream.end(() => {
        this.isOpen = false;
        resolve();
      });
    });
  }

  /**
   * Save prompt snapshot to prompts directory
   * Static method - doesn't require logger instance
   * @param {Object} sessionMetadata - Session metadata
   * @param {string} agentName - Agent name
   * @param {string} promptContent - Full prompt content
   * @returns {Promise<void>}
   */
  static async savePrompt(sessionMetadata, agentName, promptContent) {
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
      ``
    ].join('\n');

    const fullContent = header + promptContent;

    // Use atomic write for safety
    await atomicWrite(promptPath, fullContent);
  }
}
