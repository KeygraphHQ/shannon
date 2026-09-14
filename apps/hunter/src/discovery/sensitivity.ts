/**
 * Deterministic sensitivity / robustness analysis over one candidate set.
 *
 * The live 222-program run showed that a single weight vector is not enough
 * to trust a "#1" answer: Semrush won a 21-program sample, then dropped to
 * #3 once the sample widened to 219, and even the corrected (Uber/X
 * excluded) #1 — Yelp — only beat #2/#3 by well under 1% and lost its #1
 * spot outright under a research-cost-heavy weighting. This module is what
 * turns "I ran the model once and got an answer" into "I ran the model
 * under every reasonable perturbation and this is how stable the answer
 * actually is."
 *
 * Every scenario below has a stated rationale (per the mission's explicit
 * instruction not to invent scenarios with no reason) and is otherwise a
 * pure function of `discovery/scoring.ts`'s existing `rankPrograms` — this
 * module adds no new scoring math of its own, only a fixed battery of
 * inputs to it plus the bookkeeping to summarize what came back.
 */

import { DEFAULT_SIGNAL_WEIGHTS, rankPrograms, SIGNAL_KEYS, type SignalKey } from './scoring.js';
import type { DiscoveredProgram, ProgramSignal } from './types.js';

export interface SensitivityScenario {
  readonly name: string;
  readonly description: string;
  readonly weights: Readonly<Partial<Record<SignalKey, number>>>;
  /** `true` for the two scenarios that alter the *input data* (imputing a value for missing signals) rather than only the weight vector — see `applyScenarioTransform`. */
  readonly transformsMissingData?: boolean;
}

const DOUBLE = (key: SignalKey): number => DEFAULT_SIGNAL_WEIGHTS[key] * 2;

export const SENSITIVITY_SCENARIOS: readonly SensitivityScenario[] = [
  {
    name: 'baseline',
    description:
      'the production DEFAULT_SIGNAL_WEIGHTS, unmodified — the reference point every other scenario is compared against.',
    weights: {},
  },
  {
    name: 'bounty-economics-heavy',
    description:
      'doubles bountyAttractiveness weight — the single most decision-relevant signal once real $ data exists. Currently expected to change little/nothing while bounty data is universally missing (0/222 in the live run); a scenario that moves the winner here would be a signal this gap matters even more than believed.',
    weights: { bountyAttractiveness: DOUBLE('bountyAttractiveness') },
  },
  {
    name: 'capability-fit-heavy',
    description:
      'doubles capabilityFit weight — tests how much the ranking leans on "has a web-shaped asset", the one signal nearly every candidate satisfies, which risks flattening real differentiation.',
    weights: { capabilityFit: DOUBLE('capabilityFit') },
  },
  {
    name: 'research-cost-heavy',
    description:
      "doubles researchCost weight — the live run's own sensitivity check found this alone can dethrone the credible #1, so it is kept as a permanent scenario.",
    weights: { researchCost: DOUBLE('researchCost') },
  },
  {
    name: 'conservative-bounty',
    description:
      'imputes a below-neutral bountyAttractiveness (0.35 @ confidence 0.3) for every program currently missing it, instead of excluding the signal — directly tests whether "no bounty data" is quietly advantaging a program versus a pass that treats the unknown as a mild negative.',
    weights: {},
    transformsMissingData: true,
  },
  {
    name: 'conservative-data',
    description:
      "imputes the same below-neutral value for EVERY currently-missing signal on every program — the harshest stress test of the missing-data bug: if a program's rank collapses once every unknown is treated as mildly negative rather than absent, its baseline rank was resting on missingness, not merit.",
    weights: {},
    transformsMissingData: true,
  },
  {
    name: 'competition-heavy',
    description:
      'doubles competitionPressure weight — tests how much the ranking leans on "how many other researchers are active here" in isolation from the correlated disclosedReportDensity/vulnClassHistory signals.',
    weights: { competitionPressure: DOUBLE('competitionPressure') },
  },
  {
    name: 'surface-heavy',
    description:
      'doubles assetSurfaceBreadth weight — tests how much the ranking leans on raw scope size rather than the quality of what is known about that scope.',
    weights: { assetSurfaceBreadth: DOUBLE('assetSurfaceBreadth') },
  },
];

const IMPUTED_VALUE = 0.35;
const IMPUTED_CONFIDENCE = 0.3;

function impute(program: DiscoveredProgram, key: SignalKey, now: number): DiscoveredProgram {
  if (program.signals[key]) return program;
  const imputedSignal: ProgramSignal = {
    value: IMPUTED_VALUE,
    confidence: IMPUTED_CONFIDENCE,
    freshnessAt: new Date(now).toISOString(),
    detail: `IMPUTED for the "conservative" sensitivity scenario only — no real data was available for ${key}; this value never appears in the baseline scoring path.`,
  };
  return { ...program, signals: { ...program.signals, [key]: imputedSignal } };
}

function applyScenarioTransform(
  scenario: SensitivityScenario,
  programs: readonly DiscoveredProgram[],
  now: number,
): readonly DiscoveredProgram[] {
  if (!scenario.transformsMissingData) return programs;
  const keysToImpute: readonly SignalKey[] =
    scenario.name === 'conservative-bounty' ? (['bountyAttractiveness'] as const) : SIGNAL_KEYS;
  return programs.map((program) => keysToImpute.reduce((p, key) => impute(p, key, now), program));
}

export interface ProgramRobustness {
  readonly programId: string;
  readonly programName: string;
  /** scenario name -> rank in that scenario (absent if the program scored `undefined` there). */
  readonly ranksByScenario: Readonly<Record<string, number | undefined>>;
  readonly scenariosScored: number;
  readonly winnerCount: number;
  readonly top3Count: number;
  readonly rankRange: readonly [number, number] | undefined;
  readonly rankMedian: number | undefined;
  readonly bestReasonableRank: number | undefined;
  readonly worstReasonableRank: number | undefined;
}

export interface SensitivityResult {
  readonly scenarios: readonly SensitivityScenario[];
  readonly perProgram: readonly ProgramRobustness[];
  readonly robustWinnerProgramId: string | undefined;
  /** Populated only when `robustWinnerProgramId` is undefined — the programs actually contending (won #1 in at least one scenario), ordered by median rank. */
  readonly topTier: readonly string[];
  readonly reason: string;
}

/** A program must appear in the top 3 across every scenario it was scored in, and win #1 outright in more than half, to count as robust — "remains #1 or near-#1 across reasonable perturbations", not merely "won once". */
function isRobustWinner(p: ProgramRobustness, totalScenarios: number): boolean {
  return p.scenariosScored === totalScenarios && p.top3Count === totalScenarios && p.winnerCount > totalScenarios / 2;
}

export function runSensitivityAnalysis(
  programs: readonly DiscoveredProgram[],
  now: number = Date.now(),
): SensitivityResult {
  const scenarioRanks = new Map<string, Map<string, number>>();
  for (const scenario of SENSITIVITY_SCENARIOS) {
    const candidatePrograms = applyScenarioTransform(scenario, programs, now);
    const ranked = rankPrograms(candidatePrograms, scenario.weights, now);
    const rankMap = new Map<string, number>();
    for (const r of ranked) {
      if (r.score.totalScore !== undefined) rankMap.set(r.program.programId, r.rank);
    }
    scenarioRanks.set(scenario.name, rankMap);
  }

  const nameById = new Map(programs.map((p) => [p.programId, p.programName] as const));
  const totalScenarios = SENSITIVITY_SCENARIOS.length;

  const perProgram: ProgramRobustness[] = programs.map((program) => {
    const ranksByScenario: Record<string, number | undefined> = {};
    for (const scenario of SENSITIVITY_SCENARIOS) {
      ranksByScenario[scenario.name] = scenarioRanks.get(scenario.name)?.get(program.programId);
    }
    const numeric = Object.values(ranksByScenario).filter((r): r is number => r !== undefined);
    const sorted = [...numeric].sort((a, b) => a - b);
    return {
      programId: program.programId,
      programName: nameById.get(program.programId) ?? program.programId,
      ranksByScenario,
      scenariosScored: numeric.length,
      winnerCount: numeric.filter((r) => r === 1).length,
      top3Count: numeric.filter((r) => r <= 3).length,
      rankRange: sorted.length > 0 ? ([sorted[0] as number, sorted[sorted.length - 1] as number] as const) : undefined,
      rankMedian: sorted.length > 0 ? (sorted[Math.floor(sorted.length / 2)] as number) : undefined,
      bestReasonableRank: sorted[0],
      worstReasonableRank: sorted[sorted.length - 1],
    };
  });

  const robust = perProgram.find((p) => isRobustWinner(p, totalScenarios));
  if (robust) {
    return {
      scenarios: SENSITIVITY_SCENARIOS,
      perProgram,
      robustWinnerProgramId: robust.programId,
      topTier: [],
      reason: `"${robust.programName}" placed in the top 3 across all ${totalScenarios} scenarios and won #1 outright in ${robust.winnerCount} of them — a robust winner, not an artifact of one weighting.`,
    };
  }

  const contenders = perProgram
    .filter((p) => p.winnerCount >= 1)
    .sort((a, b) => (a.rankMedian ?? Number.POSITIVE_INFINITY) - (b.rankMedian ?? Number.POSITIVE_INFINITY));
  const topTier = contenders.slice(0, 6).map((p) => p.programId);

  return {
    scenarios: SENSITIVITY_SCENARIOS,
    perProgram,
    robustWinnerProgramId: undefined,
    topTier,
    reason:
      contenders.length > 1
        ? `no program placed top-3 in all ${totalScenarios} scenarios while also winning #1 in a majority of them — ${contenders.length} program(s) won #1 under at least one reasonable perturbation, so the leaderboard is a statistical tie within model uncertainty, not a confident #1.`
        : contenders.length === 1
          ? `only one program (${nameById.get(contenders[0]?.programId ?? '') ?? contenders[0]?.programId}) ever won #1, but it did not hold the top 3 across every scenario — treat it as the leading candidate, not a confirmed robust winner.`
          : 'no program won #1 in any scenario — the candidate set does not currently support a #1 recommendation at all.',
  };
}
