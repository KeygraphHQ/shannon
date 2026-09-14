/**
 * Final decision synthesis: per-program opportunity assessment
 * (`discovery/opportunity.ts`) + cross-scenario robustness
 * (`discovery/sensitivity.ts`) merged into the one report `cli.ts`'s `rank`
 * command and `orchestration/lifecycle.ts`'s selection actually consult.
 *
 * The one behavior this module exists to add on top of `opportunity.ts`
 * alone: a program whose *own* signals say `HUNT_NOW` but that is not the
 * robust winner and does not even hold a top-3 spot across most reasonable
 * weightings is downgraded to `INVESTIGATE_MORE` here — a fragile winner
 * must never be reported with the same confidence as a robust one (Phase 24
 * adversarial test C / mission Phase 7's "FRAGILE WINNER" definition).
 */

import {
  ADEQUATE_CONFIDENCE,
  type AssessOptions,
  assessPrograms,
  type ProgramOpportunityAssessment,
  type RecommendedAction,
} from './opportunity.js';
import { type ProgramRobustness, runSensitivityAnalysis, type SensitivityScenario } from './sensitivity.js';
import type { DiscoveredProgram } from './types.js';

export interface TopOpportunityEntry {
  readonly assessment: ProgramOpportunityAssessment;
  readonly robustness: ProgramRobustness;
  /** `assessment.recommendedAction`, downgraded from HUNT_NOW to INVESTIGATE_MORE when the program is not the robust winner and does not hold top-3 across a majority of scenarios. */
  readonly finalAction: RecommendedAction;
  readonly fragileWinner: boolean;
  readonly isRobustWinner: boolean;
}

export interface OpportunityReport {
  readonly evaluatedCount: number;
  readonly scoredCount: number;
  readonly scenarios: readonly SensitivityScenario[];
  readonly top: readonly TopOpportunityEntry[];
  readonly robustWinnerProgramId: string | undefined;
  /** Programs that won #1 in at least one scenario AND clear the same `ADEQUATE_CONFIDENCE` bar `decide()` requires for an individual HUNT_NOW — a program cannot buy its way onto the shortlist purely by benefiting from missing data (see `excludedFromShortlist`). */
  readonly topTier: readonly string[];
  /** Programs that won #1 in at least one scenario but were excluded from `topTier` for having inadequate confidence — kept visible (never silently dropped) so a reviewer can see exactly which "wins" are missing-data artifacts. */
  readonly excludedFromShortlist: readonly {
    readonly programId: string;
    readonly confidenceScore: number;
    readonly reason: string;
  }[];
  readonly robustnessReason: string;
}

export interface OpportunityReportOptions extends AssessOptions {
  readonly topN?: number;
}

export function buildOpportunityReport(
  programs: readonly DiscoveredProgram[],
  options: OpportunityReportOptions = {},
): OpportunityReport {
  const now = options.now ?? Date.now();
  const assessments = assessPrograms(programs, { ...options, now });
  const sensitivity = runSensitivityAnalysis(programs, now);
  const robustnessById = new Map(sensitivity.perProgram.map((p) => [p.programId, p] as const));
  const assessmentById = new Map(assessments.map((a) => [a.programId, a] as const));

  // Even a program that swept every sensitivity scenario must still clear the same confidence
  // bar `decide()` requires for an individual HUNT_NOW — a scenario-sweep built mostly on missing
  // signals (Uber/X-shaped) must never stand as a genuine robust winner. Computed once, up front,
  // so `isRobustWinner` below and the report-level `robustWinnerProgramId` agree with each other.
  const sweepConfidence = sensitivity.robustWinnerProgramId
    ? (assessmentById.get(sensitivity.robustWinnerProgramId)?.confidenceScore ?? 0)
    : undefined;
  const robustWinnerProgramId =
    sweepConfidence !== undefined && sweepConfidence >= ADEQUATE_CONFIDENCE
      ? sensitivity.robustWinnerProgramId
      : undefined;

  const scored = assessments.filter((a) => a.opportunityScore !== undefined);
  scored.sort((a, b) => (b.opportunityScore as number) - (a.opportunityScore as number));

  const entries: TopOpportunityEntry[] = scored.map((assessment) => {
    const robustness = robustnessById.get(assessment.programId);
    const isRobustWinner = robustWinnerProgramId === assessment.programId;
    const scenariosScored = robustness?.scenariosScored ?? 0;
    const majorityTop3 = robustness !== undefined && scenariosScored > 0 && robustness.top3Count > scenariosScored / 2;
    const fragileWinner = assessment.recommendedAction === 'HUNT_NOW' && !isRobustWinner && !majorityTop3;
    const finalAction: RecommendedAction = fragileWinner ? 'INVESTIGATE_MORE' : assessment.recommendedAction;
    return {
      assessment,
      robustness: robustness ?? {
        programId: assessment.programId,
        programName: assessment.programName,
        ranksByScenario: {},
        scenariosScored: 0,
        winnerCount: 0,
        top3Count: 0,
        rankRange: undefined,
        rankMedian: undefined,
        bestReasonableRank: undefined,
        worstReasonableRank: undefined,
      },
      finalAction,
      fragileWinner,
      isRobustWinner,
    };
  });

  const topTier: string[] = [];
  const excludedFromShortlist: {
    readonly programId: string;
    readonly confidenceScore: number;
    readonly reason: string;
  }[] = [];
  for (const programId of sensitivity.topTier) {
    const confidenceScore = assessmentById.get(programId)?.confidenceScore ?? 0;
    if (confidenceScore >= ADEQUATE_CONFIDENCE) {
      topTier.push(programId);
    } else {
      excludedFromShortlist.push({
        programId,
        confidenceScore,
        reason: `won #1 in at least one scenario, but confidence ${confidenceScore.toFixed(2)} is below the ${ADEQUATE_CONFIDENCE} bar required to trust that win — likely a missing-data artifact, not genuine opportunity.`,
      });
    }
  }
  if (sensitivity.robustWinnerProgramId && robustWinnerProgramId === undefined) {
    excludedFromShortlist.unshift({
      programId: sensitivity.robustWinnerProgramId,
      confidenceScore: sweepConfidence ?? 0,
      reason: `swept every sensitivity scenario, but confidence ${(sweepConfidence ?? 0).toFixed(2)} is below the ${ADEQUATE_CONFIDENCE} bar — disqualified as robust winner despite the sweep.`,
    });
  }

  return {
    evaluatedCount: programs.length,
    scoredCount: entries.length,
    scenarios: sensitivity.scenarios,
    top: entries.slice(0, options.topN ?? 20),
    robustWinnerProgramId,
    topTier,
    excludedFromShortlist,
    robustnessReason:
      robustWinnerProgramId === undefined && sensitivity.robustWinnerProgramId !== undefined
        ? `a program (${sensitivity.robustWinnerProgramId}) swept every sensitivity scenario but was disqualified for inadequate confidence (${(sweepConfidence ?? 0).toFixed(2)} < ${ADEQUATE_CONFIDENCE}) — treat this as no robust winner.`
        : sensitivity.reason,
  };
}
