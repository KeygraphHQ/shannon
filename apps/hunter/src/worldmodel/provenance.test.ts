import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  findSuspiciousTransformations,
  loadProvenanceGraph,
  type NewProvenanceEdgeInput,
  provenanceFilePath,
  provenanceToHypotheses,
  recordProvenanceEdge,
  saveProvenanceGraph,
} from './provenance.js';

function edgeInput(overrides: Partial<NewProvenanceEdgeInput> = {}): NewProvenanceEdgeInput {
  return {
    engagementId: 'eng-1',
    sourceKind: 'url-parameter',
    sourceRef: 'returnUrl',
    transformation: 'copied verbatim into a Set-Cookie response header',
    sinkKind: 'cookie',
    sinkRef: 'session-service',
    observation: 'observed the parameter value reflected in Set-Cookie',
    source: 'js-intelligence',
    confidence: 0.8,
    ...overrides,
  };
}

test('recordProvenanceEdge produces a well-formed edge with provenance', () => {
  const edge = recordProvenanceEdge(edgeInput());
  assert.equal(edge.sourceRef, 'returnUrl');
  assert.equal(edge.verificationState, 'unverified');
  assert.equal(edge.provenance.source, 'js-intelligence');
});

test('save then load round-trips the provenance graph', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-provenance-'));
  try {
    const edges = [recordProvenanceEdge(edgeInput()), recordProvenanceEdge(edgeInput({ sourceRef: 'redirect' }))];
    await saveProvenanceGraph(dir, 'eng-1', edges);
    const loaded = await loadProvenanceGraph(dir, 'eng-1');
    assert.ok(loaded.ok);
    assert.equal(loaded.value.length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadProvenanceGraph fails closed (returns a Result error, never throws or fabricates data) on a corrupted file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-provenance-'));
  try {
    const filePath = provenanceFilePath(dir, 'eng-1');
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, '{not valid json', 'utf8');
    const loaded = await loadProvenanceGraph(dir, 'eng-1');
    assert.equal(loaded.ok, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadProvenanceGraph returns empty, not an error, when nothing was ever saved', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-provenance-'));
  try {
    const loaded = await loadProvenanceGraph(dir, 'never-existed');
    assert.ok(loaded.ok);
    assert.deepEqual(loaded.value, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('findSuspiciousTransformations flags an untrusted source reaching a security-relevant sink', () => {
  const edges = [recordProvenanceEdge(edgeInput())];
  const seeds = findSuspiciousTransformations(edges);
  assert.equal(seeds.length, 1);
  assert.equal(seeds[0]?.vulnClass, 'session-manipulation');
});

test('findSuspiciousTransformations ignores sinks with no plausible security relevance', () => {
  const edges = [recordProvenanceEdge(edgeInput({ sinkKind: 'subsequent-request', sinkRef: 'analytics-beacon' }))];
  const seeds = findSuspiciousTransformations(edges);
  assert.equal(seeds.length, 0);
});

test('findSuspiciousTransformations ignores contradicted edges', () => {
  const edges = [recordProvenanceEdge(edgeInput({ verificationState: 'contradicted' }))];
  const seeds = findSuspiciousTransformations(edges);
  assert.equal(seeds.length, 0);
});

test('an already-trusted source reaching the same sink scores lower confidence than an untrusted one', () => {
  const untrusted = findSuspiciousTransformations([recordProvenanceEdge(edgeInput({ sourceKind: 'url-parameter' }))]);
  const trusted = findSuspiciousTransformations([
    recordProvenanceEdge(edgeInput({ sourceKind: 'api-response', sourceRef: 'server-issued-token' })),
  ]);
  assert.ok((untrusted[0]?.confidence ?? 0) > (trusted[0]?.confidence ?? 0));
});

test('provenanceToHypotheses turns a suspicious flow into a real hypothesis, not just a log line', () => {
  const edges = [recordProvenanceEdge(edgeInput())];
  const hypotheses = provenanceToHypotheses(edges, 'eng-1');
  assert.equal(hypotheses.length, 1);
  assert.equal(hypotheses[0]?.vulnClass, 'session-manipulation');
  assert.equal(hypotheses[0]?.status, 'open');
  assert.ok(hypotheses[0]?.statement.includes('returnUrl'));
});

test('provenanceToHypotheses groups multiple edges into the same sink into one hypothesis', () => {
  const edges = [
    recordProvenanceEdge(edgeInput({ sourceRef: 'returnUrl' })),
    recordProvenanceEdge(edgeInput({ sourceRef: 'next' })),
  ];
  const hypotheses = provenanceToHypotheses(edges, 'eng-1');
  assert.equal(hypotheses.length, 1);
  assert.ok(hypotheses[0]?.statement.includes('returnUrl'));
  assert.ok(hypotheses[0]?.statement.includes('next'));
});

test('provenanceToHypotheses produces nothing from a DOM-XSS-shaped edge into a different vulnClass', () => {
  const edges = [
    recordProvenanceEdge(edgeInput({ sinkKind: 'dom-sink', sinkRef: 'search-results-panel', sourceRef: 'q' })),
  ];
  const hypotheses = provenanceToHypotheses(edges, 'eng-1');
  assert.equal(hypotheses.length, 1);
  assert.equal(hypotheses[0]?.vulnClass, 'xss');
});
