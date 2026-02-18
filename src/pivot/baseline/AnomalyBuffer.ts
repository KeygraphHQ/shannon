// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * PIVOT - Phase 1: Baseline Capture Module
 * AnomalyBuffer class for storing unclassified deltas
 */

import { ResponseDelta } from '../../types/pivot.js';
import { existsSync, mkdirSync, appendFileSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Anomaly record stored in buffer
 */
export interface AnomalyRecord {
  timestamp: string;
  engagement_id: string;
  obstacle_id?: string;
  delta: ResponseDelta;
  confidence_score: number;
  change_summary: string;
  context?: {
    mutation_strategy?: string;
    payload?: string;
    target_url?: string;
  };
}

/**
 * Configuration for anomaly buffer
 */
export interface AnomalyBufferConfig {
  storagePath: string;
  maxAnomaliesPerEngagement: number;
  autoPruneDays: number;
}

/**
 * Default configuration for anomaly buffer
 */
const DEFAULT_CONFIG: AnomalyBufferConfig = {
  storagePath: './audit-logs/anomalies',
  maxAnomaliesPerEngagement: 1000,
  autoPruneDays: 30
};

/**
 * AnomalyBuffer - Append-only log for unclassified deltas
 */
export class AnomalyBuffer {
  private config: AnomalyBufferConfig;
  private anomalies: Map<string, AnomalyRecord[]> = new Map(); // engagement_id -> anomalies

  constructor(config: Partial<AnomalyBufferConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ensureStorageDirectory();
    this.loadExistingAnomalies();
  }

  /**
   * Ensure the storage directory exists
   */
  private ensureStorageDirectory(): void {
    if (!existsSync(this.config.storagePath)) {
      mkdirSync(this.config.storagePath, { recursive: true });
    }
  }

  /**
   * Load existing anomalies from disk
   */
  private loadExistingAnomalies(): void {
    try {
      const files = this.getAnomalyFiles();
      for (const file of files) {
        const engagementId = this.extractEngagementIdFromFilename(file);
        if (engagementId) {
          const anomalies = this.readAnomaliesFromFile(engagementId);
          this.anomalies.set(engagementId, anomalies);
        }
      }
    } catch (error) {
      // If loading fails, start with empty buffer
      console.warn('[PIVOT] Failed to load existing anomalies, starting fresh:', error);
    }
  }

  /**
   * Get list of anomaly files
   */
  private getAnomalyFiles(): string[] {
    try {
      // Use readdirSync to read directory contents
      const files = readdirSync(this.config.storagePath);
      return files.filter(file => file.startsWith('anomalies_') && file.endsWith('.json'));
    } catch (error) {
      // Directory might not exist yet
      return [];
    }
  }

  /**
   * Extract engagement ID from filename
   */
  private extractEngagementIdFromFilename(filename: string): string | null {
    const match = filename.match(/anomalies_([a-f0-9-]+)\.json$/);
    return match ? match[1] : null;
  }

  /**
   * Read anomalies from file
   */
  private readAnomaliesFromFile(engagementId: string): AnomalyRecord[] {
    const filepath = this.getAnomalyFilePath(engagementId);
    if (!existsSync(filepath)) {
      return [];
    }

    try {
      const content = readFileSync(filepath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`[PIVOT] Error reading anomalies for engagement ${engagementId}:`, error);
      return [];
    }
  }

  /**
   * Get file path for engagement anomalies
   */
  private getAnomalyFilePath(engagementId: string): string {
    return join(this.config.storagePath, `anomalies_${engagementId}.json`);
  }

  /**
   * Add a delta to the anomaly buffer
   */
  addDelta(
    engagementId: string,
    delta: ResponseDelta,
    confidenceScore: number,
    changeSummary: string,
    context?: {
      mutation_strategy?: string;
      payload?: string;
      target_url?: string;
      obstacle_id?: string;
    }
  ): void {
    const anomalyRecord: AnomalyRecord = {
      timestamp: new Date().toISOString(),
      engagement_id: engagementId,
      obstacle_id: context?.obstacle_id,
      delta,
      confidence_score: confidenceScore,
      change_summary: changeSummary,
      context: {
        mutation_strategy: context?.mutation_strategy,
        payload: context?.payload,
        target_url: context?.target_url
      }
    };

    // Add to memory buffer
    if (!this.anomalies.has(engagementId)) {
      this.anomalies.set(engagementId, []);
    }
    
    const engagementAnomalies = this.anomalies.get(engagementId)!;
    engagementAnomalies.push(anomalyRecord);

    // Enforce maximum anomalies per engagement
    if (engagementAnomalies.length > this.config.maxAnomaliesPerEngagement) {
      engagementAnomalies.splice(0, engagementAnomalies.length - this.config.maxAnomaliesPerEngagement);
    }

    // Append to disk
    this.appendToFile(engagementId, anomalyRecord);

    console.log(`[PIVOT] Anomaly recorded for engagement ${engagementId}: ${changeSummary} (confidence: ${confidenceScore.toFixed(2)})`);
  }

  /**
   * Append anomaly record to file
   */
  private appendToFile(engagementId: string, record: AnomalyRecord): void {
    const filepath = this.getAnomalyFilePath(engagementId);
    const line = JSON.stringify(record) + '\n';
    
    try {
      appendFileSync(filepath, line, 'utf8');
    } catch (error) {
      console.error(`[PIVOT] Error writing anomaly to file for engagement ${engagementId}:`, error);
    }
  }

  /**
   * Get all anomalies for an engagement
   */
  getAnomalies(engagementId: string): AnomalyRecord[] {
    // Check memory first
    if (this.anomalies.has(engagementId)) {
      return [...this.anomalies.get(engagementId)!];
    }

    // Fall back to disk
    return this.readAnomaliesFromFile(engagementId);
  }

  /**
   * Get anomalies filtered by confidence threshold
   */
  getAnomaliesByConfidence(engagementId: string, minConfidence: number): AnomalyRecord[] {
    const anomalies = this.getAnomalies(engagementId);
    return anomalies.filter(anomaly => anomaly.confidence_score >= minConfidence);
  }

  /**
   * Get anomalies filtered by change type
   */
  getAnomaliesByChangeType(engagementId: string, changeType: string): AnomalyRecord[] {
    const anomalies = this.getAnomalies(engagementId);
    return anomalies.filter(anomaly => 
      anomaly.change_summary.toLowerCase().includes(changeType.toLowerCase())
    );
  }

  /**
   * Get anomaly statistics for an engagement
   */
  getAnomalyStatistics(engagementId: string): {
    total: number;
    byConfidence: { low: number; medium: number; high: number };
    byChangeType: Record<string, number>;
    recentAnomalies: AnomalyRecord[];
  } {
    const anomalies = this.getAnomalies(engagementId);
    
    // Count by confidence
    const byConfidence = {
      low: anomalies.filter(a => a.confidence_score < 0.3).length,
      medium: anomalies.filter(a => a.confidence_score >= 0.3 && a.confidence_score < 0.7).length,
      high: anomalies.filter(a => a.confidence_score >= 0.7).length
    };

    // Count by change type (simplified)
    const byChangeType: Record<string, number> = {};
    anomalies.forEach(anomaly => {
      const changes = anomaly.change_summary.split(', ');
      changes.forEach(change => {
        const baseChange = change.split('(')[0]; // Remove parameters
        byChangeType[baseChange] = (byChangeType[baseChange] || 0) + 1;
      });
    });

    // Get recent anomalies (last 10)
    const recentAnomalies = anomalies.slice(-10).reverse();

    return {
      total: anomalies.length,
      byConfidence,
      byChangeType,
      recentAnomalies
    };
  }

  /**
   * Clear anomalies for an engagement
   */
  clearAnomalies(engagementId: string): boolean {
    this.anomalies.delete(engagementId);
    
    const filepath = this.getAnomalyFilePath(engagementId);
    if (existsSync(filepath)) {
      try {
        unlinkSync(filepath);
        console.log(`[PIVOT] Deleted anomaly file: ${filepath}`);
        return true;
      } catch (error) {
        console.error(`[PIVOT] Error clearing anomalies for engagement ${engagementId}:`, error);
        return false;
      }
    }
    
    return true;
  }

  /**
   * Prune old anomalies (older than autoPruneDays)
   */
  pruneOldAnomalies(): { prunedCount: number; prunedEngagements: string[] } {
    const prunedEngagements: string[] = [];
    let prunedCount = 0;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.autoPruneDays);

    for (const [engagementId, anomalies] of this.anomalies.entries()) {
      const originalCount = anomalies.length;
      const filtered = anomalies.filter(anomaly => {
        const anomalyDate = new Date(anomaly.timestamp);
        return anomalyDate >= cutoffDate;
      });

      if (filtered.length < originalCount) {
        this.anomalies.set(engagementId, filtered);
        prunedCount += (originalCount - filtered.length);
        prunedEngagements.push(engagementId);
        
        // Rewrite file with pruned anomalies
        this.rewriteAnomalyFile(engagementId, filtered);
      }
    }

    if (prunedCount > 0) {
      console.log(`[PIVOT] Pruned ${prunedCount} old anomalies from ${prunedEngagements.length} engagements`);
    }

    return { prunedCount, prunedEngagements };
  }

  /**
   * Rewrite anomaly file with filtered anomalies
   */
  private rewriteAnomalyFile(engagementId: string, anomalies: AnomalyRecord[]): void {
    const filepath = this.getAnomalyFilePath(engagementId);
    const content = anomalies.map(anomaly => JSON.stringify(anomaly)).join('\n') + '\n';
    
    try {
      writeFileSync(filepath, content, 'utf8');
      console.log(`[PIVOT] Rewrote anomaly file for engagement ${engagementId} with ${anomalies.length} records`);
    } catch (error) {
      console.error(`[PIVOT] Error rewriting anomaly file for engagement ${engagementId}:`, error);
    }
  }

  /**
   * Export anomalies for analysis
   */
  exportAnomalies(engagementId: string, format: 'json' | 'csv' = 'json'): string {
    const anomalies = this.getAnomalies(engagementId);
    
    if (format === 'csv') {
      return this.exportToCsv(anomalies);
    }
    
    // Default to JSON
    return JSON.stringify({
      engagement_id: engagementId,
      exported_at: new Date().toISOString(),
      total_anomalies: anomalies.length,
      anomalies
    }, null, 2);
  }

  /**
   * Export anomalies to CSV format
   */
  private exportToCsv(anomalies: AnomalyRecord[]): string {
    if (anomalies.length === 0) {
      return 'timestamp,engagement_id,confidence_score,change_summary\n';
    }

    const headers = ['timestamp', 'engagement_id', 'confidence_score', 'change_summary', 'obstacle_id', 'mutation_strategy'];
    const rows = anomalies.map(anomaly => [
      anomaly.timestamp,
      anomaly.engagement_id,
      anomaly.confidence_score.toString(),
      `"${anomaly.change_summary.replace(/"/g, '""')}"`,
      anomaly.obstacle_id || '',
      anomaly.context?.mutation_strategy || ''
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }
}