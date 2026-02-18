// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * PIVOT - Phase 1: Baseline Capture Module
 * ResponseDelta calculator for computing differences between fingerprints
 */

import { ResponseFingerprint, ResponseDelta as ResponseDeltaType } from '../../types/pivot.js';

/**
 * ResponseDelta calculator - Pure computation of differences between fingerprints
 */
export class ResponseDeltaCalculator {
  /**
   * Calculate delta between two response fingerprints
   */
  calculateDelta(
    baseline: ResponseFingerprint,
    current: ResponseFingerprint,
    baselineStats?: { meanResponseTime: number; stdDevResponseTime: number },
    mutationPayload?: string
  ): ResponseDeltaType {
    // Status code change
    const statusChanged = baseline.status_code !== current.status_code;
    
    // Error class change
    const errorClassChanged = baseline.error_class !== current.error_class;
    
    // Body hash change
    const bodyHashChanged = baseline.body_hash !== current.body_hash;
    
    // Body length delta (percentage change)
    const bodyLengthDelta = baseline.body_length === 0 
      ? (current.body_length > 0 ? 1.0 : 0.0)
      : Math.abs(current.body_length - baseline.body_length) / baseline.body_length;
    
    // Timing delta in standard deviations from baseline
    let timingDeltaStd = 0;
    if (baselineStats && baselineStats.stdDevResponseTime > 0) {
      const currentMeanTime = current.response_time_ms.reduce((a, b) => a + b, 0) / current.response_time_ms.length;
      timingDeltaStd = Math.abs(currentMeanTime - baselineStats.meanResponseTime) / baselineStats.stdDevResponseTime;
    }
    
    // Header analysis
    const headersAdded: string[] = [];
    const headersRemoved: string[] = [];
    const headersChanged: Record<string, { old: string; new: string }> = {};
    
    // Find added headers
    for (const [key, value] of Object.entries(current.headers)) {
      const baselineValue = baseline.headers[key];
      if (baselineValue === undefined) {
        headersAdded.push(key);
      } else if (baselineValue !== value) {
        headersChanged[key] = {
          old: baselineValue,
          new: value
        };
      }
    }
    
    // Find removed headers
    for (const [key] of Object.entries(baseline.headers)) {
      if (!(key in current.headers)) {
        headersRemoved.push(key);
      }
    }
    
    // Check if mutation payload appears in response body
    const bodyContainsTarget = this.checkBodyContainsTarget(current.raw_body_sample, mutationPayload || '');
    
    // Raw body similarity (token-based comparison)
    const rawBodySimilarity = this.calculateTokenSimilarity(
      baseline.raw_body_sample,
      current.raw_body_sample
    );
    
    return {
      status_changed: statusChanged,
      error_class_changed: errorClassChanged,
      body_hash_changed: bodyHashChanged,
      body_length_delta: bodyLengthDelta,
      timing_delta_std: timingDeltaStd,
      headers_added: headersAdded,
      headers_removed: headersRemoved,
      headers_changed: headersChanged,
      body_contains_target: bodyContainsTarget,
      raw_body_similarity: rawBodySimilarity
    };
  }
  
  /**
   * Check if response body contains target string (mutation payload)
   */
  private checkBodyContainsTarget(body: string, target: string): boolean {
    if (!target) return false;
    return body.toLowerCase().includes(target.toLowerCase());
  }
  
  /**
   * Calculate similarity between two strings using token-based comparison (0.0 to 1.0)
   * Tokenizes by splitting on whitespace and common delimiters
   */
  private calculateTokenSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (!str1 || !str2) return 0.0;
    
    // Tokenize strings (split on whitespace and common delimiters)
    const tokenize = (text: string): Set<string> => {
      return new Set(
        text.toLowerCase()
          .split(/[\s.,;:!?()\[\]{}'"`<>|\\\/]+/)
          .filter(token => token.length > 0)
      );
    };
    
    const tokens1 = tokenize(str1);
    const tokens2 = tokenize(str2);
    
    if (tokens1.size === 0 && tokens2.size === 0) return 1.0;
    if (tokens1.size === 0 || tokens2.size === 0) return 0.0;
    
    // Calculate Jaccard similarity
    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);
    
    return intersection.size / union.size;
  }
  
  /**
   * Calculate similarity between two strings (0.0 to 1.0)
   * Uses simple character overlap for demonstration (legacy method)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (!str1 || !str2) return 0.0;
    
    const set1 = new Set(str1);
    const set2 = new Set(str2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }
  
  /**
   * Calculate timing statistics from multiple fingerprints
   */
  calculateTimingStatistics(fingerprints: ResponseFingerprint[]): {
    meanResponseTime: number;
    stdDevResponseTime: number;
  } {
    if (fingerprints.length === 0) {
      return { meanResponseTime: 0, stdDevResponseTime: 0 };
    }
    
    // Flatten all response times
    const allResponseTimes = fingerprints.flatMap(fp => fp.response_time_ms);
    
    // Calculate mean
    const meanResponseTime = allResponseTimes.reduce((a, b) => a + b, 0) / allResponseTimes.length;
    
    // Calculate variance
    const variance = allResponseTimes.reduce((a, b) => a + Math.pow(b - meanResponseTime, 2), 0) / allResponseTimes.length;
    
    // Standard deviation
    const stdDevResponseTime = Math.sqrt(variance);
    
    return { meanResponseTime, stdDevResponseTime };
  }
  
  /**
   * Check if delta indicates any change (for quick filtering)
   */
  hasAnyChange(delta: ResponseDeltaType): boolean {
    return (
      delta.status_changed ||
      delta.error_class_changed ||
      delta.body_hash_changed ||
      delta.body_length_delta > 0.01 || // 1% change threshold
      delta.timing_delta_std > 0.5 || // 0.5 standard deviations
      delta.headers_added.length > 0 ||
      delta.headers_removed.length > 0 ||
      Object.keys(delta.headers_changed).length > 0 ||
      delta.body_contains_target ||
      delta.raw_body_similarity < 0.95 // 95% similarity threshold
    );
  }
  
  /**
   * Get summary of changes for logging
   */
  getChangeSummary(delta: ResponseDeltaType): string {
    const changes: string[] = [];
    
    if (delta.status_changed) changes.push('status');
    if (delta.error_class_changed) changes.push('error_class');
    if (delta.body_hash_changed) changes.push('body_hash');
    if (delta.body_length_delta > 0.01) changes.push(`body_length(${delta.body_length_delta.toFixed(2)})`);
    if (delta.timing_delta_std > 0.5) changes.push(`timing(${delta.timing_delta_std.toFixed(2)}σ)`);
    if (delta.headers_added.length > 0) changes.push(`headers_added(${delta.headers_added.length})`);
    if (delta.headers_removed.length > 0) changes.push(`headers_removed(${delta.headers_removed.length})`);
    if (Object.keys(delta.headers_changed).length > 0) changes.push(`headers_changed(${Object.keys(delta.headers_changed).length})`);
    if (delta.body_contains_target) changes.push('payload_reflected');
    if (delta.raw_body_similarity < 0.95) changes.push(`similarity(${delta.raw_body_similarity.toFixed(2)})`);
    
    return changes.length > 0 ? changes.join(', ') : 'no_change';
  }
  
  /**
   * Calculate confidence score for delta (0.0 to 1.0)
   * Higher score indicates more significant/interesting change
   */
  calculateConfidenceScore(delta: ResponseDeltaType): number {
    let score = 0;
    
    // Weight different types of changes
    if (delta.status_changed) score += 0.3;
    if (delta.error_class_changed) score += 0.2;
    if (delta.body_hash_changed) score += 0.15;
    if (delta.body_contains_target) score += 0.5; // High weight for payload reflection
    
    // Continuous changes with thresholds
    if (delta.body_length_delta > 0.1) score += 0.1;
    if (delta.body_length_delta > 0.3) score += 0.2;
    
    if (delta.timing_delta_std > 1.0) score += 0.1;
    if (delta.timing_delta_std > 2.0) score += 0.2;
    
    // Header changes
    if (delta.headers_added.length > 0) score += 0.05 * delta.headers_added.length;
    if (delta.headers_removed.length > 0) score += 0.03 * delta.headers_removed.length;
    if (Object.keys(delta.headers_changed).length > 0) score += 0.02 * Object.keys(delta.headers_changed).length;
    
    // Similarity penalty
    if (delta.raw_body_similarity < 0.8) score += 0.1;
    if (delta.raw_body_similarity < 0.5) score += 0.2;
    
    // Cap at 1.0
    return Math.min(score, 1.0);
  }
}