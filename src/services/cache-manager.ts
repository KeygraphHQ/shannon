// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Cache Manager Service
 *
 * Provides caching for code analysis results across runs to reduce redundant LLM calls.
 * Uses file hashes to detect changes and invalidate stale cache entries.
 */

import { fs, path } from 'zx';
import { createHash } from 'crypto';
import type { ActivityLogger } from '../types/activity-logger.js';

export interface CachedAnalysis {
  filePath: string;
  fileHash: string;
  analysisResult: string;
  timestamp: number;
  agentName: string;
}

export interface CacheStats {
  hits: number;
  misses: number;
  invalidations: number;
  totalSize: number;
}

/**
 * Cache manager for code analysis results.
 */
export class CacheManager {
  private readonly cacheDir: string;
  private readonly logger: ActivityLogger;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    invalidations: 0,
    totalSize: 0,
  };

  constructor(cacheDir: string, logger: ActivityLogger) {
    this.cacheDir = cacheDir;
    this.logger = logger;
  }

  /**
   * Initialize cache directory.
   */
  async initialize(): Promise<void> {
    await fs.ensureDir(this.cacheDir);
    this.logger.info(`Cache directory initialized: ${this.cacheDir}`);
  }

  /**
   * Compute SHA-256 hash of file contents.
   */
  private async computeFileHash(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return createHash('sha256').update(content).digest('hex');
    } catch (error) {
      this.logger.warn(`Failed to compute hash for ${filePath}: ${error}`);
      return '';
    }
  }

  /**
   * Generate cache key from file path and agent name.
   */
  private getCacheKey(filePath: string, agentName: string): string {
    const normalizedPath = path.normalize(filePath).replace(/[^a-zA-Z0-9]/g, '_');
    return `${agentName}_${normalizedPath}`;
  }

  /**
   * Get cache file path for a given key.
   */
  private getCacheFilePath(cacheKey: string): string {
    return path.join(this.cacheDir, `${cacheKey}.json`);
  }

  /**
   * Check if cached analysis is still valid for a file.
   */
  async getCachedAnalysis(
    filePath: string,
    agentName: string
  ): Promise<CachedAnalysis | null> {
    const cacheKey = this.getCacheKey(filePath, agentName);
    const cacheFilePath = this.getCacheFilePath(cacheKey);

    try {
      // Check if cache file exists
      if (!(await fs.pathExists(cacheFilePath))) {
        this.stats.misses++;
        return null;
      }

      // Load cached entry
      const cached: CachedAnalysis = JSON.parse(await fs.readFile(cacheFilePath, 'utf8'));

      // Verify file still exists and hash matches
      if (!(await fs.pathExists(filePath))) {
        this.stats.invalidations++;
        await fs.remove(cacheFilePath);
        return null;
      }

      const currentHash = await this.computeFileHash(filePath);
      if (cached.fileHash !== currentHash) {
        this.stats.invalidations++;
        await fs.remove(cacheFilePath);
        return null;
      }

      // Cache hit!
      this.stats.hits++;
      this.logger.debug(`Cache hit for ${filePath} (agent: ${agentName})`);
      return cached;
    } catch (error) {
      this.logger.warn(`Cache read error for ${filePath}: ${error}`);
      this.stats.misses++;
      return null;
    }
  }

  /**
   * Store analysis result in cache.
   */
  async setCachedAnalysis(
    filePath: string,
    agentName: string,
    analysisResult: string
  ): Promise<void> {
    const cacheKey = this.getCacheKey(filePath, agentName);
    const cacheFilePath = this.getCacheFilePath(cacheKey);

    try {
      const fileHash = await this.computeFileHash(filePath);
      const cached: CachedAnalysis = {
        filePath,
        fileHash,
        analysisResult,
        timestamp: Date.now(),
        agentName,
      };

      await fs.writeFile(cacheFilePath, JSON.stringify(cached, null, 2), 'utf8');
      this.stats.totalSize += JSON.stringify(cached).length;
      this.logger.debug(`Cached analysis for ${filePath} (agent: ${agentName})`);
    } catch (error) {
      this.logger.warn(`Cache write error for ${filePath}: ${error}`);
    }
  }

  /**
   * Invalidate cache entries for changed files.
   */
  async invalidateFiles(changedFiles: string[]): Promise<void> {
    for (const filePath of changedFiles) {
      const cacheFiles = await fs.glob(path.join(this.cacheDir, '*.json'));
      for (const cacheFile of cacheFiles) {
        try {
          const cached: CachedAnalysis = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
          if (cached.filePath === filePath) {
            await fs.remove(cacheFile);
            this.stats.invalidations++;
          }
        } catch {
          // Ignore corrupted cache files
        }
      }
    }
  }

  /**
   * Clear all cache entries.
   */
  async clearCache(): Promise<void> {
    const cacheFiles = await fs.glob(path.join(this.cacheDir, '*.json'));
    for (const cacheFile of cacheFiles) {
      await fs.remove(cacheFile);
    }
    this.stats = {
      hits: 0,
      misses: 0,
      invalidations: 0,
      totalSize: 0,
    };
    this.logger.info('Cache cleared');
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get cache hit rate.
   */
  getHitRate(): number {
    const total = this.stats.hits + this.stats.misses;
    return total > 0 ? this.stats.hits / total : 0;
  }
}
