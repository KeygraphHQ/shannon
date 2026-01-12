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
import { initializeAuditStructure, formatTimestamp, type SessionMetadata } from './utils.js';
import { SessionMutex } from '../utils/concurrency.js';

// Global mutex instance
const sessionMutex = new SessionMutex();

interface AgentEndResult {
  attemptNumber: number;
  duration_ms: number;
  cost_usd: number;
  success: boolean;
  error?: string;
  checkpoint?: string;
  isFinalAttempt?: boolean;
}

/**
 * AuditSession - Main audit system facade
 */
export class AuditSession {
  private sessionMetadata: SessionMetadata;
  private sessionId: string;
  private metricsTracker: MetricsTracker;
  private currentLogger: AgentLogger | null = null;
  private initialized: boolean = false;

  constructor(sessionMetadata: SessionMetadata) {
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
  }

  /**
   * Initialize audit session (creates directories, session.json)
   * Idempotent and race-safe
   */
  async initialize(): Promise<void> {
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
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Start agent execution
   */
  async startAgent(
    agentName: string,
    promptContent: string,
    attemptNumber: number = 1
  ): Promise<void> {
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
      timestamp: formatTimestamp(),
    });
  }

  /**
   * Log event during agent execution
   */
  async logEvent(eventType: string, eventData: unknown): Promise<void> {
    if (!this.currentLogger) {
      throw new Error('No active logger. Call startAgent() first.');
    }

    await this.currentLogger.logEvent(eventType, eventData);
  }

  /**
   * End agent execution (mutex-protected)
   */
  async endAgent(agentName: string, result: AgentEndResult): Promise<void> {
    // Log end event
    if (this.currentLogger) {
      await this.currentLogger.logEvent('agent_end', {
        agentName,
        success: result.success,
        duration_ms: result.duration_ms,
        cost_usd: result.cost_usd,
        timestamp: formatTimestamp(),
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
   * Update session status
   */
  async updateSessionStatus(status: 'in-progress' | 'completed' | 'failed'): Promise<void> {
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
   */
  async getMetrics(): Promise<unknown> {
    await this.ensureInitialized();
    return this.metricsTracker.getMetrics();
  }
}
