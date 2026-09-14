import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HuntMemoryEntry } from '../memory/hunt-memory.js';
import { assessProgram, assessPrograms, classifySignalState, evidenceTierFor } from './opportunity.js';
import type { DiscoveredProgram, ProgramSignal } from './types.js';

const NOW = new Date('2026-09-14T00:00:00.000Z').getTime();

function signal(
  value: number,
  confidence = 0.9,
  detail = 'test',
  freshnessAt = new Date(NOW).toISOString(),
): ProgramSignal {
  return { value, confidence, freshnessAt, detail };
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

// === Regression test #1/#2/#3: the Uber/X missing-data pathology ===

test('regression (Uber/X): missing data never creates positive directional evidence, and reduces confidence instead', () => {
  const uberShaped = program('uber-shaped', {
    signals: { capabilityFit: signal(1, 0.9), assetSurfaceBreadth: signal(0.3, 0.9), researchCost: signal(0.3, 0.5) },
  });
  const assessment = assessProgram(uberShaped, { now: NOW });
  // No positive/negative claim is ever synthesized for a signal that was never present.
  assert.ok(!assessment.positiveSignals.includes('competitionPressure'));
  assert.ok(!assessment.negativeSignals.includes('competitionPressure'));
  assert.ok(assessment.missingSignals.includes('competitionPressure'));
  assert.ok(assessment.missingSignals.includes('disclosedReportDensity'));
  assert.ok(assessment.missingSignals.includes('vulnClassHistory'));
  assert.ok(assessment.missingSignals.includes('bountyAttractiveness'));
  // Confidence must be visibly reduced, not left as if the program were fully evidenced.
  assert.ok(assessment.confidenceScore < 0.6, `expected reduced confidence, got ${assessment.confidenceScore}`);
  assert.ok(assessment.uncertaintyScore > 0.4);
});

test('a fully-evidenced program has strictly higher confidence than a thin one with the same headline signals', () => {
  const thin = program('thin', { signals: { capabilityFit: signal(1) } });
  const rich = program('rich', {
    signals: {
      capabilityFit: signal(1),
      bountyAttractiveness: signal(0.6),
      competitionPressure: signal(0.6),
      disclosedReportDensity: signal(0.5),
      vulnClassHistory: signal(0.5),
      assetSurfaceBreadth: signal(0.5),
      researchCost: signal(0.5),
      programFreshness: signal(0.5),
    },
  });
  const thinA = assessProgram(thin, { now: NOW });
  const richA = assessProgram(rich, { now: NOW });
  assert.ok(richA.confidenceScore > thinA.confidenceScore);
  assert.equal(thinA.evidenceTier, 'THIN');
  assert.equal(richA.evidenceTier, 'RICH');
});

// === Regression #8: stale data decreases confidence ===

test('a stale signal is classified STALE and lowers confidence relative to an identical fresh one', () => {
  const fresh = program('fresh', {
    signals: { bountyAttractiveness: signal(0.8, 0.9, 'x', new Date(NOW).toISOString()) },
  });
  const stale = program('stale', {
    signals: { bountyAttractiveness: signal(0.8, 0.9, 'x', new Date(NOW - 200 * 86_400_000).toISOString()) },
  });
  const freshA = assessProgram(fresh, { now: NOW });
  const staleA = assessProgram(stale, { now: NOW });
  assert.ok(staleA.staleSignals.includes('bountyAttractiveness'));
  assert.ok(!freshA.staleSignals.includes('bountyAttractiveness'));
  assert.ok(staleA.confidenceScore < freshA.confidenceScore);
});

// === Regression #15/#16: bounty economics never fabricated ===

test('actual bounty data unavailable is clearly represented, and proxy economics are never presented as real dollars', () => {
  const noBounty = program('no-bounty', {
    signals: { vulnClassHistory: signal(0.4), assetSurfaceBreadth: signal(0.6) },
  });
  const assessment = assessProgram(noBounty, { now: NOW });
  assert.equal(assessment.bountyEconomics.bountyKnown, false);
  assert.equal(assessment.bountyEconomics.bountyEstimateSource, 'PROXY');
  assert.equal(assessment.bountyEconomics.bountyRangeUsd, undefined);
  assert.ok(assessment.bountyEconomics.proxyOpportunityScore !== undefined);
  assert.match(assessment.bountyEconomics.note, /unavailable from current provider/);
});

test('a real provider bounty range is surfaced as actual dollars, distinctly from the proxy path', () => {
  const withBounty = program('has-bounty', {
    bountyRangeUsd: { min: 100, max: 4000 },
    signals: { bountyAttractiveness: signal(0.8) },
  });
  const assessment = assessProgram(withBounty, { now: NOW });
  assert.equal(assessment.bountyEconomics.bountyKnown, true);
  assert.equal(assessment.bountyEconomics.bountyEstimateSource, 'PROVIDER');
  assert.deepEqual(assessment.bountyEconomics.bountyRangeUsd, { min: 100, max: 4000 });
  assert.equal(assessment.bountyEconomics.proxyOpportunityScore, undefined);
});

test('with neither real bounty data nor a proxy input, economics is explicitly NONE, not silently zero', () => {
  const nothing = program('nothing', { signals: {} });
  const assessment = assessProgram(nothing, { now: NOW });
  assert.equal(assessment.bountyEconomics.bountyEstimateSource, 'NONE');
  assert.equal(assessment.bountyEconomics.proxyOpportunityScore, undefined);
});

// === Regression #17: research-cost uncertainty affects confidence/decision ===

test('research cost is banded, not falsely precise, and its confidence is low without a dedicated provider signal', () => {
  const manyAssets = program('many', {
    assets: Array.from({ length: 60 }, (_, i) => ({
      identifier: `host${i}.example.com`,
      type: 'domain' as const,
      instruction: 'in-scope' as const,
    })),
  });
  const assessment = assessProgram(manyAssets, { now: NOW });
  assert.equal(assessment.researchCost.band, 'VERY_HIGH');
  assert.ok(assessment.researchCost.costConfidence <= 0.25);
});

// === Regression #18: capability-fit prior distinguished from observed performance ===

test('capability fit uses a labeled PRIOR when hunt-memory is empty, never presented as OBSERVED', () => {
  const withWeaknesses = program('has-history', {
    disclosedWeaknessTypes: ['Cross-site Scripting (XSS) - Stored'],
    signals: { capabilityFit: signal(0.9) },
  });
  const assessment = assessProgram(withWeaknesses, { now: NOW, memory: [] });
  assert.equal(assessment.capabilityFit.basis, 'PRIOR');
  assert.ok(assessment.capabilityFit.confidence < 0.5);
  assert.equal(assessment.capabilityFit.matchedVulnClasses.length, 0);
});

test('capability fit becomes OBSERVED only once hunt-memory has an outcome for a matching vuln class', () => {
  const withWeaknesses = program('has-history', {
    disclosedWeaknessTypes: ['idor'],
    signals: { capabilityFit: signal(0.9) },
  });
  const memory: HuntMemoryEntry[] = [
    {
      id: 'm1',
      kind: 'successful-hypothesis-pattern',
      description: 'idor confirmed',
      vulnClass: 'idor',
      actionKind: undefined,
      confidence: 0.8,
      provenance: { source: 'test', discoveredAt: new Date(NOW).toISOString(), confidence: 0.8 },
      outcome: 'positive',
      recordedAt: new Date(NOW).toISOString(),
    },
  ];
  const assessment = assessProgram(withWeaknesses, { now: NOW, memory });
  assert.equal(assessment.capabilityFit.basis, 'OBSERVED');
  assert.deepEqual(assessment.capabilityFit.matchedVulnClasses, ['idor']);
  assert.ok(assessment.capabilityFit.score > 0.5, 'a positive outcome history should raise the score above neutral');
});

// === classifySignalState / evidenceTierFor unit coverage ===

test('evidenceTierFor buckets completeness into NONE/THIN/PARTIAL/RICH', () => {
  assert.equal(evidenceTierFor(0), 'NONE');
  assert.equal(evidenceTierFor(0.25), 'THIN');
  assert.equal(evidenceTierFor(0.5), 'PARTIAL');
  assert.equal(evidenceTierFor(1), 'RICH');
});

test('classifySignalState: a near-zero-confidence signal is LOW_CONFIDENCE regardless of its value', () => {
  const state = classifySignalState(
    {
      key: 'bountyAttractiveness',
      source: 't',
      rawValue: 0.95,
      weight: 1,
      confidence: 0.05,
      freshnessAt: new Date(NOW).toISOString(),
      freshnessFactor: 1,
      contribution: 0.5,
      detail: 'x',
    },
    NOW,
  );
  assert.equal(state, 'LOW_CONFIDENCE');
});

// === Decision categories (Phase 17) ===

test('a program with no signals at all is SKIP with an explicit reason', () => {
  const empty = program('empty', { signals: {} });
  const assessment = assessProgram(empty, { now: NOW });
  assert.equal(assessment.recommendedAction, 'SKIP');
  assert.match(assessment.recommendationReason, /no signal data/);
});

test('assessPrograms maps over the whole candidate set', () => {
  const results = assessPrograms([program('a'), program('b')], { now: NOW });
  assert.equal(results.length, 2);
});

// === Explanations are generated from facts, never invented (Phase 19) ===

test('positive/negative/unknown factor lists are derived straight from the score components and missing signals', () => {
  const p = program('explained', {
    signals: {
      bountyAttractiveness: signal(0.9, 0.9, 'great bounty'),
      competitionPressure: signal(0.1, 0.9, 'crowded'),
    },
  });
  const assessment = assessProgram(p, { now: NOW });
  assert.ok(assessment.positiveFactors.some((f) => f.includes('bountyAttractiveness') && f.includes('great bounty')));
  assert.ok(assessment.negativeFactors.some((f) => f.includes('competitionPressure') && f.includes('crowded')));
  assert.ok(assessment.unknownFactors.some((f) => f.includes('assetSurfaceBreadth')));
});
