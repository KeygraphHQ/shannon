// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Parallel Optimizer Service
 *
 * Optimizes parallel agent execution for better resource allocation and
 * reduced API rate limit issues.
 */

import type { ActivityLogger } from '../types/activity-logger.js';
import type { AgentName } from '../types/agents.js';

export interface AgentResourceRequirement {
  agentName: AgentName;
  estimatedTokens: number;
  priority: number;
  estimatedDuration: number; // milliseconds
}

export interface ParallelExecutionPlan {
  batches: AgentName[][];
  totalEstimatedTime: number;
  maxConcurrency: number;
}

/**
 * Service for optimizing parallel agent execution.
 */
export class ParallelOptimizer {
  private readonly logger: ActivityLogger;
  private readonly maxConcurrentPipelines: number;

  constructor(logger: ActivityLogger, maxConcurrentPipelines: number = 5) {
    this.logger = logger;
    this.maxConcurrentPipelines = maxConcurrentPipelines;
  }

  /**
   * Create an execution plan for parallel agents.
   */
  createExecutionPlan(
    agents: AgentResourceRequirement[]
  ): ParallelExecutionPlan {
    // Sort agents by priority (highest first)
    const sortedAgents = [...agents].sort((a, b) => b.priority - a.priority);

    // Group agents into batches based on concurrency limit
    const batches: AgentName[][] = [];
    let currentBatch: AgentName[] = [];
    let currentBatchTokens = 0;
    const maxTokensPerBatch = 500000; // Rough limit to prevent API overload

    for (const agent of sortedAgents) {
      // Start new batch if current batch is full or token limit reached
      if (
        currentBatch.length >= this.maxConcurrentPipelines ||
        currentBatchTokens + agent.estimatedTokens > maxTokensPerBatch
      ) {
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
          currentBatch = [];
          currentBatchTokens = 0;
        }
      }

      currentBatch.push(agent.agentName);
      currentBatchTokens += agent.estimatedTokens;
    }

    // Add remaining batch
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    // Calculate total estimated time (sum of longest agent in each batch)
    const totalEstimatedTime = batches.reduce((total, batch) => {
      const batchTime = Math.max(
        ...batch.map(
          (agentName) =>
            agents.find((a) => a.agentName === agentName)?.estimatedDuration || 0
        )
      );
      return total + batchTime;
    }, 0);

    this.logger.info(
      `Created execution plan: ${batches.length} batches, ` +
      `max ${this.maxConcurrentPipelines} concurrent agents per batch, ` +
      `estimated ${Math.round(totalEstimatedTime / 1000 / 60)} minutes`
    );

    return {
      batches,
      totalEstimatedTime,
      maxConcurrency: this.maxConcurrentPipelines,
    };
  }

  /**
   * Estimate resource requirements for an agent.
   */
  estimateAgentResources(agentName: AgentName, fileCount: number): AgentResourceRequirement {
    // Base estimates (can be refined based on historical data)
    const baseEstimates: Record<string, { tokens: number; duration: number }> = {
      'pre-recon': { tokens: 50000, duration: 10 * 60 * 1000 }, // 10 min
      'recon': { tokens: 100000, duration: 15 * 60 * 1000 }, // 15 min
      'injection-vuln': { tokens: 150000, duration: 20 * 60 * 1000 }, // 20 min
      'xss-vuln': { tokens: 120000, duration: 18 * 60 * 1000 }, // 18 min
      'auth-vuln': { tokens: 100000, duration: 15 * 60 * 1000 }, // 15 min
      'ssrf-vuln': { tokens: 80000, duration: 12 * 60 * 1000 }, // 12 min
      'authz-vuln': { tokens: 90000, duration: 14 * 60 * 1000 }, // 14 min
      'injection-exploit': { tokens: 200000, duration: 25 * 60 * 1000 }, // 25 min
      'xss-exploit': { tokens: 150000, duration: 20 * 60 * 1000 }, // 20 min
      'auth-exploit': { tokens: 180000, duration: 22 * 60 * 1000 }, // 22 min
      'ssrf-exploit': { tokens: 120000, duration: 18 * 60 * 1000 }, // 18 min
      'authz-exploit': { tokens: 140000, duration: 19 * 60 * 1000 }, // 19 min
      'report': { tokens: 100000, duration: 10 * 60 * 1000 }, // 10 min
    };

    const base = baseEstimates[agentName] || { tokens: 100000, duration: 15 * 60 * 1000 };

    // Scale based on file count (rough estimate)
    const fileMultiplier = Math.min(2, 1 + fileCount / 100);
    const estimatedTokens = Math.floor(base.tokens * fileMultiplier);
    const estimatedDuration = Math.floor(base.duration * fileMultiplier);

    // Priority: exploit agents > vuln agents > recon agents
    let priority = 50;
    if (agentName.includes('exploit')) {
      priority = 80;
    } else if (agentName.includes('vuln')) {
      priority = 60;
    } else if (agentName === 'report') {
      priority = 40; // Report runs last
    }

    return {
      agentName,
      estimatedTokens,
      priority,
      estimatedDuration,
    };
  }

  /**
   * Optimize batch execution order for better resource utilization.
   */
  optimizeBatchOrder(batches: AgentName[][]): AgentName[][] {
    // Reorder batches to balance resource usage
    // Place heavier batches first when resources are available
    return batches.sort((a, b) => {
      const aWeight = a.length;
      const bWeight = b.length;
      return bWeight - aWeight; // Heavier batches first
    });
  }
}
