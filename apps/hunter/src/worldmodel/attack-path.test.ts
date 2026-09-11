import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WorldModel } from '../types.js';
import { bestChainPerEndpoint, findAttackChains } from './attack-path.js';
import { addEdge, emptyWorldModel, upsertNode } from './graph.js';
import { recordProvenanceEdge } from './provenance.js';
import { recordTransition } from './state-graph.js';

function buildSyntheticGraph(): WorldModel {
  let model = emptyWorldModel();
  const js = upsertNode(model, {
    kind: 'js-artifact',
    label: 'bundle-admin.js',
    source: 'js-intelligence',
    confidence: 1,
  });
  model = js.model;
  const endpoint = upsertNode(model, {
    kind: 'endpoint',
    label: '/api/admin/export',
    source: 'js-intelligence',
    confidence: 0.6,
  });
  model = endpoint.model;
  model = addEdge(model, js.node.id, endpoint.node.id, 'references');
  return model;
}

test('findAttackChains connects a JS observation through a provenance edge and a state transition to an impact', () => {
  const worldModel = buildSyntheticGraph();
  const provenanceEdges = [
    recordProvenanceEdge({
      engagementId: 'eng-1',
      sourceKind: 'url-parameter',
      sourceRef: '/api/admin/export',
      transformation: 'resource id parameter passed straight into server-side export handler',
      sinkKind: 'server-side-processing',
      sinkRef: 'user-resource',
      observation: 'export handler reads the id parameter without re-checking ownership',
      source: 'js-intelligence',
      confidence: 0.7,
    }),
  ];
  const transitions = [
    recordTransition({
      engagementId: 'eng-1',
      actorRef: 'user-a',
      role: 'user',
      authState: 'authenticated-user',
      fromState: 'user-resource',
      action: 'export',
      toState: 'exported',
      authorizationOutcome: 'allowed',
      resourceRef: 'user-resource',
      source: 'behavioral-diff',
    }),
  ];

  const chains = findAttackChains({ worldModel, provenanceEdges, transitions }, ['bundle-admin.js'], {
    isHighValueTarget: (ref) => ref === 'exported',
  });

  assert.equal(chains.length, 1);
  const chain = chains[0];
  assert.ok(chain);
  assert.equal(chain.steps.length, 3);
  assert.equal(chain.steps[0]?.kind, 'world-model-edge');
  assert.equal(chain.steps[1]?.kind, 'provenance-edge');
  assert.equal(chain.steps[2]?.kind, 'state-transition');
  assert.equal(chain.endRef, 'exported');
  assert.ok(chain.score > 0 && chain.score < 1);
});

test('findAttackChains never traverses into an out-of-scope ref', () => {
  const worldModel = buildSyntheticGraph();
  const provenanceEdges = [
    recordProvenanceEdge({
      engagementId: 'eng-1',
      sourceKind: 'url-parameter',
      sourceRef: '/api/admin/export',
      transformation: 'x',
      sinkKind: 'server-side-processing',
      sinkRef: 'out-of-scope-resource',
      observation: 'x',
      source: 'js-intelligence',
      confidence: 0.7,
    }),
  ];

  const chains = findAttackChains({ worldModel, provenanceEdges, transitions: [] }, ['bundle-admin.js'], {
    isHighValueTarget: (ref) => ref === 'out-of-scope-resource',
    isInScope: (ref) => ref !== 'out-of-scope-resource',
  });
  assert.equal(chains.length, 0);
});

test('findAttackChains does not revisit a ref within the same path (cycle-safe)', () => {
  let model = emptyWorldModel();
  const a = upsertNode(model, { kind: 'endpoint', label: 'a', source: 'test', confidence: 1 });
  model = a.model;
  const b = upsertNode(model, { kind: 'endpoint', label: 'b', source: 'test', confidence: 1 });
  model = b.model;
  model = addEdge(model, a.node.id, b.node.id, 'references');
  model = addEdge(model, b.node.id, a.node.id, 'references');

  const chains = findAttackChains({ worldModel: model, provenanceEdges: [], transitions: [] }, ['a'], {
    isHighValueTarget: () => false,
    maxHops: 10,
  });
  assert.equal(chains.length, 0);
});

test('findAttackChains respects maxHops', () => {
  let model = emptyWorldModel();
  const labels = ['a', 'b', 'c', 'd'];
  const nodes = labels.map((label) => {
    const up = upsertNode(model, { kind: 'endpoint', label, source: 'test', confidence: 1 });
    model = up.model;
    return up.node;
  });
  for (let i = 0; i < nodes.length - 1; i += 1) {
    const from = nodes[i];
    const to = nodes[i + 1];
    if (from && to) model = addEdge(model, from.id, to.id, 'references');
  }

  const reachable = findAttackChains({ worldModel: model, provenanceEdges: [], transitions: [] }, ['a'], {
    isHighValueTarget: (ref) => ref === 'd',
    maxHops: 3,
  });
  assert.equal(reachable.length, 1);

  const unreachable = findAttackChains({ worldModel: model, provenanceEdges: [], transitions: [] }, ['a'], {
    isHighValueTarget: (ref) => ref === 'd',
    maxHops: 2,
  });
  assert.equal(unreachable.length, 0);
});

test('bestChainPerEndpoint keeps only the highest-scored chain per start/end pair', () => {
  const chains = [
    { id: '1', steps: [], score: 0.4, startRef: 'a', endRef: 'z' },
    { id: '2', steps: [], score: 0.9, startRef: 'a', endRef: 'z' },
    { id: '3', steps: [], score: 0.5, startRef: 'b', endRef: 'z' },
  ];
  const best = bestChainPerEndpoint(chains);
  assert.equal(best.length, 2);
  assert.ok(best.some((c) => c.id === '2'));
  assert.ok(best.some((c) => c.id === '3'));
});
