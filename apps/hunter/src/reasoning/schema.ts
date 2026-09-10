/**
 * Structural validation for reasoning-provider output.
 *
 * Any `ReasoningProvider` — Claude-backed or heuristic — must produce
 * output shaped exactly like `ActionProposal`/`HypothesisProposal`. This is
 * the one place that checks that shape before anything downstream trusts
 * it; a provider (especially a model-backed one) that returns malformed or
 * incomplete JSON is treated as an error, not coerced into something usable.
 */

import {
  type ActionKind,
  type ActionProposal,
  err,
  type HypothesisProposal,
  type ImpactLevel,
  ok,
  type Result,
} from '../types.js';

const ACTION_KINDS: readonly ActionKind[] = [
  'passive-recon',
  'active-recon',
  'js-intelligence',
  'behavioral-diff',
  'shannon',
  'manual-review',
];
const IMPACT_LEVELS: readonly ImpactLevel[] = ['low', 'medium', 'high', 'critical'];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const ACTION_PROPOSAL_STRING_FIELDS = [
  'targetRef',
  'hypothesisId',
  'whyThisAction',
  'hypothesisTested',
  'uncertaintyReduced',
  'confirmingObservation',
  'contradictingObservation',
  'nextStepIfConfirmed',
  'nextStepIfContradicted',
] as const;

export function validateActionProposal(value: unknown): Result<ActionProposal, string> {
  if (!isRecord(value)) {
    return err('action proposal must be a JSON object');
  }
  if (typeof value.kind !== 'string' || !ACTION_KINDS.includes(value.kind as ActionKind)) {
    return err(`action proposal "kind" must be one of: ${ACTION_KINDS.join(', ')}`);
  }
  for (const field of ACTION_PROPOSAL_STRING_FIELDS) {
    if (!isNonEmptyString(value[field])) {
      return err(`action proposal "${field}" must be a non-empty string`);
    }
  }
  return ok({
    kind: value.kind as ActionKind,
    targetRef: value.targetRef as string,
    hypothesisId: value.hypothesisId as string,
    whyThisAction: value.whyThisAction as string,
    hypothesisTested: value.hypothesisTested as string,
    uncertaintyReduced: value.uncertaintyReduced as string,
    confirmingObservation: value.confirmingObservation as string,
    contradictingObservation: value.contradictingObservation as string,
    nextStepIfConfirmed: value.nextStepIfConfirmed as string,
    nextStepIfContradicted: value.nextStepIfContradicted as string,
  });
}

export function validateHypothesisProposal(value: unknown): Result<HypothesisProposal, string> {
  if (!isRecord(value)) {
    return err('hypothesis proposal must be a JSON object');
  }
  if (!isNonEmptyString(value.statement)) return err('hypothesis proposal "statement" must be a non-empty string');
  if (!isNonEmptyString(value.vulnClass)) return err('hypothesis proposal "vulnClass" must be a non-empty string');
  if (!isNonEmptyString(value.assetRef)) return err('hypothesis proposal "assetRef" must be a non-empty string');
  if (typeof value.potentialImpact !== 'string' || !IMPACT_LEVELS.includes(value.potentialImpact as ImpactLevel)) {
    return err(`hypothesis proposal "potentialImpact" must be one of: ${IMPACT_LEVELS.join(', ')}`);
  }
  if (typeof value.confidence !== 'number' || value.confidence < 0 || value.confidence > 1) {
    return err('hypothesis proposal "confidence" must be a number between 0 and 1');
  }
  if (typeof value.informationGain !== 'number' || value.informationGain < 0 || value.informationGain > 1) {
    return err('hypothesis proposal "informationGain" must be a number between 0 and 1');
  }
  if (!Array.isArray(value.requiredEvidence) || !value.requiredEvidence.every((v) => typeof v === 'string')) {
    return err('hypothesis proposal "requiredEvidence" must be an array of strings');
  }
  if (!isNonEmptyString(value.nextInvestigation))
    return err('hypothesis proposal "nextInvestigation" must be a non-empty string');
  if (
    !Array.isArray(value.supportingObservationIds) ||
    !value.supportingObservationIds.every((v) => typeof v === 'string')
  ) {
    return err('hypothesis proposal "supportingObservationIds" must be an array of strings');
  }

  return ok({
    statement: value.statement as string,
    vulnClass: value.vulnClass as string,
    assetRef: value.assetRef as string,
    potentialImpact: value.potentialImpact as ImpactLevel,
    confidence: value.confidence,
    informationGain: value.informationGain,
    requiredEvidence: value.requiredEvidence as readonly string[],
    nextInvestigation: value.nextInvestigation as string,
    supportingObservationIds: value.supportingObservationIds as readonly string[],
  });
}
