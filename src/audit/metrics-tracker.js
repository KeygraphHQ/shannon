// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Metrics Tracker
 *
 * Manages session.json with comprehensive timing, cost, and validation metrics.
 * Tracks attempt-level data for complete forensic trail.
 */

import {
  generateSessionJsonPath,
  atomicWrite,
  readJson,
  fileExists,
  formatTimestamp,
  calculatePercentage
} from './utils.js';

/**
 * MetricsTracker - Manages metrics for a session
 */
export class MetricsTracker {
  /**
   * @param {Object} sessionMetadata - Session metadata from Shannon store
   */
  constructor(sessionMetadata) {
    this.sessionMetadata = sessionMetadata;
    this.sessionJsonPath = generateSessionJsonPath(sessionMetadata);

    // In-memory state (loaded from/synced to session.json)
    this.data = null;

    // Active timers (agent name -> start time)
    this.activeTimers = new Map();
  }

  /**
   * Initialize session.json (idempotent)
   * @returns {Promise<void>}
   */
  async initialize() {
    // Check if session.json already exists
    const exists = await fileExists(this.sessionJsonPath);

    if (exists) {
      // Load existing data
      this.data = await readJson(this.sessionJsonPath);
    } else {
      // Create new session.json
      this.data = this.createInitialData();
      await this.save();
    }
  }

  /**
   * Create initial session.json structure
   * @private
   * @returns {Object} Initial session data
   */
  createInitialData() {
    return {
      session: {
        id: this.sessionMetadata.id,
        webUrl: this.sessionMetadata.webUrl,
        repoPath: this.sessionMetadata.repoPath,
        status: 'in-progress',
        createdAt: this.sessionMetadata.createdAt || formatTimestamp()
      },
      metrics: {
        total_duration_ms: 0,
        total_cost_usd: 0,
        phases: {},  // Phase-level aggregations: { duration_ms, duration_percentage, cost_usd, agent_count }
        agents: {}   // Agent-level metrics: { status, attempts[], final_duration_ms, total_cost_usd, checkpoint }
      }
    };
  }

  /**
   * Start tracking an agent execution
   * @param {string} agentName - Agent name
   * @param {number} attemptNumber - Attempt number
   * @returns {void}
   */
  startAgent(agentName, attemptNumber) {
    this.activeTimers.set(agentName, {
      startTime: Date.now(),
      attemptNumber
    });
  }

  /**
   * End agent execution and update metrics
   * @param {string} agentName - Agent name
   * @param {Object} result - Agent execution result
   * @param {number} result.attemptNumber - Attempt number
   * @param {number} result.duration_ms - Duration in milliseconds
   * @param {number} result.cost_usd - Cost in USD
   * @param {boolean} result.success - Whether attempt succeeded
   * @param {string} [result.error] - Error message (if failed)
   * @param {string} [result.checkpoint] - Git checkpoint hash (if succeeded)
   * @returns {Promise<void>}
   */
  async endAgent(agentName, result) {
    // Initialize agent metrics if not exists
    if (!this.data.metrics.agents[agentName]) {
      this.data.metrics.agents[agentName] = {
        status: 'in-progress',
        attempts: [],
        final_duration_ms: 0,
        total_cost_usd: 0  // Total cost across all attempts (including retries)
      };
    }

    const agent = this.data.metrics.agents[agentName];

    // Add attempt to array
    const attempt = {
      attempt_number: result.attemptNumber,
      duration_ms: result.duration_ms,
      cost_usd: result.cost_usd,
      success: result.success,
      timestamp: formatTimestamp()
    };

    if (result.error) {
      attempt.error = result.error;
    }

    agent.attempts.push(attempt);

    // Update total cost (includes failed attempts)
    agent.total_cost_usd = agent.attempts.reduce((sum, a) => sum + a.cost_usd, 0);

    // If successful, update final metrics and status
    if (result.success) {
      agent.status = 'success';
      agent.final_duration_ms = result.duration_ms;

      if (result.checkpoint) {
        agent.checkpoint = result.checkpoint;
      }
    } else {
      // If this was the last attempt, mark as failed
      if (result.isFinalAttempt) {
        agent.status = 'failed';
      }
    }

    // Clear active timer
    this.activeTimers.delete(agentName);

    // Recalculate aggregations
    this.recalculateAggregations();

    // Save to disk
    await this.save();
  }

  /**
   * Mark agent as rolled back
   * @param {string} agentName - Agent name
   * @returns {Promise<void>}
   */
  async markRolledBack(agentName) {
    if (!this.data.metrics.agents[agentName]) {
      return; // Agent not tracked
    }

    const agent = this.data.metrics.agents[agentName];
    agent.status = 'rolled-back';
    agent.rolled_back_at = formatTimestamp();

    // Recalculate aggregations (exclude rolled-back agents)
    this.recalculateAggregations();

    await this.save();
  }

  /**
   * Mark multiple agents as rolled back
   * @param {string[]} agentNames - Array of agent names
   * @returns {Promise<void>}
   */
  async markMultipleRolledBack(agentNames) {
    for (const agentName of agentNames) {
      if (this.data.metrics.agents[agentName]) {
        const agent = this.data.metrics.agents[agentName];
        agent.status = 'rolled-back';
        agent.rolled_back_at = formatTimestamp();
      }
    }

    this.recalculateAggregations();
    await this.save();
  }

  /**
   * Update session status
   * @param {string} status - New status (in-progress, completed, failed)
   * @returns {Promise<void>}
   */
  async updateSessionStatus(status) {
    this.data.session.status = status;

    if (status === 'completed' || status === 'failed') {
      this.data.session.completedAt = formatTimestamp();
    }

    await this.save();
  }

  /**
   * Recalculate aggregations (total duration, total cost, phases)
   * @private
   */
  recalculateAggregations() {
    const agents = this.data.metrics.agents;

    // Only count successful agents (not rolled-back or failed)
    const successfulAgents = Object.entries(agents)
      .filter(([_, data]) => data.status === 'success');

    // Calculate total duration and cost
    const totalDuration = successfulAgents.reduce(
      (sum, [_, data]) => sum + data.final_duration_ms,
      0
    );

    const totalCost = successfulAgents.reduce(
      (sum, [_, data]) => sum + data.total_cost_usd,
      0
    );

    this.data.metrics.total_duration_ms = totalDuration;
    this.data.metrics.total_cost_usd = totalCost;

    // Calculate phase-level metrics
    this.data.metrics.phases = this.calculatePhaseMetrics(successfulAgents);
  }

  /**
   * Calculate phase-level metrics
   * @private
   * @param {Array} successfulAgents - Array of [agentName, agentData] tuples
   * @returns {Object} Phase metrics
   */
  calculatePhaseMetrics(successfulAgents) {
    const phases = {
      'pre-recon': [],
      'recon': [],
      'vulnerability-analysis': [],
      'exploitation': [],
      'reporting': []
    };

    // Map agents to phases
    const agentPhaseMap = {
      'pre-recon': 'pre-recon',
      'recon': 'recon',
      'injection-vuln': 'vulnerability-analysis',
      'xss-vuln': 'vulnerability-analysis',
      'auth-vuln': 'vulnerability-analysis',
      'authz-vuln': 'vulnerability-analysis',
      'ssrf-vuln': 'vulnerability-analysis',
      'injection-exploit': 'exploitation',
      'xss-exploit': 'exploitation',
      'auth-exploit': 'exploitation',
      'authz-exploit': 'exploitation',
      'ssrf-exploit': 'exploitation',
      'report': 'reporting'
    };

    // Group agents by phase
    for (const [agentName, agentData] of successfulAgents) {
      const phase = agentPhaseMap[agentName];
      if (phase) {
        phases[phase].push(agentData);
      }
    }

    // Calculate metrics per phase
    const phaseMetrics = {};
    const totalDuration = this.data.metrics.total_duration_ms;

    for (const [phaseName, agentList] of Object.entries(phases)) {
      if (agentList.length === 0) continue;

      const phaseDuration = agentList.reduce(
        (sum, agent) => sum + agent.final_duration_ms,
        0
      );

      const phaseCost = agentList.reduce(
        (sum, agent) => sum + agent.total_cost_usd,
        0
      );

      phaseMetrics[phaseName] = {
        duration_ms: phaseDuration,
        duration_percentage: calculatePercentage(phaseDuration, totalDuration),
        cost_usd: phaseCost,
        agent_count: agentList.length
      };
    }

    return phaseMetrics;
  }

  /**
   * Get current metrics
   * @returns {Object} Current metrics data
   */
  getMetrics() {
    return JSON.parse(JSON.stringify(this.data));
  }

  /**
   * Save metrics to session.json (atomic write)
   * @private
   * @returns {Promise<void>}
   */
  async save() {
    await atomicWrite(this.sessionJsonPath, this.data);
  }

  /**
   * Reload metrics from disk
   * @returns {Promise<void>}
   */
  async reload() {
    this.data = await readJson(this.sessionJsonPath);
  }
}
