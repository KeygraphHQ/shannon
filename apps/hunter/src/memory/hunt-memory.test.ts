import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import type { Finding, Hypothesis } from '../types.js';
import {
  appendMemory,
  huntMemoryFilePath,
  loadMemory,
  memoryFromFinding,
  prioritizationMultiplier,
  recordMemory,
} from './hunt-memory.js';

function hypothesis(overrides: Partial<Hypothesis> = {}): Hypothesis {
  const now = new Date().toISOString();
  return {
    id: 'hyp-1',
    engagementId: 'e1',
    statement: 'x',
    vulnClass: 'idor',
    assetRef: 'a',
    supportingObservationIds: [],
    contradictingObservationIds: [],
    potentialImpact: 'high',
    confidence: 0.8,
    priorityScore: 0.8,
    informationGain: 0.2,
    requiredEvidence: [],
    nextInvestigation: 'x',
    status: 'resolved',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function finding(overrides: Partial<Finding> = {}): Finding {
  const now = new Date().toISOString();
  return {
    id: 'finding-1',
    engagementId: 'e1',
    title: 'x',
    vulnClass: 'idor',
    assetRef: 'a',
    status: 'reported',
    confidence: 0.9,
    observationIds: [],
    evidenceIds: [],
    transitionLog: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test('memoryFromFinding produces nothing for a still-open finding', () => {
  const entries = memoryFromFinding(finding({ status: 'candidate' }), hypothesis(), 'test');
  assert.equal(entries.length, 0);
});

test('memoryFromFinding produces a successful-hypothesis-pattern for a reported finding', () => {
  const entries = memoryFromFinding(finding({ status: 'reported' }), hypothesis(), 'test');
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.kind, 'successful-hypothesis-pattern');
  assert.equal(entries[0]?.outcome, 'positive');
});

test('memoryFromFinding produces a false-positive-pattern for a rejected finding with structured contradictions', () => {
  const h = hypothesis({
    structuredContradictions: [
      { observationId: 'obs-1', note: 'response matched the anonymous baseline', at: new Date().toISOString() },
    ],
  });
  const entries = memoryFromFinding(finding({ status: 'rejected' }), h, 'test');
  assert.equal(entries.length, 2);
  assert.ok(entries.some((e) => e.kind === 'false-positive-pattern'));
});

test('recordMemory always attaches provenance and confidence', () => {
  const entry = recordMemory({
    kind: 'tool-usefulness',
    description: 'x',
    outcome: 'positive',
    confidence: 0.7,
    source: 'test',
  });
  assert.equal(entry.provenance.source, 'test');
  assert.equal(entry.confidence, 0.7);
});

test('save then load round-trips hunt memory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-memory-'));
  try {
    await appendMemory(
      dir,
      recordMemory({ kind: 'tool-usefulness', description: 'a', outcome: 'positive', confidence: 0.5, source: 'test' }),
    );
    await appendMemory(
      dir,
      recordMemory({ kind: 'tool-usefulness', description: 'b', outcome: 'negative', confidence: 0.5, source: 'test' }),
    );
    const loaded = await loadMemory(dir);
    assert.ok(loaded.ok);
    assert.equal(loaded.value.length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadMemory fails closed on a corrupted line rather than throwing or fabricating an entry', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-memory-'));
  try {
    const filePath = huntMemoryFilePath(dir);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, '{not valid json}\n', 'utf8');
    const loaded = await loadMemory(dir);
    assert.equal(loaded.ok, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadMemory returns empty, not an error, for a workspace with no memory yet', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-memory-'));
  try {
    const loaded = await loadMemory(dir);
    assert.ok(loaded.ok);
    assert.deepEqual(loaded.value, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('prioritizationMultiplier rewards a vulnClass with a history of positive outcomes', () => {
  const memory = [
    recordMemory({
      kind: 'successful-hypothesis-pattern',
      description: 'x',
      outcome: 'positive',
      confidence: 0.8,
      source: 'test',
      vulnClass: 'idor',
    }),
    recordMemory({
      kind: 'successful-hypothesis-pattern',
      description: 'x',
      outcome: 'positive',
      confidence: 0.8,
      source: 'test',
      vulnClass: 'idor',
    }),
  ];
  const multiplier = prioritizationMultiplier(memory, 'idor');
  assert.ok(multiplier > 1);
});

test('prioritizationMultiplier penalizes a vulnClass with a history of false positives', () => {
  const memory = [
    recordMemory({
      kind: 'false-positive-pattern',
      description: 'x',
      outcome: 'negative',
      confidence: 0.6,
      source: 'test',
      vulnClass: 'xss',
    }),
    recordMemory({
      kind: 'false-positive-pattern',
      description: 'x',
      outcome: 'negative',
      confidence: 0.6,
      source: 'test',
      vulnClass: 'xss',
    }),
  ];
  const multiplier = prioritizationMultiplier(memory, 'xss');
  assert.ok(multiplier < 1);
});

test('prioritizationMultiplier stays clamped even with a long history', () => {
  const memory = Array.from({ length: 50 }, () =>
    recordMemory({
      kind: 'successful-hypothesis-pattern',
      description: 'x',
      outcome: 'positive',
      confidence: 0.9,
      source: 'test',
      vulnClass: 'authz',
    }),
  );
  assert.equal(prioritizationMultiplier(memory, 'authz'), 1.5);
});

test('prioritizationMultiplier defaults to 1 (neutral) with no relevant history', () => {
  assert.equal(prioritizationMultiplier([], 'ssrf'), 1);
});

test('prioritizationMultiplier is scoped to vulnClass — unrelated history does not leak in', () => {
  const memory = [
    recordMemory({
      kind: 'false-positive-pattern',
      description: 'x',
      outcome: 'negative',
      confidence: 0.6,
      source: 'test',
      vulnClass: 'xss',
    }),
  ];
  assert.equal(prioritizationMultiplier(memory, 'idor'), 1);
});
