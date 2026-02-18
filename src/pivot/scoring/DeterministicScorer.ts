// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * PIVOT - Phase 2: Deterministic Scoring Engine
 * DeterministicScorer for evaluating response deltas against signal rules
 */

import { ResponseDelta, ScoreVector, SignalRule } from '../../types/pivot.js';
import { SignalRuleRegistry } from './SignalRuleRegistry.js';

/**
 * Confidence decay tracking for mutation families
 */
interface ConfidenceDecayTracker {
  mutationFamily: string;
  scores: number[];
  lastScore: number;
  decayDetected: boolean;
}

/**
 * DeterministicScorer - Evaluates ResponseDelta against SignalRuleRegistry
 */
export class DeterministicScorer {
  private ruleRegistry: SignalRuleRegistry;
  private confidenceDecayTrackers: Map<string, ConfidenceDecayTracker> = new Map();
  private attemptHistory: Map<string, number> = new Map(); // obstacle_id -> attempt_count

  constructor(ruleRegistry: SignalRuleRegistry) {
    this.ruleRegistry = ruleRegistry;
  }

  /**
   * Evaluate a response delta and return a score vector
   */
  evaluateDelta(
    delta: ResponseDelta,
    obstacleId: string,
    mutationFamily?: string
  ): ScoreVector {
    const scoreVector: ScoreVector = {
      status_changed: 0,
      error_class_changed: 0,
      body_contains_target: 0,
      timing_delta: 0,
      payload_reflected: 0,
      body_length_delta: 0,
      new_headers: 0,
      weighted_total: 0
    };

    // Get all rules from registry
    const rules = this.ruleRegistry.getRules();
    
    // Evaluate each rule
    for (const rule of rules) {
      const ruleScore = this.evaluateRule(rule, delta);
      this.applyRuleToVector(rule, ruleScore, scoreVector);
    }

    // Calculate weighted total
    scoreVector.weighted_total = this.calculateWeightedTotal(scoreVector);

    // Track confidence decay for mutation families
    if (mutationFamily) {
      this.trackConfidenceDecay(mutationFamily, scoreVector.weighted_total);
      
      // Apply confidence decay flag if detected
      const tracker = this.confidenceDecayTrackers.get(mutationFamily);
      if (tracker?.decayDetected) {
        // In the actual ScoreVector type, we'd add a confidence_decay flag
        // For now, we'll log it
        console.log(`[PIVOT] Confidence decay detected for mutation family: ${mutationFamily}`);
      }
    }

    // Track attempt count
    this.incrementAttemptCount(obstacleId);

    return scoreVector;
  }

  /**
   * Evaluate a single rule against delta
   */
  private evaluateRule(rule: SignalRule, delta: ResponseDelta): number {
    switch (rule.signal) {
      case 'status_changed':
        return delta.status_changed ? 1 : 0;
      
      case 'error_class_changed':
        return delta.error_class_changed ? 1 : 0;
      
      case 'body_contains_target':
        return delta.body_contains_target ? 1 : 0;
      
      case 'timing_delta':
        return this.evaluateThresholdRule(delta.timing_delta_std, rule.threshold || 0);
      
      case 'payload_reflected':
        // payload_reflected is same as body_contains_target
        return delta.body_contains_target ? 1 : 0;
      
      case 'body_length_delta':
        return this.evaluateThresholdRule(delta.body_length_delta, rule.threshold || 0);
      
      case 'new_headers_present':
        return delta.headers_added.length > 0 ? 1 : 0;
      
      default:
        // Handle custom signals
        return this.evaluateCustomRule(rule.signal, delta);
    }
  }

  /**
   * Evaluate threshold rule (returns 1 if exceeds threshold, 0 otherwise)
   */
  private evaluateThresholdRule(value: number, threshold: number): number {
    return value >= threshold ? 1 : 0;
  }

  /**
   * Evaluate custom rule (placeholder for extension)
   */
  private evaluateCustomRule(signal: string, delta: ResponseDelta): number {
    // Custom rule evaluation logic would go here
    // For now, return 0 for unknown signals
    console.warn(`[PIVOT] Unknown signal: ${signal}`);
    return 0;
  }

  /**
   * Apply rule score to score vector
   */
  private applyRuleToVector(rule: SignalRule, ruleScore: number, vector: ScoreVector): void {
    const weight = rule.weight || 0;
    
    switch (rule.signal) {
      case 'status_changed':
        vector.status_changed = ruleScore * weight;
        break;
      
      case 'error_class_changed':
        vector.error_class_changed = ruleScore * weight;
        break;
      
      case 'body_contains_target':
        vector.body_contains_target = ruleScore * weight;
        break;
      
      case 'timing_delta':
        vector.timing_delta = ruleScore * weight;
        break;
      
      case 'payload_reflected':
        vector.payload_reflected = ruleScore * weight;
        break;
      
      case 'body_length_delta':
        vector.body_length_delta = ruleScore * weight;
        break;
      
      case 'new_headers_present':
        vector.new_headers = ruleScore * weight;
        break;
    }
  }

  /**
   * Calculate weighted total from score vector
   */
  private calculateWeightedTotal(vector: ScoreVector): number {
    return (
      vector.status_changed +
      vector.error_class_changed +
      vector.body_contains_target +
      vector.timing_delta +
      vector.payload_reflected +
      vector.body_length_delta +
      vector.new_headers
    );
  }

  /**
   * Track confidence decay for mutation families
   */
  private trackConfidenceDecay(mutationFamily: string, currentScore: number): void {
    if (!this.confidenceDecayTrackers.has(mutationFamily)) {
      this.confidenceDecayTrackers.set(mutationFamily, {
        mutationFamily,
        scores: [],
        lastScore: currentScore,
        decayDetected: false
      });
    }

    const tracker = this.confidenceDecayTrackers.get(mutationFamily)!;
    tracker.scores.push(currentScore);
    tracker.lastScore = currentScore;

    // Check for decay (declining scores across window)
    const windowSize = this.ruleRegistry.getConfidenceDecayConfig().window_size;
    const decayThreshold = this.ruleRegistry.getConfidenceDecayConfig().decay_threshold;

    if (tracker.scores.length >= windowSize) {
      const recentScores = tracker.scores.slice(-windowSize);
      const isDecaying = this.checkScoreDecay(recentScores, decayThreshold);
      
      if (isDecaying && !tracker.decayDetected) {
        tracker.decayDetected = true;
        console.log(`[PIVOT] Confidence decay detected for ${mutationFamily}`);
      } else if (!isDecaying && tracker.decayDetected) {
        tracker.decayDetected = false;
      }

      // Keep only recent scores for memory efficiency
      if (tracker.scores.length > windowSize * 2) {
        tracker.scores = tracker.scores.slice(-windowSize);
      }
    }
  }

  /**
   * Check if scores are decaying (monotonically decreasing with significant drop)
   */
  private checkScoreDecay(scores: number[], threshold: number): boolean {
    if (scores.length < 2) return false;

    // Check if scores are generally decreasing
    let decreasingCount = 0;
    for (let i = 1; i < scores.length; i++) {
      if (scores[i] < scores[i - 1]) {
        decreasingCount++;
      }
    }

    // If most comparisons show decrease
    const isGenerallyDecreasing = decreasingCount >= Math.floor(scores.length * 0.7);
    
    // Check for significant drop from first to last
    const firstScore = scores[0];
    const lastScore = scores[scores.length - 1];
    const relativeDrop = firstScore > 0 ? (firstScore - lastScore) / firstScore : 0;
    
    return isGenerallyDecreasing && relativeDrop >= threshold;
  }

  /**
   * Increment attempt count for obstacle
   */
  private incrementAttemptCount(obstacleId: string): void {
    const currentCount = this.attemptHistory.get(obstacleId) || 0;
    this.attemptHistory.set(obstacleId, currentCount + 1);
  }

  /**
   * Get attempt count for obstacle
   */
  getAttemptCount(obstacleId: string): number {
    return this.attemptHistory.get(obstacleId) || 0;
  }

  /**
   * Reset attempt count for obstacle
   */
  resetAttemptCount(obstacleId: string): void {
    this.attemptHistory.delete(obstacleId);
  }

  /**
   * Check if obstacle should be abandoned based on attempts
   */
  shouldAbandon(obstacleId: string): boolean {
    const attemptCount = this.getAttemptCount(obstacleId);
    const abandonThreshold = this.ruleRegistry.getAbandonThreshold();
    return attemptCount >= abandonThreshold;
  }

  /**
   * Check if score indicates progress
   */
  isMakingProgress(score: number): boolean {
    const progressThreshold = this.ruleRegistry.getProgressThreshold();
    return score >= progressThreshold;
  }

  /**
   * Check if score confirms exploit
   */
  isExploitConfirmed(score: number): boolean {
    const exploitThreshold = this.ruleRegistry.getExploitConfirmThreshold();
    return score >= exploitThreshold;
  }

  /**
   * Get confidence decay status for mutation family
   */
  getConfidenceDecayStatus(mutationFamily: string): { decayDetected: boolean; recentScores: number[] } {
    const tracker = this.confidenceDecayTrackers.get(mutationFamily);
    if (!tracker) {
      return { decayDetected: false, recentScores: [] };
    }
    
    return {
      decayDetected: tracker.decayDetected,
      recentScores: [...tracker.scores]
    };
  }

  /**
   * Reset confidence decay tracking for mutation family
   */
  resetConfidenceDecayTracking(mutationFamily: string): void {
    this.confidenceDecayTrackers.delete(mutationFamily);
  }

  /**
   * Get score vector summary for logging
   */
  getScoreSummary(vector: ScoreVector): string {
    const parts: string[] = [];
    
    if (vector.status_changed > 0) parts.push(`status(${vector.status_changed.toFixed(2)})`);
    if (vector.error_class_changed > 0) parts.push(`error(${vector.error_class_changed.toFixed(2)})`);
    if (vector.body_contains_target > 0) parts.push(`target(${vector.body_contains_target.toFixed(2)})`);
    if (vector.timing_delta > 0) parts.push(`timing(${vector.timing_delta.toFixed(2)})`);
    if (vector.payload_reflected > 0) parts.push(`payload(${vector.payload_reflected.toFixed(2)})`);
    if (vector.body_length_delta > 0) parts.push(`length(${vector.body_length_delta.toFixed(2)})`);
    if (vector.new_headers > 0) parts.push(`headers(${vector.new_headers.toFixed(2)})`);
    
    return parts.length > 0 
      ? `${parts.join(', ')} [total: ${vector.weighted_total.toFixed(2)}]`
      : `no_signals [total: ${vector.weighted_total.toFixed(2)}]`;
  }

  /**
   * Get all active mutation families with decay status
   */
  getAllMutationFamilyStatus(): Array<{
    family: string;
    decayDetected: boolean;
    recentScoreCount: number;
    lastScore: number;
  }> {
    const result: Array<{
      family: string;
      decayDetected: boolean;
      recentScoreCount: number;
      lastScore: number;
    }> = [];

    for (const [family, tracker] of this.confidenceDecayTrackers.entries()) {
      result.push({
        family,
        decayDetected: tracker.decayDetected,
        recentScoreCount: tracker.scores.length,
        lastScore: tracker.lastScore
      });
    }

    return result;
  }
}