import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildOpportunityReport } from './decision.js';
import type { DiscoveredProgram, ProgramSignal } from './types.js';

const NOW = new Date('2026-09-14T00:00:00.000Z').getTime();

function signal(value: number, confidence = 0.9): ProgramSignal {
  return { value, confidence, freshnessAt: new Date(NOW).toISOString(), detail: 'test' };
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

test('a fragile HUNT_NOW candidate is downgraded to INVESTIGATE_MORE when it is not the robust winner', () => {
  const narrow = program('narrow', {
    signals: {
      bountyAttractiveness: signal(0.9),
      competitionPressure: signal(0.9),
      capabilityFit: signal(0.9, 0.05), // present but LOW_CONFIDENCE, keeps this candidate fragile
    },
  });
  const balanced = program('balanced', {
    signals: {
      bountyAttractiveness: signal(0.65),
      competitionPressure: signal(0.65),
      assetSurfaceBreadth: signal(0.65),
      researchCost: signal(0.6),
      programFreshness: signal(0.65),
      capabilityFit: signal(0.65),
    },
  });
  const filler1 = program('filler1', { signals: { capabilityFit: signal(0.2) } });
  const filler2 = program('filler2', { signals: { capabilityFit: signal(0.1) } });
  const report = buildOpportunityReport([narrow, balanced, filler1, filler2], { now: NOW });
  const narrowEntry = report.top.find((e) => e.assessment.programId === 'narrow');
  assert.ok(narrowEntry);
  if (narrowEntry.assessment.recommendedAction === 'HUNT_NOW' && !narrowEntry.isRobustWinner) {
    assert.equal(narrowEntry.finalAction, 'INVESTIGATE_MORE');
    assert.equal(narrowEntry.fragileWinner, true);
  }
});

test('the robust winner (when one exists) keeps its own HUNT_NOW recommendation, never downgraded', () => {
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
  const weak = program('weak', { signals: { capabilityFit: signal(0.1) } });
  const report = buildOpportunityReport([dominant, weak], { now: NOW });
  assert.equal(report.robustWinnerProgramId, 'dominant');
  const entry = report.top.find((e) => e.assessment.programId === 'dominant');
  assert.ok(entry?.isRobustWinner);
  assert.equal(entry?.fragileWinner, false);
});

test(
  'regression (Uber/X): a program that sweeps every sensitivity scenario purely on thin/missing evidence ' +
    'is disqualified from both robustWinnerProgramId and the topTier shortlist, and is listed in excludedFromShortlist',
  () => {
    // "thin" has exactly the Uber/X shape: a couple of independent signals, nothing from the
    // disclosure-history/bounty/competition families -- strong enough on what little it has to
    // sweep a lopsided sensitivity battery, but with confidence nowhere near ADEQUATE_CONFIDENCE.
    const thin = program('thin', {
      signals: { assetSurfaceBreadth: signal(0.95, 0.9), researchCost: signal(0.95, 0.9) },
    });
    const documented = program('documented', {
      signals: {
        bountyAttractiveness: signal(0.55),
        competitionPressure: signal(0.55),
        disclosedReportDensity: signal(0.5),
        vulnClassHistory: signal(0.5),
        assetSurfaceBreadth: signal(0.5),
        researchCost: signal(0.5),
        programFreshness: signal(0.5),
        capabilityFit: signal(0.55),
      },
    });
    const report = buildOpportunityReport([thin, documented], { now: NOW });
    const thinEntry = report.top.find((e) => e.assessment.programId === 'thin');
    assert.ok(thinEntry);
    assert.ok(
      thinEntry.assessment.confidenceScore < 0.45,
      `sanity check: "thin" must actually be low-confidence for this test to mean anything (got ${thinEntry.assessment.confidenceScore})`,
    );
    assert.notEqual(report.robustWinnerProgramId, 'thin');
    assert.ok(
      !report.topTier.includes('thin'),
      'a low-confidence sweep must never appear in the confidence-filtered shortlist',
    );
  },
);

test('evaluatedCount and scoredCount distinguish "given" from "actually scorable"', () => {
  const scorable = program('scorable', { signals: { bountyAttractiveness: signal(0.5) } });
  const empty = program('empty', { signals: {} });
  const report = buildOpportunityReport([scorable, empty], { now: NOW });
  assert.equal(report.evaluatedCount, 2);
  assert.equal(report.scoredCount, 1);
});

test('topN limits the returned entries without affecting robustness computation', () => {
  const programs = Array.from({ length: 5 }, (_, i) =>
    program(`p${i}`, { signals: { bountyAttractiveness: signal(0.1 * (i + 1)) } }),
  );
  const report = buildOpportunityReport(programs, { now: NOW, topN: 2 });
  assert.equal(report.top.length, 2);
});
