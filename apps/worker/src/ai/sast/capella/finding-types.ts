// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Capella's on-disk record shapes and vocabularies.
 *
 * A transcription of the upstream Mantis finding contract, minus the
 * fields for stages Capella does not run (patch, reattack, chain, and the
 * whole snapshot/provenance layer). The calibrate surface is retained because
 * calibrate is kept report-only.
 *
 * The vocabularies are exported as `readonly` arrays so the collector schemas and
 * the Node-side validators share one source of truth; drift between the two is
 * how an agent ships a value the schema forbids.
 */

// === Enumerated vocabularies (upstream finding contract) ===

export const CAPELLA_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type CapellaSeverity = (typeof CAPELLA_SEVERITIES)[number];

export const CAPELLA_STATUSES = [
  'VALID',
  'FALSE_POSITIVE',
  'PROVISIONALLY_VALID',
  'NEEDS_RESEARCH',
  'DUPLICATE',
] as const;
export type CapellaStatus = (typeof CAPELLA_STATUSES)[number];

/**
 * The statuses a review verdict may assign. `DUPLICATE` is excluded: only
 * dedupe assigns it, through a different tool.
 */
export const CAPELLA_REVIEW_STATUSES = ['VALID', 'FALSE_POSITIVE', 'PROVISIONALLY_VALID', 'NEEDS_RESEARCH'] as const;
export type CapellaReviewStatus = (typeof CAPELLA_REVIEW_STATUSES)[number];

export const CAPELLA_VIABILITIES = ['VIABLE', 'NON_VIABLE', 'SAMPLE_OR_TEST', 'CONDITIONAL_VIABLE'] as const;
export type CapellaViability = (typeof CAPELLA_VIABILITIES)[number];

/**
 * The full upstream `repro_status` enum, kept for record fidelity. Capella can
 * only ever *set* `statically_confirmed` or `not_attempted`: it has no
 * execution sandbox, so `reproduced` and `failed_to_reproduce` are unreachable.
 */
export const CAPELLA_REPRO_STATUSES = [
  'reproduced',
  'statically_confirmed',
  'not_attempted',
  'failed_to_reproduce',
] as const;
export type CapellaReproStatus = (typeof CAPELLA_REPRO_STATUSES)[number];

/** The classifications the static-confirmation stage may assign. */
export const CAPELLA_CONFIRM_STATUSES = ['statically_confirmed', 'not_attempted'] as const;
export type CapellaConfirmStatus = (typeof CAPELLA_CONFIRM_STATUSES)[number];

export const CAPELLA_PRIVILEGES = ['NONE', 'LOW', 'HIGH'] as const;
export type CapellaPrivileges = (typeof CAPELLA_PRIVILEGES)[number];

export const CAPELLA_ATTACKER_POSITIONS = [
  'EXTERNAL',
  'INTERNAL_NETWORK',
  'IN_CLUSTER',
  'LOCAL',
  'HOST_SYSTEM',
  'SUPPLY_CHAIN',
  'PHYSICAL_TEMPORARY',
  'PHYSICAL_LONG_TERM',
] as const;
export type CapellaAttackerPosition = (typeof CAPELLA_ATTACKER_POSITIONS)[number];

export const CAPELLA_USER_INTERACTIONS = ['NONE', 'REQUIRED'] as const;
export type CapellaUserInteraction = (typeof CAPELLA_USER_INTERACTIONS)[number];

export const CAPELLA_AVAILABILITY_TIERS = ['CRITICAL', 'STANDARD', 'LOW_CRITICALITY'] as const;
export type CapellaAvailabilityTier = (typeof CAPELLA_AVAILABILITY_TIERS)[number];

export const CAPELLA_EXPOSURES = ['EXPOSED', 'INTERNAL', 'PRIVILEGED'] as const;
export type CapellaExposure = (typeof CAPELLA_EXPOSURES)[number];

// === Checklists ===

export const CAPELLA_TRIAGE_OUTCOMES = ['PASS', 'FAIL', 'UNKNOWN', 'NOT_APPLICABLE'] as const;
export type CapellaTriageOutcome = (typeof CAPELLA_TRIAGE_OUTCOMES)[number];

/** The 13 negative constraints, in schema order. */
export const TRIAGE_RULE_KEYS = [
  'ignore_hypothetical_misuse',
  'ignore_missing_hygiene',
  'require_strict_reproducibility',
  'avoid_pedantic_linting',
  'no_security_flaw_stretching',
  'evaluate_questionable_file_paths',
  'ignore_resource_exhaustion_dos',
  'intrinsic_security_flaws',
  'verify_mitigations_pragmatically',
  'refine_code_paths_strictly',
  'ignore_simd_vector_padding',
  'ensure_source_code_coherence',
  'verify_attacker_control_of_source',
] as const;
export type TriageRuleKey = (typeof TRIAGE_RULE_KEYS)[number];

export interface TriageRuleEvaluation {
  outcome: CapellaTriageOutcome;
  /** Required whenever outcome is FAIL, UNKNOWN or NOT_APPLICABLE. */
  reason?: string;
}

export type TriageChecklist = Record<TriageRuleKey, TriageRuleEvaluation>;

export const CAPELLA_CALIBRATION_OUTCOMES = ['APPLIES', 'DOES_NOT_APPLY', 'UNKNOWN'] as const;
export type CapellaCalibrationOutcome = (typeof CAPELLA_CALIBRATION_OUTCOMES)[number];

/** The 27 sanity-cap rules, in schema order. */
export const CALIBRATION_RULE_KEYS = [
  'repro_failure',
  'unreachable_inputs',
  'third_party_reachability',
  'minor_config_hygiene',
  'non_security_critical',
  'vague_code_paths',
  'unreliable_triggers',
  'prerequisite_shell',
  'physical_long_term',
  'trusted_controller_zero_delta',
  'standard_host_attacks',
  'static_confirmation',
  'strict_xss',
  'internal_nested',
  'probabilistic_llm',
  'supply_chain_prerequisites',
  'non_default_config',
  'confidential_computing_host',
  'trusted_controller_critical_bypass',
  'local_attack_vector',
  'self_contained_blast',
  'rarely_exposed',
  'equivalent_primitives',
  'documented_insecure_config',
  'physical_temporary',
  'high_privilege_external',
  'trusted_controller_standard_bypass',
] as const;
export type CalibrationRuleKey = (typeof CALIBRATION_RULE_KEYS)[number];

export interface CalibrationRuleEvaluation {
  outcome: CapellaCalibrationOutcome;
  /** Required whenever outcome is APPLIES or UNKNOWN. */
  reason?: string;
}

export type CalibrationChecklist = Record<CalibrationRuleKey, CalibrationRuleEvaluation>;

// === History ===

/**
 * One entry in a finding's audit trail. Simplified from the upstream
 * `history_entry`: there is no multi-pass loop, so no `pass_number`, and Node
 * writes the entries so the shape is ours to set.
 */
export interface CapellaHistoryEntry {
  stage: string;
  action: string;
  details: string;
  timestamp: string;
}

// === The finding record ===

/**
 * The Capella finding record (`findings/<id>.json`).
 *
 * A subset of Mantis's `finding` object: the patch, reattack, chain and
 * snapshot/provenance fields are dropped with their stages, and `outrage_commentary`
 * / `executive_summary` go with the dropped report stage. The calibrate fields
 * are kept because calibrate is retained report-only.
 */
export interface CapellaFinding {
  // Identity + creation (researcher)
  id: string;
  title: string;
  description: string;
  code_paths: string[];
  impact: string;
  severity: CapellaSeverity;
  privileges_required: CapellaPrivileges;
  attacker_position: CapellaAttackerPosition;
  user_interaction: CapellaUserInteraction;
  mitigation: string;
  /** Required here where upstream makes it optional: it keys the dedup identity. */
  cwe: string;
  history: CapellaHistoryEntry[];
  status: CapellaStatus;

  // Dedupe
  duplicate_of?: string;

  // Review
  reasoning?: string;
  repro_hints?: string;
  triage_checklist?: TriageChecklist;

  // Critic
  production_viability?: CapellaViability;
  critic_reasoning?: string;

  // Confirm (static only)
  repro_status?: CapellaReproStatus;

  // Calibrate (report-only)
  impact_score?: number;
  likelihood_score?: number;
  availability_tier?: CapellaAvailabilityTier | null;
  inferred_exposure?: CapellaExposure;
  mantis_risk_score?: number;
  priority?: CapellaSeverity;
  sanity_triage_applied?: string | null;
  calibration_checklist?: CalibrationChecklist;

  // Bookkeeping (ours, not upstream's)
  recordedAt: number;
}
