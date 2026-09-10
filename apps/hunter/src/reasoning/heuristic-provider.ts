/**
 * The deterministic fallback reasoning provider.
 *
 * Not a stub: this wraps the same real scoring logic
 * (`reasoning/hypothesis.ts`, `reasoning/actions.ts`) the controller has
 * always used, behind the `ReasoningProvider` interface — it is always
 * available (no credentials, no network) and is exactly what runs when no
 * model-backed provider is configured or when one fails.
 */

import type { ActionProposal, HypothesisProposal, Observation, WorldModelSnapshot } from '../types.js';
import { selectNextBestAction } from './actions.js';
import { hypothesesFromObservations } from './hypothesis.js';
import type { ReasoningProvider } from './provider.js';

export class HeuristicReasoningProvider implements ReasoningProvider {
  readonly source = 'heuristic' as const;

  selectNextBestAction(snapshot: WorldModelSnapshot): Promise<ActionProposal | undefined> {
    const chosen = selectNextBestAction(snapshot.candidateActions);
    if (!chosen) {
      return Promise.resolve(undefined);
    }
    const hypothesis = snapshot.hypotheses.find((h) => h.id === chosen.hypothesisId);
    return Promise.resolve({
      kind: chosen.kind,
      targetRef: chosen.targetRef,
      hypothesisId: chosen.hypothesisId,
      whyThisAction: chosen.rationale,
      hypothesisTested: hypothesis?.statement ?? chosen.hypothesisId,
      uncertaintyReduced: `expected information gain ${chosen.expectedInformationGain} at cost ${chosen.cost}`,
      confirmingObservation:
        "a new observation matching this hypothesis's vulnerability class, ideally independently verified",
      contradictingObservation:
        'a new observation tagged "refutes" for this hypothesis, or one materially inconsistent with it',
      nextStepIfConfirmed:
        'raise confidence, and once independently corroborated by a second source, promote to a finding',
      nextStepIfContradicted: 'mark the hypothesis contradicted and drop it from the action queue',
    });
  }

  generateHypotheses(
    observations: readonly Observation[],
    engagementId: string,
  ): Promise<readonly HypothesisProposal[]> {
    const hypotheses = hypothesesFromObservations(observations, engagementId);
    return Promise.resolve(
      hypotheses.map((h) => ({
        statement: h.statement,
        vulnClass: h.vulnClass,
        assetRef: h.assetRef,
        potentialImpact: h.potentialImpact,
        confidence: h.confidence,
        informationGain: h.informationGain,
        requiredEvidence: h.requiredEvidence,
        nextInvestigation: h.nextInvestigation,
        supportingObservationIds: h.supportingObservationIds,
      })),
    );
  }
}
