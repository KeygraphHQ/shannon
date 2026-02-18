// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * PIVOT - Phase 2: Deterministic Scoring Engine
 * SignalRuleRegistry for loading and managing signal rules
 */

import { SignalRule } from '../../types/pivot.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

/**
 * Signal rule configuration from YAML
 */
export interface SignalRuleConfig {
  rules: SignalRule[];
  thresholds: {
    progress: number;
    exploit_confirm: number;
    abandon: number;
  };
  confidence_decay?: {
    window_size: number;
    decay_threshold: number;
  };
  circuit_breaker?: {
    max_attempts: number;
    cooldown_ms: number;
  };
}

/**
 * SignalRuleRegistry - Loads rules from configs/signal-rules.yaml
 */
export class SignalRuleRegistry {
  private rules: SignalRule[] = [];
  private thresholds: {
    progress: number;
    exploit_confirm: number;
    abandon: number;
  };
  private confidenceDecay: {
    window_size: number;
    decay_threshold: number;
  };
  private circuitBreaker: {
    max_attempts: number;
    cooldown_ms: number;
  };
  private configPath: string;

  constructor(configPath: string = './configs/signal-rules.yaml') {
    this.configPath = configPath;
    this.thresholds = {
      progress: 1.5,
      exploit_confirm: 5.0,
      abandon: 8
    };
    this.confidenceDecay = {
      window_size: 3,
      decay_threshold: 0.3
    };
    this.circuitBreaker = {
      max_attempts: 12,
      cooldown_ms: 5000
    };
    
    this.loadRules();
  }

  /**
   * Load rules from YAML configuration file
   */
  private loadRules(): void {
    if (!existsSync(this.configPath)) {
      console.warn(`[PIVOT] Signal rules config not found at ${this.configPath}, using defaults`);
      this.loadDefaultRules();
      return;
    }

    try {
      const fileContent = readFileSync(this.configPath, 'utf8');
      const config = yaml.load(fileContent) as SignalRuleConfig;
      
      this.rules = config.rules || [];
      this.thresholds = config.thresholds || this.thresholds;
      this.confidenceDecay = config.confidence_decay || this.confidenceDecay;
      this.circuitBreaker = config.circuit_breaker || this.circuitBreaker;
      
      console.log(`[PIVOT] Loaded ${this.rules.length} signal rules from ${this.configPath}`);
    } catch (error) {
      console.error(`[PIVOT] Error loading signal rules from ${this.configPath}:`, error);
      this.loadDefaultRules();
    }
  }

  /**
   * Load default rules when config file is not available
   */
  private loadDefaultRules(): void {
    this.rules = [
      { signal: 'status_changed', weight: 2.0, type: 'binary' },
      { signal: 'error_class_changed', weight: 1.5, type: 'binary' },
      { signal: 'body_contains_target', weight: 5.0, type: 'binary' },
      { signal: 'timing_delta', weight: 0.8, type: 'threshold', threshold: 2.5 },
      { signal: 'payload_reflected', weight: 1.2, type: 'binary' },
      { signal: 'body_length_delta', weight: 0.6, type: 'threshold', threshold: 0.15 },
      { signal: 'new_headers_present', weight: 0.9, type: 'binary' }
    ];
    
    console.log('[PIVOT] Loaded default signal rules');
  }

  /**
   * Get all signal rules
   */
  getRules(): SignalRule[] {
    return [...this.rules];
  }

  /**
   * Get rule by signal name
   */
  getRule(signal: string): SignalRule | undefined {
    return this.rules.find(rule => rule.signal === signal);
  }

  /**
   * Add a new signal rule
   */
  addRule(rule: SignalRule): void {
    const existingIndex = this.rules.findIndex(r => r.signal === rule.signal);
    
    if (existingIndex >= 0) {
      this.rules[existingIndex] = rule;
      console.log(`[PIVOT] Updated rule for signal: ${rule.signal}`);
    } else {
      this.rules.push(rule);
      console.log(`[PIVOT] Added new rule for signal: ${rule.signal}`);
    }
  }

  /**
   * Remove a signal rule
   */
  removeRule(signal: string): boolean {
    const initialLength = this.rules.length;
    this.rules = this.rules.filter(rule => rule.signal !== signal);
    
    const removed = this.rules.length < initialLength;
    if (removed) {
      console.log(`[PIVOT] Removed rule for signal: ${signal}`);
    }
    
    return removed;
  }

  /**
   * Get progress threshold
   */
  getProgressThreshold(): number {
    return this.thresholds.progress;
  }

  /**
   * Get exploit confirmation threshold
   */
  getExploitConfirmThreshold(): number {
    return this.thresholds.exploit_confirm;
  }

  /**
   * Get abandon threshold
   */
  getAbandonThreshold(): number {
    return this.thresholds.abandon;
  }

  /**
   * Get confidence decay configuration
   */
  getConfidenceDecayConfig(): { window_size: number; decay_threshold: number } {
    return { ...this.confidenceDecay };
  }

  /**
   * Get circuit breaker configuration
   */
  getCircuitBreakerConfig(): { max_attempts: number; cooldown_ms: number } {
    return { ...this.circuitBreaker };
  }

  /**
   * Get weight for a specific signal
   */
  getWeight(signal: string): number {
    const rule = this.getRule(signal);
    return rule ? rule.weight : 0;
  }

  /**
   * Check if a rule exists for a signal
   */
  hasRule(signal: string): boolean {
    return this.rules.some(rule => rule.signal === signal);
  }

  /**
   * Get all binary signal rules
   */
  getBinaryRules(): SignalRule[] {
    return this.rules.filter(rule => rule.type === 'binary');
  }

  /**
   * Get all threshold signal rules
   */
  getThresholdRules(): SignalRule[] {
    return this.rules.filter(rule => rule.type === 'threshold');
  }

  /**
   * Get rule names as array
   */
  getRuleNames(): string[] {
    return this.rules.map(rule => rule.signal);
  }

  /**
   * Validate a signal rule
   */
  validateRule(rule: SignalRule): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!rule.signal || typeof rule.signal !== 'string') {
      errors.push('Signal name is required and must be a string');
    }

    if (typeof rule.weight !== 'number' || rule.weight < 0) {
      errors.push('Weight must be a non-negative number');
    }

    if (!['binary', 'threshold'].includes(rule.type)) {
      errors.push('Type must be either "binary" or "threshold"');
    }

    if (rule.type === 'threshold' && (typeof rule.threshold !== 'number' || rule.threshold < 0)) {
      errors.push('Threshold rules must have a non-negative threshold value');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Export rules to YAML format
   */
  exportToYaml(): string {
    const config: SignalRuleConfig = {
      rules: this.rules,
      thresholds: this.thresholds,
      confidence_decay: this.confidenceDecay,
      circuit_breaker: this.circuitBreaker
    };

    return yaml.dump(config, {
      indent: 2,
      lineWidth: -1 // No line width limit
    });
  }

  /**
   * Save rules to file
   */
  saveToFile(filePath?: string): boolean {
    const path = filePath || this.configPath;
    
    try {
      const yamlContent = this.exportToYaml();
      // In real implementation: writeFileSync(path, yamlContent, 'utf8')
      console.log(`[PIVOT] Would save ${this.rules.length} rules to ${path}`);
      return true;
    } catch (error) {
      console.error(`[PIVOT] Error saving rules to ${path}:`, error);
      return false;
    }
  }

  /**
   * Reload rules from config file
   */
  reload(): boolean {
    try {
      this.loadRules();
      return true;
    } catch (error) {
      console.error('[PIVOT] Error reloading rules:', error);
      return false;
    }
  }
}