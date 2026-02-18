// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * PIVOT - Adversarial Mutation Engine Type Definitions
 * Phase 0: Foundation Contracts
 */

/**
 * Agent phases in the engagement lifecycle
 */
export enum AgentPhase {
  RECON = 'recon',
  EXPLOITATION = 'exploitation',
  VERIFICATION = 'verification',
  REPORTING = 'reporting'
}

/**
 * Routing lanes available for obstacle resolution
 */
export enum RoutingLane {
  DETERMINISTIC = 'deterministic',
  FREESTYLE = 'freestyle',
  HYBRID = 'hybrid'
}

/**
 * Obstacle classifications based on pattern matching
 */
export enum ObstacleClassification {
  WAF_BLOCK = 'WAF_BLOCK',
  SQL_INJECTION_SURFACE = 'SQL_INJECTION_SURFACE',
  CHARACTER_FILTER = 'CHARACTER_FILTER',
  TEMPLATE_INJECTION_SURFACE = 'TEMPLATE_INJECTION_SURFACE',
  RATE_LIMIT = 'RATE_LIMIT',
  TIMEOUT_OR_DROP = 'TIMEOUT_OR_DROP',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Record of a single mutation attempt
 */
export interface AttemptRecord {
  timestamp: string; // ISO8601
  strategy: string;
  payload: string;
  response_fingerprint: ResponseFingerprint;
  score_vector?: ScoreVector;
}

/**
 * Raw terminal output capture from agent execution
 */
export interface RawTerminalCapture {
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
}

/**
 * Fingerprint of a server response for delta comparison
 */
export interface ResponseFingerprint {
  status_code: number;
  body_hash: string; // SHA-256 of response body
  body_length: number;
  response_time_ms: number[]; // array of samples for statistical analysis
  headers: Record<string, string>;
  error_class: string | null; // e.g., "SyntaxError", "TypeError", "ConnectionRefused"
  raw_body_sample: string; // first 2000 characters for pattern matching
}

/**
 * Core event emitted when an agent encounters an obstacle
 */
export interface ObstacleEvent {
  agent_id: string;
  phase: AgentPhase;
  obstacle_class: ObstacleClassification | null; // null if unknown
  attempted_strategy: string;
  attempt_history: AttemptRecord[];
  terminal_output: RawTerminalCapture;
  baseline_fingerprint: ResponseFingerprint;
  current_response: ResponseFingerprint;
  timestamp: string; // ISO8601
  engagement_id: string;
}

/**
 * Vector of scores from deterministic rule evaluation
 */
export interface ScoreVector {
  status_changed: number;      // 0 or 1
  error_class_changed: number; // 0 or 1
  body_contains_target: number; // 0 or 1
  timing_delta: number;        // 0.0 to 1.0 (normalized)
  payload_reflected: number;   // 0 or 1
  body_length_delta: number;   // 0.0 to 1.0 (normalized)
  new_headers: number;         // 0 or 1
  weighted_total: number;      // computed weighted sum
  confidence_decay?: boolean;  // true if same mutation family shows declining scores
}

/**
 * Result of a mutation attempt
 */
export interface MutationResult {
  strategy_used: string;
  lane_routed: RoutingLane;
  payload: string;
  confidence: number; // 0.0 to 1.0
  score_vector: ScoreVector;
  next_steps: string[];
  abandon: boolean;
  human_review_flag: boolean;
  trace_id: string;
}

/**
 * Routing decision made by the intelligent router
 */
export interface RoutingDecision {
  lane: RoutingLane;
  confidence: number; // 0.0 to 1.0
  matched_pattern: string | null;
  classification: ObstacleClassification;
  reasoning: string; // one line, no model — just matched rule description
  fallback_eligible: boolean;
}

/**
 * Pattern match result from signature matching
 */
export interface PatternMatch {
  pattern_id: string;
  confidence: number; // 0.0 to 1.0
  matched_text: string;
  start_index: number;
  end_index: number;
}

/**
 * Signal rule definition for deterministic scoring
 */
export interface SignalRule {
  signal: string;
  weight: number;
  type: 'binary' | 'threshold';
  threshold?: number; // for threshold type rules
}

/**
 * Mutation family definition
 */
export interface MutationFamily {
  name: string;
  family: string;
  variants: string[];
  priority: number;
  applicable_classifications: ObstacleClassification[];
}

/**
 * Pattern signature definition
 */
export interface PatternSignature {
  id: string;
  match: string[]; // array of regex or string patterns
  class: ObstacleClassification;
  lane_recommendation: RoutingLane;
  confidence_weight: number; // 0.0 to 1.0
  default_weight: number; // initial routing weight
}

/**
 * Routing weight for pattern signatures
 */
export interface RoutingWeight {
  pattern_id: string;
  weight: number;
  last_updated: string; // ISO8601
  update_reason: string;
  engagement_count: number; // number of engagements this weight has been used in
}

/**
 * Delta between two response fingerprints
 */
export interface ResponseDelta {
  status_changed: boolean;
  error_class_changed: boolean;
  body_hash_changed: boolean;
  body_length_delta: number; // percentage change
  timing_delta_std: number; // change in standard deviations from baseline
  headers_added: string[];
  headers_removed: string[];
  headers_changed: Record<string, { old: string, new: string }>;
  body_contains_target: boolean; // whether mutation payload appears in response
  raw_body_similarity: number; // 0.0 to 1.0 similarity score
}

/**
 * Freestyle suggestion from LLM
 */
export interface FreestyleSuggestion {
  strategy: string;
  mutation_family: string;
  payload_template: string;
  rationale: string; // max 20 words
}

/**
 * Review report generated post-engagement
 */
export interface ReviewReport {
  engagement_id: string;
  generated_at: string; // ISO8601
  misrouted_obstacles: Array<{
    obstacle_id: string;
    original_lane: RoutingLane;
    recommended_lane: RoutingLane;
    confidence_delta: number;
  }>;
  proposed_weight_changes: Array<{
    pattern_id: string;
    current_weight: number;
    proposed_weight: number;
    reason: string;
  }>;
  new_pattern_candidates: Array<{
    terminal_output_sample: string;
    suggested_classification: ObstacleClassification;
    confidence: number;
  }>;
  anomaly_summary: {
    total_anomalies: number;
    classified_anomalies: number;
    unclassified_anomalies: number;
  };
}