import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildOpportunityReport } from './decision.js';
import type { DiscoveredProgram, ProgramSignal } from './types.js';
import { prioritizeRefresh } from './value-of-information.js';

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

test('is deterministic given the same report', () => {
  const report = buildOpportunityReport(
    [
      program('a', { signals: { capabilityFit: signal(0.9) } }),
      program('b', { signals: { bountyAttractiveness: signal(0.5), capabilityFit: signal(0.5) } }),
    ],
    { now: NOW },
  );
  assert.deepEqual(prioritizeRefresh(report.top), prioritizeRefresh(report.top));
});

test('a program resting on mostly-missing signals is prioritized over one already well-evidenced', () => {
  const sparse = program('sparse', { signals: { capabilityFit: signal(0.9) } });
  const rich = program('rich', {
    signals: {
      bountyAttractiveness: signal(0.6),
      competitionPressure: signal(0.6),
      disclosedReportDensity: signal(0.5),
      vulnClassHistory: signal(0.5),
      assetSurfaceBreadth: signal(0.5),
      researchCost: signal(0.5),
      programFreshness: signal(0.5),
      capabilityFit: signal(0.6),
    },
  });
  const report = buildOpportunityReport([sparse, rich], { now: NOW });
  const priorities = prioritizeRefresh(report.top);
  const sparsePriority = priorities.find((p) => p.programId === 'sparse');
  const richPriority = priorities.find((p) => p.programId === 'rich');
  assert.ok(sparsePriority && richPriority);
  assert.ok(sparsePriority.priorityScore > richPriority.priorityScore);
});

test('suggested actions name the actual missing signal families, not a generic placeholder', () => {
  const noBountyNoDisclosure = program('x', { signals: { assetSurfaceBreadth: signal(0.5) } });
  const report = buildOpportunityReport([noBountyNoDisclosure], { now: NOW });
  const [priority] = prioritizeRefresh(report.top);
  assert.ok(priority);
  assert.ok(priority.suggestedActions.some((a) => a.includes('bounty')));
  assert.ok(priority.suggestedActions.some((a) => a.includes('disclosed-report')));
});

test('limit caps the returned list', () => {
  const programs = Array.from({ length: 10 }, (_, i) => program(`p${i}`, { signals: { capabilityFit: signal(0.5) } }));
  const report = buildOpportunityReport(programs, { now: NOW, topN: 10 });
  const priorities = prioritizeRefresh(report.top, 3);
  assert.equal(priorities.length, 3);
});
