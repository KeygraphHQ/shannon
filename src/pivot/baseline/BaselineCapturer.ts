// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * PIVOT - Phase 1: Baseline Capture Module
 * BaselineCapturer class for establishing response baselines
 */

import { ResponseFingerprint } from '../../types/pivot.js';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Configuration for baseline capture
 */
export interface BaselineConfig {
  sampleCount: number; // Number of clean requests to fire (default: 5)
  requestDelayMs: number; // Delay between requests in milliseconds
  timeoutMs: number; // Request timeout in milliseconds
  storagePath: string; // Path to store baseline files
}

/**
 * Default configuration for baseline capture
 */
const DEFAULT_CONFIG: BaselineConfig = {
  sampleCount: 5,
  requestDelayMs: 1000,
  timeoutMs: 10000,
  storagePath: './workspace/baselines'
};

/**
 * Baseline statistics computed from multiple fingerprints
 */
export interface BaselineStatistics {
  meanResponseTime: number;
  stdDevResponseTime: number;
  meanBodyLength: number;
  stdDevBodyLength: number;
  commonHeaders: Record<string, string>;
  statusCode: number;
  errorClass: string | null;
  sampleFingerprint: ResponseFingerprint; // One sample for reference
}

/**
 * BaselineCapturer - Fires N clean requests to establish response baseline
 */
export class BaselineCapturer {
  private config: BaselineConfig;

  constructor(config: Partial<BaselineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ensureStorageDirectory();
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
   * Execute a clean request to the target
   * This is a placeholder - should be implemented with actual HTTP client
   */
  private async executeCleanRequest(targetUrl: string): Promise<ResponseFingerprint> {
    // TODO: Replace with actual HTTP client implementation
    // For now, return a mock fingerprint
    return {
      status_code: 200,
      body_hash: this.generateBodyHash('mock response body'),
      body_length: 1024,
      response_time_ms: [150, 145, 155, 148, 152],
      headers: {
        'content-type': 'text/html',
        'server': 'nginx',
        'date': new Date().toUTCString()
      },
      error_class: null,
      raw_body_sample: 'Mock response body for baseline establishment'
    };
  }

  /**
   * Generate SHA-256 hash of response body
   */
  private generateBodyHash(body: string): string {
    // TODO: Implement actual SHA-256 hashing
    // For now, return a mock hash
    return `sha256-${Buffer.from(body).toString('base64').substring(0, 64)}`;
  }

  /**
   * Compute statistics from multiple fingerprints
   */
  private computeStatistics(fingerprints: ResponseFingerprint[]): BaselineStatistics {
    if (fingerprints.length === 0) {
      throw new Error('Cannot compute statistics from empty fingerprint array');
    }

    // Compute mean and standard deviation for response times
    const allResponseTimes = fingerprints.flatMap(fp => fp.response_time_ms);
    const meanResponseTime = allResponseTimes.reduce((a, b) => a + b, 0) / allResponseTimes.length;
    const varianceResponseTime = allResponseTimes.reduce((a, b) => a + Math.pow(b - meanResponseTime, 2), 0) / allResponseTimes.length;
    const stdDevResponseTime = Math.sqrt(varianceResponseTime);

    // Compute mean and standard deviation for body lengths
    const bodyLengths = fingerprints.map(fp => fp.body_length);
    const meanBodyLength = bodyLengths.reduce((a, b) => a + b, 0) / bodyLengths.length;
    const varianceBodyLength = bodyLengths.reduce((a, b) => a + Math.pow(b - meanBodyLength, 2), 0) / bodyLengths.length;
    const stdDevBodyLength = Math.sqrt(varianceBodyLength);

    // Find common headers (headers that appear in all responses with same value)
    const commonHeaders: Record<string, string> = {};
    if (fingerprints.length > 0) {
      const firstHeaders = fingerprints[0].headers;
      for (const [key, value] of Object.entries(firstHeaders)) {
        if (fingerprints.every(fp => fp.headers[key] === value)) {
          commonHeaders[key] = value;
        }
      }
    }

    // Check if all status codes are the same
    const statusCodes = fingerprints.map(fp => fp.status_code);
    const allSameStatusCode = statusCodes.every(code => code === statusCodes[0]);
    const statusCode = allSameStatusCode ? statusCodes[0] : 200; // Default to 200 if inconsistent

    // Check if all error classes are the same
    const errorClasses = fingerprints.map(fp => fp.error_class);
    const allSameErrorClass = errorClasses.every(ec => ec === errorClasses[0]);
    const errorClass = allSameErrorClass ? errorClasses[0] : null;

    return {
      meanResponseTime,
      stdDevResponseTime,
      meanBodyLength,
      stdDevBodyLength,
      commonHeaders,
      statusCode,
      errorClass,
      sampleFingerprint: fingerprints[0] // Use first fingerprint as sample
    };
  }

  /**
   * Capture baseline by firing N clean requests to target
   */
  async captureBaseline(targetUrl: string, engagementId: string): Promise<BaselineStatistics> {
    console.log(`[PIVOT] Capturing baseline for engagement ${engagementId} with ${this.config.sampleCount} requests`);
    
    const fingerprints: ResponseFingerprint[] = [];

    for (let i = 0; i < this.config.sampleCount; i++) {
      try {
        console.log(`[PIVOT] Baseline request ${i + 1}/${this.config.sampleCount}`);
        const fingerprint = await this.executeCleanRequest(targetUrl);
        fingerprints.push(fingerprint);

        // Delay between requests if not the last request
        if (i < this.config.sampleCount - 1) {
          await new Promise(resolve => setTimeout(resolve, this.config.requestDelayMs));
        }
      } catch (error) {
        console.error(`[PIVOT] Error during baseline request ${i + 1}:`, error);
        // Continue with remaining requests even if one fails
      }
    }

    if (fingerprints.length === 0) {
      throw new Error('Failed to capture any baseline fingerprints');
    }

    const statistics = this.computeStatistics(fingerprints);
    this.saveBaseline(engagementId, statistics);
    
    console.log(`[PIVOT] Baseline captured successfully for engagement ${engagementId}`);
    return statistics;
  }

  /**
   * Save baseline to file
   */
  private saveBaseline(engagementId: string, statistics: BaselineStatistics): void {
    const filename = `baseline_${engagementId}.json`;
    const filepath = join(this.config.storagePath, filename);
    
    const baselineData = {
      engagementId,
      capturedAt: new Date().toISOString(),
      config: this.config,
      statistics
    };

    writeFileSync(filepath, JSON.stringify(baselineData, null, 2), 'utf8');
    console.log(`[PIVOT] Baseline saved to ${filepath}`);
  }

  /**
   * Get baseline for a specific engagement
   */
  getBaseline(engagementId: string): BaselineStatistics | null {
    const filename = `baseline_${engagementId}.json`;
    const filepath = join(this.config.storagePath, filename);

    if (!existsSync(filepath)) {
      return null;
    }

    try {
      const data = JSON.parse(readFileSync(filepath, 'utf8'));
      return data.statistics;
    } catch (error) {
      console.error(`[PIVOT] Error reading baseline for engagement ${engagementId}:`, error);
      return null;
    }
  }

  /**
   * Check if baseline exists for engagement
   */
  hasBaseline(engagementId: string): boolean {
    const filename = `baseline_${engagementId}.json`;
    const filepath = join(this.config.storagePath, filename);
    return existsSync(filepath);
  }

  /**
   * Delete baseline for a specific engagement
   */
  deleteBaseline(engagementId: string): boolean {
    const filename = `baseline_${engagementId}.json`;
    const filepath = join(this.config.storagePath, filename);

    if (existsSync(filepath)) {
      try {
        // In a real implementation, we would use fs.unlinkSync
        // For now, just return true to indicate it would be deleted
        console.log(`[PIVOT] Would delete baseline at ${filepath}`);
        return true;
      } catch (error) {
        console.error(`[PIVOT] Error deleting baseline for engagement ${engagementId}:`, error);
        return false;
      }
    }
    return false;
  }
}