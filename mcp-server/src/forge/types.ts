// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Skill Forge — Shared Type Definitions
 *
 * All interfaces shared across forge modules: profiler, analyzer,
 * optimizer, validator, versioner, and core orchestrator.
 */

// ---------------------------------------------------------------------------
// Profiler types
// ---------------------------------------------------------------------------

export type SkillType = 'mcp_tool' | 'agent_phase';

/** A single row written to execution_log */
export interface ExecutionLogEntry {
  id?: number;
  session_id: string;
  skill_type: SkillType;
  skill_id: string;
  started_at: string; // ISO 8601
  finished_at: string | null;
  duration_ms: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  success: boolean;
  error_type: string | null;
  error_message: string | null;
  version_id: string;
  metadata: string | null; // JSON blob
}

/** Pentest-specific metadata stored in execution_log.metadata (agent phases) */
export interface AgentPhaseMetadata {
  agent_name: string;
  phase: string;
  target_url: string;
  repo_path: string;
  prompt_name: string;
  prompt_hash: string;
  turn_count: number;
  tools_called: string[];
  deliverables_produced: string[];
  vulns_found: number;
  exploits_attempted: number;
  exploits_succeeded: number;
  config_hash: string;
}

/** Pentest-specific metadata for MCP tool invocations */
export interface ToolMetadata {
  caller_agent: string;
  input_size_bytes: number;
  output_size_bytes: number;
  validation_performed: boolean;
}

// ---------------------------------------------------------------------------
// Analyzer types
// ---------------------------------------------------------------------------

export type OptimizationReason =
  | 'slow'
  | 'token_heavy'
  | 'high_failure'
  | 'cost_outlier'
  | 'degrading_trend';

export type Priority = 'high' | 'medium' | 'low';

export interface SkillStats {
  skill_id: string;
  total_runs: number;
  avg_duration_ms: number;
  p95_duration_ms: number;
  avg_tokens_in: number;
  avg_tokens_out: number;
  avg_cost_usd: number;
  success_rate: number; // 0.0 to 1.0
  last_run_at: string;
  trend: 'improving' | 'degrading' | 'stable';
}

export interface OptimizationCandidate {
  skillId: string;
  skillType: SkillType;
  reason: OptimizationReason;
  currentMetrics: {
    avgDurationMs: number;
    avgTokensIn: number;
    avgTokensOut: number;
    successRate: number;
    avgCostUsd: number;
  };
  threshold: { metric: string; limit: number; actual: number };
  priority: Priority;
  suggestedAction: string;
}

// ---------------------------------------------------------------------------
// Optimizer types
// ---------------------------------------------------------------------------

export interface OptimizationRequest {
  skillId: string;
  skillType: SkillType;
  currentContent: string; // prompt text or tool source
  profileData: SkillStats;
  analysisReport: OptimizationCandidate;
  constraints: {
    maxTokenReduction: number; // target: e.g. 0.50 = 50%
    preserveOutputSchema: boolean;
    preserveSemanticMeaning: boolean;
  };
}

export interface OptimizationResult {
  skillId: string;
  optimizedContent: string;
  changes: string[]; // human-readable list of changes
  expectedImprovement: {
    tokenReduction: string; // e.g. "~45%"
    speedImprovement: string;
  };
  versionId: string; // auto-generated: v2, v3, ...
}

// ---------------------------------------------------------------------------
// Validator types
// ---------------------------------------------------------------------------

export interface AggregateMetrics {
  avgDurationMs: number;
  avgTokensIn: number;
  avgTokensOut: number;
  avgCostUsd: number;
  successRate: number;
  runCount: number;
}

export interface OutputComparison {
  semanticallyIdentical: boolean;
  diffSummary: string;
  structuralMatch: boolean;
}

export interface ABTestResult {
  skillId: string;
  originalVersion: string;
  candidateVersion: string;
  runs: number;
  originalMetrics: AggregateMetrics;
  candidateMetrics: AggregateMetrics;
  outputComparison: OutputComparison;
  improvement: {
    durationPct: number; // negative = faster
    tokensPct: number; // negative = fewer tokens
    costPct: number;
    successRateDelta: number;
  };
  recommendation: 'promote' | 'reject' | 'needs_review';
  promotionEligible: boolean;
}

// ---------------------------------------------------------------------------
// Versioner types
// ---------------------------------------------------------------------------

export interface SkillVersion {
  id?: number;
  skill_id: string;
  version_id: string; // 'v1', 'v2', ...
  created_at: string;
  content_hash: string; // sha256
  content_path: string; // path to versioned file
  is_active: boolean;
  promoted_from: string | null;
  promotion_reason: string | null;
  rollback_of: string | null;
}

// ---------------------------------------------------------------------------
// Forge Core types
// ---------------------------------------------------------------------------

export interface ForgeConfig {
  enabled: boolean;
  db_path: string;
  auto_promote: boolean;
  thresholds: {
    slow_tool_ms: number;
    slow_agent_ms: number;
    min_success_rate: number;
    max_token_ratio: number;
    max_cost_per_run: number;
    improvement_threshold: number;
  };
  ab_test: {
    min_runs: number;
    confidence_level: number;
  };
  versioning: {
    max_versions_per_skill: number;
    versions_dir: string;
  };
}

export type ForgeAction =
  | { type: 'promote'; skillId: string; versionId: string; reason: string }
  | { type: 'reject'; skillId: string; versionId: string; reason: string }
  | { type: 'needs_review'; skillId: string; versionId: string; report: ABTestResult };

export interface ForgeCycleReport {
  timestamp: string;
  candidatesAnalyzed: number;
  optimizationsAttempted: number;
  promotions: number;
  rejections: number;
  needsReview: number;
  details: ForgeAction[];
}
