/**
 * Signal-family grouping and correlated-evidence bounding.
 *
 * `discovery/scoring.ts`'s `SIGNAL_KEYS` are not eight independent
 * observations of a program: `competitionPressure`, `disclosedReportDensity`,
 * and `vulnClassHistory` are all derived from the exact same underlying fact
 * — "does a disclosure-history provider have report data for this program,
 * and what does it say" (`discovery/h1-brain-provider.ts`'s
 * `disclosed_report_count`/`disclosed_weakness_types`). Scoring them as
 * three independent weighted votes lets one data source cast three ballots,
 * which is exactly how the live 222-program run let a *lack* of disclosure
 * data (not a real, positive signal) dominate: a program missing all three
 * correlated signals loses no more score than a program missing one
 * genuinely independent signal, even though three simultaneous absences is
 * much stronger evidence of "we simply don't know."
 *
 * This module is the fix: every signal belongs to exactly one family, and a
 * family's *combined* contribution to the total score is capped at
 * `FAMILY_CONTRIBUTION_BUDGET` — the same ceiling a single strong,
 * independent signal would carry. Three correlated signals can still each
 * shift the score in their own direction (a program can be "low competition
 * AND rich vuln-class history AND high report density" and have that count
 * for something), but their family cannot out-vote two or three genuinely
 * independent families the way three raw signals currently can.
 */

import type { SignalKey } from './scoring.js';

export type SignalFamily =
  | 'bountyEconomics'
  | 'assetSurface'
  | 'disclosureHistory'
  | 'programFreshness'
  | 'competition'
  | 'capabilityFit'
  | 'researchCost';

export const SIGNAL_FAMILY: Readonly<Record<SignalKey, SignalFamily>> = {
  bountyAttractiveness: 'bountyEconomics',
  competitionPressure: 'competition',
  disclosedReportDensity: 'disclosureHistory',
  vulnClassHistory: 'disclosureHistory',
  assetSurfaceBreadth: 'assetSurface',
  researchCost: 'researchCost',
  programFreshness: 'programFreshness',
  capabilityFit: 'capabilityFit',
};

/**
 * `competitionPressure` is grouped separately from `disclosedReportDensity`/
 * `vulnClassHistory` even though all three read the same provider response:
 * competition (how crowded is this) is a materially different claim from
 * disclosure richness (how diverse is the history) and report density (how
 * much history exists at all) — but density and vuln-class-history really
 * are the same claim read two ways ("there is a lot of report data" vs.
 * "that report data covers many classes"), so those two are what this
 * module bounds together. `FAMILY_MAX_FAMILIES_WITH_CAP` documents which
 * families are actually correlated enough to need a budget at all; a family
 * with a single member is never affected (its "cap" is simply its own
 * weight, i.e. a no-op).
 */
const CORRELATED_FAMILIES: ReadonlySet<SignalFamily> = new Set(['disclosureHistory']);

export function isCorrelatedFamily(family: SignalFamily): boolean {
  return CORRELATED_FAMILIES.has(family);
}

/**
 * A family's combined |contribution| may not exceed this many
 * weight-equivalent units — the same order of magnitude as
 * `DEFAULT_SIGNAL_WEIGHTS.capabilityFit` (1.1), the heaviest single
 * independent signal. Chosen so a fully-correlated family can still matter
 * as much as one strong independent signal, but never as much as two or
 * three.
 */
export const FAMILY_CONTRIBUTION_BUDGET = 1.1;

export interface FamilyBoundable {
  readonly key: SignalKey;
  readonly contribution: number;
}

/**
 * Scales down (never up) the contributions of every signal in a correlated
 * family so their *summed absolute value* never exceeds
 * `FAMILY_CONTRIBUTION_BUDGET`. Scaling (not truncation/dropping) preserves
 * each signal's relative direction and size within the family — a family
 * that is unanimously positive stays unanimously positive, just bounded.
 * Families with a single member, or not in `CORRELATED_FAMILIES`, are
 * returned unchanged (scale factor 1).
 */
export function boundFamilyContributions<T extends FamilyBoundable>(components: readonly T[]): readonly T[] {
  interface Indexed {
    readonly index: number;
    readonly item: T;
  }
  const byFamily = new Map<SignalFamily, Indexed[]>();
  components.forEach((item, index) => {
    const family = SIGNAL_FAMILY[item.key];
    const bucket = byFamily.get(family) ?? [];
    bucket.push({ index, item });
    byFamily.set(family, bucket);
  });

  const result: Indexed[] = [];
  for (const [family, members] of byFamily) {
    if (!isCorrelatedFamily(family) || members.length <= 1) {
      result.push(...members);
      continue;
    }
    const combined = members.reduce((sum, m) => sum + Math.abs(m.item.contribution), 0);
    const scale = combined > FAMILY_CONTRIBUTION_BUDGET && combined > 0 ? FAMILY_CONTRIBUTION_BUDGET / combined : 1;
    for (const m of members) {
      result.push(scale === 1 ? m : { index: m.index, item: { ...m.item, contribution: m.item.contribution * scale } });
    }
  }
  // preserve the caller's original ordering rather than the family-grouped one
  return result.sort((a, b) => a.index - b.index).map((r) => r.item);
}
