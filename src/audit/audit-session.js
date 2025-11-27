// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Audit Session - Main Facade
 *
 * Coordinates logger, metrics tracker, and concurrency control for comprehensive
 * crash-safe audit logging.
 */

import { AgentLogger } from './logger.js';
import { MetricsTracker } from './metrics-tracker.js';
import { initializeAuditStructure, formatTimestamp } from './utils.js';
import { SessionMutex } from '../utils/concurrency.js';

// Global mutex instance
const sessionMutex = new SessionMutex();

/**
 * AuditSession - Main audit system facade
 */
export class AuditSession {
  /**
   * @param {Object} sessionMetadata - Session metadata from Shannon store
   * @param {string} sessionMetadata.id - Session UUID
   * @param {string} sessionMetadata.webUrl - Target web URL
   * @param {string} [sessionMetadata.repoPath] - Target repository path
   */
  constructor(sessionMetadata) {
    this.sessionMetadata = sessionMetadata;
    this.sessionId = sessionMetadata.id;

    // Validate required fields
    if (!this.sessionId) {
      throw new Error('sessionMetadata.id is required');
    }
    if (!this.sessionMetadata.webUrl) {
      throw new Error('sessionMetadata.webUrl is required');
    }

    // Components
    this.metricsTracker = new MetricsTracker(sessionMetadata);

    // Active logger (one at a time per agent attempt)
    this.currentLogger = null;

    // Initialization flag
    this.initialized = false;
  }

  /**
   * Initialize audit session (creates directories, session.json)
   * Idempotent and race-safe
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return; // Already initialized
    }

    // Create directory structure
    await initializeAuditStructure(this.sessionMetadata);

    // Initialize metrics tracker (loads or creates session.json)
    await this.metricsTracker.initialize();

    this.initialized = true;
  }

  /**
   * Ensure initialized (helper for lazy initialization)
   * @private
   * @returns {Promise<void>}
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Start agent execution
   * @param {string} agentName - Agent name
   * @param {string} promptContent - Full prompt content
   * @param {number} [attemptNumber=1] - Attempt number
   * @returns {Promise<void>}
   */
  async startAgent(agentName, promptContent, attemptNumber = 1) {
    await this.ensureInitialized();

    // Save prompt snapshot (only on first attempt)
    if (attemptNumber === 1) {
      await AgentLogger.savePrompt(this.sessionMetadata, agentName, promptContent);
    }

    // Create and initialize logger for this attempt
    this.currentLogger = new AgentLogger(this.sessionMetadata, agentName, attemptNumber);
    await this.currentLogger.initialize();

    // Start metrics tracking
    this.metricsTracker.startAgent(agentName, attemptNumber);

    // Log start event
    await this.currentLogger.logEvent('agent_start', {
      agentName,
      attemptNumber,
      timestamp: formatTimestamp()
    });
  }

  /**
   * Log event during agent execution
   * @param {string} eventType - Event type (tool_start, tool_end, llm_response, etc.)
   * @param {Object} eventData - Event data
   * @returns {Promise<void>}
   */
  async logEvent(eventType, eventData) {
    if (!this.currentLogger) {
      throw new Error('No active logger. Call startAgent() first.');
    }

    await this.currentLogger.logEvent(eventType, eventData);
  }

  /**
   * End agent execution (mutex-protected)
   * @param {string} agentName - Agent name
   * @param {Object} result - Execution result
   * @param {number} result.attemptNumber - Attempt number
   * @param {number} result.duration_ms - Duration in milliseconds
   * @param {number} result.cost_usd - Cost in USD
   * @param {boolean} result.success - Whether attempt succeeded
   * @param {string} [result.error] - Error message (if failed)
   * @param {string} [result.checkpoint] - Git checkpoint hash (if succeeded)
   * @param {boolean} [result.isFinalAttempt=false] - Whether this is the final attempt
   * @returns {Promise<void>}
   */
  async endAgent(agentName, result) {
    // Log end event
    if (this.currentLogger) {
      await this.currentLogger.logEvent('agent_end', {
        agentName,
        success: result.success,
        duration_ms: result.duration_ms,
        cost_usd: result.cost_usd,
        timestamp: formatTimestamp()
      });

      // Close logger
      await this.currentLogger.close();
      this.currentLogger = null;
    }

    // Mutex-protected update to session.json
    const unlock = await sessionMutex.lock(this.sessionId);
    try {
      // Reload metrics (in case of parallel updates)
      await this.metricsTracker.reload();

      // Update metrics
      await this.metricsTracker.endAgent(agentName, result);
    } finally {
      unlock();
    }
  }

  /**
   * Mark multiple agents as rolled back
   * @param {string[]} agentNames - Array of agent names
   * @returns {Promise<void>}
   */
  async markMultipleRolledBack(agentNames) {
    await this.ensureInitialized();

    const unlock = await sessionMutex.lock(this.sessionId);
    try {
      await this.metricsTracker.reload();
      await this.metricsTracker.markMultipleRolledBack(agentNames);
    } finally {
      unlock();
    }
  }

  /**
   * Update session status
   * @param {string} status - New status (in-progress, completed, failed)
   * @returns {Promise<void>}
   */
  async updateSessionStatus(status) {
    await this.ensureInitialized();

    const unlock = await sessionMutex.lock(this.sessionId);
    try {
      await this.metricsTracker.reload();
      await this.metricsTracker.updateSessionStatus(status);
    } finally {
      unlock();
    }
  }

  /**
   * Get current metrics (read-only)
   * @returns {Promise<Object>} Current metrics
   */
  async getMetrics() {
    await this.ensureInitialized();
    return this.metricsTracker.getMetrics();
  }
}
