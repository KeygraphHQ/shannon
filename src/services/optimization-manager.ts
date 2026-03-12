// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Optimization Manager Service
 *
 * Coordinates all performance and cost optimizations:
 * - Incremental scanning
 * - Caching
 * - Context prioritization
 * - Model tier optimization
 */

import { fs, path } from 'zx';
import { CacheManager } from './cache-manager.js';
import { IncrementalScanner, type IncrementalScanResult } from './incremental-scanner.js';
import { ContextPrioritizer, type PrioritizedFileList } from './context-prioritizer.js';
import { ModelOptimizer } from './model-optimizer.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import type { AgentName } from '../types/agents.js';
import type { ModelTier } from '../ai/models.js';

export interface OptimizationConfig {
  enableIncrementalScan: boolean;
  enableCaching: boolean;
  enableContextPrioritization: boolean;
  enableModelOptimization: boolean;
  cacheDir?: string;
  maxContextSize?: number; // Maximum tokens to include in context
}

export interface OptimizationResult {
  filesToAnalyze: string[];
  scanMode: 'incremental' | 'full';
  cacheStats?: {
    hits: number;
    misses: number;
    hitRate: number;
  };
  prioritizedFiles?: PrioritizedFileList;
  recommendedModelTier?: ModelTier;
}

/**
 * Service that coordinates all optimization features.
 */
export class OptimizationManager {
  private readonly cacheManager: CacheManager | null;
  private readonly incrementalScanner: IncrementalScanner | null;
  private readonly contextPrioritizer: ContextPrioritizer;
  private readonly modelOptimizer: ModelOptimizer;
  private readonly config: OptimizationConfig;
  private readonly logger: ActivityLogger;
  private readonly repoPath: string;
  private readonly workspaceDir: string;

  constructor(
    repoPath: string,
    workspaceDir: string,
    config: OptimizationConfig,
    logger: ActivityLogger
  ) {
    this.repoPath = repoPath;
    this.workspaceDir = workspaceDir;
    this.config = config;
    this.logger = logger;

    // Initialize cache manager if enabled
    if (config.enableCaching && config.cacheDir) {
      this.cacheManager = new CacheManager(config.cacheDir, logger);
    } else {
      this.cacheManager = null;
    }

    // Initialize incremental scanner if enabled
    if (config.enableIncrementalScan) {
      this.incrementalScanner = new IncrementalScanner(repoPath, workspaceDir, logger);
    } else {
      this.incrementalScanner = null;
    }

    this.contextPrioritizer = new ContextPrioritizer(logger);
    this.modelOptimizer = new ModelOptimizer(logger);
  }

  /**
   * Initialize optimization services.
   */
  async initialize(): Promise<void> {
    if (this.cacheManager) {
      await this.cacheManager.initialize();
    }
    this.logger.info('Optimization manager initialized');
  }

  /**
   * Get files to analyze with all optimizations applied.
   */
  async getFilesToAnalyze(agentName: AgentName): Promise<OptimizationResult> {
    let filesToAnalyze: string[] = [];
    let scanMode: 'incremental' | 'full' = 'full';

    // Step 1: Incremental scanning
    if (this.incrementalScanner) {
      const scanResult = await this.incrementalScanner.determineScanMode();
      filesToAnalyze = scanResult.allFiles;
      scanMode = scanResult.scanMode;
      
      if (scanMode === 'incremental') {
        this.logger.info(
          `Incremental scan: analyzing ${filesToAnalyze.length} changed files ` +
          `(out of ${scanResult.changedFiles.length} total changed)`
        );
      }
    } else {
      // Fallback: get all source files
      if (this.incrementalScanner) {
        filesToAnalyze = await this.incrementalScanner.getAllSourceFiles();
      }
    }

    // Step 2: Context prioritization
    let prioritizedFiles: PrioritizedFileList | undefined;
    if (this.config.enableContextPrioritization && filesToAnalyze.length > 0) {
      prioritizedFiles = await this.contextPrioritizer.splitByPriority(filesToAnalyze);
      
      // Use prioritized list (high priority first)
      filesToAnalyze = [
        ...priorizedFiles.high,
        ...priorizedFiles.medium,
        ...priorizedFiles.low,
      ];
      
      this.logger.info(
        `Prioritized files: ${priorizedFiles.high.length} high, ` +
        `${priorizedFiles.medium.length} medium, ${priorizedFiles.low.length} low`
      );
    }

    // Step 3: Apply context size limit
    if (this.config.maxContextSize && filesToAnalyze.length > 0) {
      const limitedFiles = await this.limitContextSize(filesToAnalyze);
      if (limitedFiles.length < filesToAnalyze.length) {
        this.logger.info(
          `Limited context: ${limitedFiles.length} files ` +
          `(from ${filesToAnalyze.length} total)`
        );
        filesToAnalyze = limitedFiles;
      }
    }

    // Step 4: Model tier recommendation
    let recommendedModelTier: ModelTier | undefined;
    if (this.config.enableModelOptimization) {
      const totalSize = await this.estimateTotalFileSize(filesToAnalyze);
      recommendedModelTier = this.modelOptimizer.recommendTierForAnalysis(
        agentName,
        filesToAnalyze.length,
        totalSize
      );
      this.logger.info(`Recommended model tier for ${agentName}: ${recommendedModelTier}`);
    }

    // Step 5: Get cache stats
    let cacheStats: OptimizationResult['cacheStats'];
    if (this.cacheManager) {
      const stats = this.cacheManager.getStats();
      cacheStats = {
        hits: stats.hits,
        misses: stats.misses,
        hitRate: this.cacheManager.getHitRate(),
      };
    }

    return {
      filesToAnalyze,
      scanMode,
      cacheStats,
      prioritizedFiles,
      recommendedModelTier,
    };
  }

  /**
   * Limit context size by prioritizing high-risk files.
   */
  private async limitContextSize(files: string[]): Promise<string[]> {
    if (!this.config.maxContextSize) {
      return files;
    }

    const priorities = await this.contextPrioritizer.prioritizeFiles(files);
    const limitedFiles: string[] = [];
    let totalSize = 0;

    for (const filePriority of priorities) {
      try {
        const stats = await fs.stat(filePriority.filePath);
        const fileTokens = this.modelOptimizer.estimateTokensFromFileSize(stats.size);
        
        if (totalSize + fileTokens <= this.config.maxContextSize) {
          limitedFiles.push(filePriority.filePath);
          totalSize += fileTokens;
        } else {
          break; // Stop when limit reached
        }
      } catch {
        // Skip files that can't be accessed
      }
    }

    return limitedFiles;
  }

  /**
   * Estimate total file size.
   */
  private async estimateTotalFileSize(files: string[]): Promise<number> {
    let totalSize = 0;
    for (const file of files) {
      try {
        const stats = await fs.stat(file);
        totalSize += stats.size;
      } catch {
        // Ignore files that can't be accessed
      }
    }
    return totalSize;
  }

  /**
   * Get cached analysis for a file.
   */
  async getCachedAnalysis(
    filePath: string,
    agentName: AgentName
  ): Promise<string | null> {
    if (!this.cacheManager) {
      return null;
    }

    const cached = await this.cacheManager.getCachedAnalysis(filePath, agentName);
    return cached?.analysisResult || null;
  }

  /**
   * Cache analysis result for a file.
   */
  async cacheAnalysis(
    filePath: string,
    agentName: AgentName,
    analysisResult: string
  ): Promise<void> {
    if (this.cacheManager) {
      await this.cacheManager.setCachedAnalysis(filePath, agentName, analysisResult);
    }
  }

  /**
   * Save scan commit after successful scan.
   */
  async saveScanCommit(): Promise<void> {
    if (this.incrementalScanner) {
      const currentCommit = await this.incrementalScanner.getCurrentCommit();
      if (currentCommit) {
        await this.incrementalScanner.saveScanCommit(currentCommit);
      }
    }
  }

  /**
   * Get optimization statistics.
   */
  getStats(): {
    cacheStats?: ReturnType<CacheManager['getStats']>;
  } {
    return {
      cacheStats: this.cacheManager?.getStats(),
    };
  }

  /**
   * Clear all caches.
   */
  async clearCache(): Promise<void> {
    if (this.cacheManager) {
      await this.cacheManager.clearCache();
    }
  }
}
