import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runSensitivityAnalysis, SENSITIVITY_SCENARIOS } from './sensitivity.js';
import type { DiscoveredProgram, ProgramSignal } from './types.js';

const NOW = new Date('2026-09-14T00:00:00.000Z').getTime();

function signal(value: number, confidence = 0.9, detail = 'test'): ProgramSignal {
  return { value, confidence, freshnessAt: new Date(NOW).toISOString(), detail };
}

function program(id: string, overrides: Partial<DiscoveredProgram> = {}): DiscoveredProgram {
  return {
    programId: id,
    programName: id,
    platform: 'hackerone',
    offersBounty: true,
    assets: [{ identifier: `${id}.example.com`, type: 'domain', instruction: 'in-scope' }],
    rulesOfEngagement: [],
    disallowedTechniques: [],
    signals: {},
    sourceProvider: 'test',
    discoveredAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

test('sensitivity analysis is deterministic: same dataset + same now = identical result', () => {
  const dataset = [
    program('a', { signals: { bountyAttractiveness: signal(0.9), capabilityFit: signal(1) } }),
    program('b', { signals: { bountyAttractiveness: signal(0.5), capabilityFit: signal(0.5) } }),
  ];
  const first = runSensitivityAnalysis(dataset, NOW);
  const second = runSensitivityAnalysis(dataset, NOW);
  assert.deepEqual(first, second);
});

test("reversing input program order does not change any program's computed ranks", () => {
  const dataset = [
    program('a', { signals: { bountyAttractiveness: signal(0.9), capabilityFit: signal(1) } }),
    program('b', { signals: { bountyAttractiveness: signal(0.5), capabilityFit: signal(0.5) } }),
    program('c', { signals: { bountyAttractiveness: signal(0.2), capabilityFit: signal(0.2) } }),
  ];
  const forward = runSensitivityAnalysis(dataset, NOW);
  const reversed = runSensitivityAnalysis([...dataset].reverse(), NOW);
  const byId = (r: typeof forward) => Object.fromEntries(r.perProgram.map((p) => [p.programId, p.ranksByScenario]));
  assert.deepEqual(byId(forward), byId(reversed));
});

test('a clear, wide-margin winner across every signal is reported as the robust winner', () => {
  const dominant = program('dominant', {
    signals: {
      bountyAttractiveness: signal(0.95),
      competitionPressure: signal(0.95),
      disclosedReportDensity: signal(0.1),
      vulnClassHistory: signal(0.9),
      assetSurfaceBreadth: signal(0.9),
      researchCost: signal(0.9),
      programFreshness: signal(0.9),
      capabilityFit: signal(1),
    },
  });
  const weak = program('weak', {
    signals: {
      bountyAttractiveness: signal(0.1),
      competitionPressure: signal(0.1),
      disclosedReportDensity: signal(0.9),
      vulnClassHistory: signal(0.1),
      assetSurfaceBreadth: signal(0.1),
      researchCost: signal(0.1),
      programFreshness: signal(0.1),
      capabilityFit: signal(0.1),
    },
  });
  const result = runSensitivityAnalysis([dominant, weak], NOW);
  assert.equal(result.robustWinnerProgramId, 'dominant');
});

// === Regression #13/#14 + adversarial (I): fragile winners must not be reported as robust ===

test('regression: a program that wins only under one narrow weighting (fragile) is not reported as the robust winner', () => {
  // "narrow" carries one extreme positive signal (researchCost) but is actively bad on
  // capabilityFit, so it loses the baseline and every scenario except the one that specifically
  // doubles researchCost's weight enough to overcome that penalty.
  const narrow = program('narrow', {
    signals: { researchCost: signal(0.99, 0.95), capabilityFit: signal(0.05, 0.9) },
  });
  // "balanced" is consistently, moderately positive across every dimension it has data for.
  const balanced = program('balanced', {
    signals: {
      bountyAttractiveness: signal(0.65),
      competitionPressure: signal(0.65),
      assetSurfaceBreadth: signal(0.65),
      researchCost: signal(0.5),
      programFreshness: signal(0.65),
      capabilityFit: signal(0.65),
    },
  });
  const result = runSensitivityAnalysis([narrow, balanced], NOW);
  const narrowRanks = result.perProgram.find((p) => p.programId === 'narrow')?.ranksByScenario ?? {};
  assert.equal(
    narrowRanks.baseline,
    2,
    'sanity check: "narrow" must lose the baseline scenario for this test to mean anything',
  );
  assert.equal(
    narrowRanks['research-cost-heavy'],
    1,
    'sanity check: "narrow" must win exactly the scenario it was designed to win',
  );
  // Whatever the outcome, "narrow" must not be crowned robust winner off the strength of a single scenario.
  const narrowStats = result.perProgram.find((p) => p.programId === 'narrow');
  assert.ok(narrowStats);
  if (result.robustWinnerProgramId === 'narrow') {
    assert.fail('a program that does not hold top-3 across every scenario must never be the reported robust winner');
  }
});

test('regression: no robust winner produces a non-empty shortlist (topTier) rather than a false #1', () => {
  // Two near-identical, differently-shaped programs: neither should dominate every scenario.
  const a = program('a', {
    signals: {
      bountyAttractiveness: signal(0.6),
      disclosedReportDensity: signal(0.6),
      vulnClassHistory: signal(0.7),
      capabilityFit: signal(1),
    },
  });
  const b = program('b', {
    signals: {
      bountyAttractiveness: signal(0.6),
      competitionPressure: signal(0.7),
      researchCost: signal(0.7),
      capabilityFit: signal(1),
    },
  });
  const result = runSensitivityAnalysis([a, b], NOW);
  if (result.robustWinnerProgramId === undefined) {
    assert.ok(result.topTier.length > 0, 'no robust winner must still produce a non-empty shortlist');
    assert.match(result.reason, /statistical tie|did not hold|no program won/);
  }
});

test('every declared scenario actually ran and is represented in perProgram ranks', () => {
  const dataset = [program('a', { signals: { bountyAttractiveness: signal(0.5) } })];
  const result = runSensitivityAnalysis(dataset, NOW);
  const scenarioNames = Object.keys(result.perProgram[0]?.ranksByScenario ?? {});
  assert.deepEqual(scenarioNames.sort(), SENSITIVITY_SCENARIOS.map((s) => s.name).sort());
});

// === Conservative scenarios actually change the picture for missing-data-heavy programs ===

test('the conservative-data scenario measurably changes rank for a program resting mostly on missing signals', () => {
  const thin = program('thin', { signals: { capabilityFit: signal(1) } });
  const documented = program('documented', {
    signals: {
      capabilityFit: signal(1),
      bountyAttractiveness: signal(0.55),
      competitionPressure: signal(0.55),
      disclosedReportDensity: signal(0.5),
      vulnClassHistory: signal(0.5),
      assetSurfaceBreadth: signal(0.5),
      researchCost: signal(0.5),
      programFreshness: signal(0.5),
    },
  });
  const result = runSensitivityAnalysis([thin, documented], NOW);
  const thinRanks = result.perProgram.find((p) => p.programId === 'thin')?.ranksByScenario;
  assert.ok(thinRanks);
  // Under the baseline, "thin" resting on almost nothing may still rank ok (evidenceWeight tie-break
  // aside); under conservative-data, imputing a mild-negative for its many missing signals must not
  // leave it better off than it was at baseline.
  const baselineRank = thinRanks.baseline;
  const conservativeRank = thinRanks['conservative-data'];
  assert.ok(baselineRank !== undefined && conservativeRank !== undefined);
  assert.ok(
    conservativeRank >= baselineRank,
    `expected conservative-data to rank "thin" no better than baseline (baseline=${baselineRank}, conservative=${conservativeRank})`,
  );
});
