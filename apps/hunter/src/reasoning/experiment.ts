/**
 * Experiment designer.
 *
 * Turns a hypothesis into a candidate `Experiment` — an objective, expected
 * outcomes, information gain, cost, risk, prerequisites, and validation
 * criteria — and selects the one with the best risk-adjusted information
 * gain, explicitly explaining why every other candidate was deferred
 * ("don't test this yet because another experiment teaches more").
 *
 * This deliberately does not introduce a second execution path:
 * `experimentToHuntAction` converts the selected experiment into a plain
 * `HuntAction`, the same record type `reasoning/actions.ts:buildActionQueue`
 * already produces, so it flows through the existing
 * scope -> policy -> rate-limiter -> tool-registry -> adapter -> observation
 * pipeline (`pipeline/tool-bridge.ts`) unchanged. Every experiment is
 * priced with the exact same `COST_BY_KIND` table a plain hypothesis-driven
 * action already uses — one cost model, not two — and deduplicated using
 * the same `actionKey` convention `pipeline/adaptive-loop.ts` already uses
 * to skip completed (kind, target) pairs, so a repeated experiment is
 * recognized as one whether it originated here or from the plain queue.
 */

import { randomUUID } from 'node:crypto';
import type { ActionKind, HuntAction, Hypothesis, ToolRisk } from '../types.js';
import { actionKey, actionKindFor, COST_BY_KIND } from './actions.js';

export interface Experiment {
  readonly id: string;
  readonly hypothesisId: string;
  readonly objective: string;
  readonly actionKind: ActionKind;
  readonly targetRef: string;
  readonly expectedOutcomes: readonly string[];
  readonly informationGain: number;
  readonly cost: number;
  readonly risk: ToolRisk;
  readonly prerequisites: readonly string[];
  readonly requiresAuthorization: boolean;
  readonly validationCriteria: readonly string[];
}

const RISK_PENALTY: Readonly<Record<ToolRisk, number>> = { none: 0, low: 0.05, medium: 0.15, high: 0.35 };

/** Every real tool this package ships requires program authorization already (see `pipeline/tool-bridge.ts`); only `manual-review` never touches a live target. */
function requiresAuthorizationFor(kind: ActionKind): boolean {
  return kind !== 'manual-review';
}

/**
 * One experiment per still-open/investigating hypothesis, skipping any
 * (actionKind, targetRef) pair already in `alreadyRunSignatures` — the
 * "repeated-experiment detection" requirement, sharing the exact signature
 * convention the plain action queue already uses.
 */
export function designExperiments(
  hypotheses: readonly Hypothesis[],
  alreadyRunSignatures: ReadonlySet<string> = new Set(),
): readonly Experiment[] {
  const experiments: Experiment[] = [];
  for (const hypothesis of hypotheses) {
    if (hypothesis.status !== 'open' && hypothesis.status !== 'investigating') continue;
    const actionKind = actionKindFor(hypothesis);
    const signature = actionKey(actionKind, hypothesis.assetRef);
    if (alreadyRunSignatures.has(signature)) continue;

    const risk: ToolRisk = hypothesis.risk ?? (actionKind === 'shannon' ? 'medium' : 'low');
    const cost = hypothesis.cost ?? COST_BY_KIND[actionKind];

    experiments.push({
      id: `experiment-${randomUUID()}`,
      hypothesisId: hypothesis.id,
      objective: hypothesis.nextInvestigation,
      actionKind,
      targetRef: hypothesis.assetRef,
      expectedOutcomes: hypothesis.requiredEvidence,
      informationGain: hypothesis.informationGain,
      cost,
      risk,
      prerequisites: hypothesis.assumptions ?? [],
      requiresAuthorization: requiresAuthorizationFor(actionKind),
      validationCriteria: hypothesis.requiredEvidence,
    });
  }
  return experiments;
}

export interface ExperimentSelection {
  readonly selected: Experiment | undefined;
  readonly deferred: readonly { readonly experiment: Experiment; readonly reason: string }[];
}

function riskAdjustedScore(experiment: Experiment): number {
  return Number((experiment.informationGain - experiment.cost * 0.5 - RISK_PENALTY[experiment.risk]).toFixed(4));
}

/**
 * Picks the single best risk-adjusted candidate and states, for every
 * other candidate, that a higher-scoring experiment already covers this
 * round — "do not test this yet because another experiment gives more
 * information" is the literal deferral reason.
 */
export function selectBestExperiment(experiments: readonly Experiment[]): ExperimentSelection {
  if (experiments.length === 0) {
    return { selected: undefined, deferred: [] };
  }
  const scored = experiments
    .map((experiment) => ({ experiment, score: riskAdjustedScore(experiment) }))
    .sort((a, b) => b.score - a.score);
  const winner = scored[0];
  if (!winner) return { selected: undefined, deferred: [] };

  const deferred = scored.slice(1).map(({ experiment }) => ({
    experiment,
    reason: `do not test this yet — "${winner.experiment.objective}" has a higher risk-adjusted information gain (${winner.score} vs ${riskAdjustedScore(experiment)})`,
  }));
  return { selected: winner.experiment, deferred };
}

export function experimentToHuntAction(experiment: Experiment, engagementId: string): HuntAction {
  return {
    id: `action-${randomUUID()}`,
    engagementId,
    kind: experiment.actionKind,
    targetRef: experiment.targetRef,
    hypothesisId: experiment.hypothesisId,
    rationale: experiment.objective,
    expectedInformationGain: experiment.informationGain,
    cost: experiment.cost,
    status: 'queued',
    createdAt: new Date().toISOString(),
    completedAt: undefined,
    resultSummary: undefined,
  };
}
