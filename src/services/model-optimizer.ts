// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Model Optimizer Service
 *
 * Optimizes model tier selection based on task complexity to reduce costs.
 * Uses smaller models for simpler tasks and larger models only when needed.
 */

import type { ActivityLogger } from '../types/activity-logger.js';
import type { ModelTier } from '../ai/models.js';
import type { AgentName } from '../types/agents.js';

/**
 * Task complexity levels.
 */
export type TaskComplexity = 'simple' | 'moderate' | 'complex';

/**
 * Model tier recommendations based on agent and context.
 */
export class ModelOptimizer {
  private readonly logger: ActivityLogger;

  constructor(logger: ActivityLogger) {
    this.logger = logger;
  }

  /**
   * Determine optimal model tier for an agent based on task characteristics.
   */
  determineOptimalTier(
    agentName: AgentName,
    contextSize: number, // Approximate token count
    taskComplexity?: TaskComplexity
  ): ModelTier {
    // Default tier from agent definition
    const defaultTier = this.getDefaultTierForAgent(agentName);

    // If complexity is provided, use it
    if (taskComplexity) {
      return this.complexityToTier(taskComplexity);
    }

    // Estimate complexity based on context size
    const estimatedComplexity = this.estimateComplexity(contextSize, agentName);
    
    // For very small contexts, use small model
    if (contextSize < 10000) {
      this.logger.debug(`Using small model for ${agentName} (small context: ${contextSize} tokens)`);
      return 'small';
    }

    // For very large contexts, prefer medium or large
    if (contextSize > 200000) {
      this.logger.debug(`Using ${defaultTier} model for ${agentName} (large context: ${contextSize} tokens)`);
      return defaultTier === 'small' ? 'medium' : defaultTier;
    }

    // Use default tier for moderate contexts
    return defaultTier;
  }

  /**
   * Get default tier for an agent.
   */
  private getDefaultTierForAgent(agentName: AgentName): ModelTier {
    // Agents that typically need less reasoning
    const smallTierAgents: AgentName[] = [
      'pre-recon', // Code analysis can use smaller model
    ];

    // Agents that need deep reasoning
    const largeTierAgents: AgentName[] = [
      'report', // Final report generation needs quality
    ];

    if (smallTierAgents.includes(agentName)) {
      return 'small';
    }

    if (largeTierAgents.includes(agentName)) {
      return 'large';
    }

    // Default to medium for most agents
    return 'medium';
  }

  /**
   * Convert complexity level to model tier.
   */
  private complexityToTier(complexity: TaskComplexity): ModelTier {
    switch (complexity) {
      case 'simple':
        return 'small';
      case 'moderate':
        return 'medium';
      case 'complex':
        return 'large';
    }
  }

  /**
   * Estimate task complexity based on context size and agent type.
   */
  private estimateComplexity(contextSize: number, agentName: AgentName): TaskComplexity {
    // Simple tasks: small context, straightforward agents
    if (contextSize < 50000 && this.isSimpleAgent(agentName)) {
      return 'simple';
    }

    // Complex tasks: large context or complex agents
    if (contextSize > 150000 || this.isComplexAgent(agentName)) {
      return 'complex';
    }

    return 'moderate';
  }

  /**
   * Check if agent typically performs simple tasks.
   */
  private isSimpleAgent(agentName: AgentName): boolean {
    return agentName === 'pre-recon' || agentName.startsWith('report');
  }

  /**
   * Check if agent typically performs complex tasks.
   */
  private isComplexAgent(agentName: AgentName): boolean {
    return agentName.includes('exploit') || agentName.includes('vuln');
  }

  /**
   * Estimate token count from file size (rough approximation).
   */
  estimateTokensFromFileSize(fileSizeBytes: number): number {
    // Rough estimate: 1 token ≈ 4 characters, 1 character ≈ 1 byte for ASCII
    return Math.floor(fileSizeBytes / 4);
  }

  /**
   * Estimate total context size for multiple files.
   */
  estimateTotalContextSize(fileSizes: number[]): number {
    return fileSizes.reduce((sum, size) => sum + this.estimateTokensFromFileSize(size), 0);
  }

  /**
   * Recommend model tier based on analysis scope.
   */
  recommendTierForAnalysis(
    agentName: AgentName,
    filesToAnalyze: number,
    totalFileSize: number
  ): ModelTier {
    const estimatedTokens = this.estimateTotalContextSize([totalFileSize]);
    
    // For small analysis scopes, use smaller models
    if (filesToAnalyze < 10 && estimatedTokens < 50000) {
      return 'small';
    }

    // For large analysis scopes, use default or larger models
    if (filesToAnalyze > 100 || estimatedTokens > 200000) {
      const defaultTier = this.getDefaultTierForAgent(agentName);
      return defaultTier === 'small' ? 'medium' : defaultTier;
    }

    return this.getDefaultTierForAgent(agentName);
  }
}
