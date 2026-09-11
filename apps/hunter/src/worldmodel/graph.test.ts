import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  addEdge,
  crossSourceCorrelatedNodes,
  emptyWorldModel,
  findNode,
  loadWorldModel,
  nodesByKind,
  relatedNodes,
  saveWorldModel,
  setVerificationStatus,
  staleNodes,
  upsertNode,
} from './graph.js';

test('upsertNode inserts a new node with single-source provenance', () => {
  const { model, node, isNew } = upsertNode(emptyWorldModel(), {
    kind: 'host',
    label: 'api.example.com',
    source: 'subfinder',
    confidence: 0.8,
  });
  assert.equal(isNew, true);
  assert.equal(node.provenance.length, 1);
  assert.equal(model.nodes.length, 1);
});

test('upsertNode merges a second source discovering the same node into one, with two-source provenance', () => {
  const first = upsertNode(emptyWorldModel(), {
    kind: 'host',
    label: 'api.example.com',
    source: 'subfinder',
    confidence: 0.8,
  });
  const second = upsertNode(first.model, {
    kind: 'host',
    label: 'API.EXAMPLE.COM',
    source: 'ct-logs',
    confidence: 0.9,
  });

  assert.equal(second.isNew, false);
  assert.equal(second.model.nodes.length, 1);
  assert.equal(second.node.provenance.length, 2);
  assert.deepEqual(second.node.provenance.map((p) => p.source).sort(), ['ct-logs', 'subfinder']);
});

test('upsertNode does not duplicate provenance when the same source reports the same node again', () => {
  const first = upsertNode(emptyWorldModel(), {
    kind: 'host',
    label: 'api.example.com',
    source: 'subfinder',
    confidence: 0.8,
  });
  const second = upsertNode(first.model, {
    kind: 'host',
    label: 'api.example.com',
    source: 'subfinder',
    confidence: 0.95,
  });
  assert.equal(second.node.provenance.length, 1);
});

test('upsertNode merges attributes rather than replacing them', () => {
  const first = upsertNode(emptyWorldModel(), {
    kind: 'endpoint',
    label: '/search',
    source: 'katana',
    confidence: 0.7,
    attributes: { method: 'GET' },
  });
  const second = upsertNode(first.model, {
    kind: 'endpoint',
    label: '/search',
    source: 'js-intel',
    confidence: 0.6,
    attributes: { hasParameters: true },
  });
  assert.deepEqual(second.node.attributes, { method: 'GET', hasParameters: true });
});

test('crossSourceCorrelatedNodes only returns nodes seen by more than one source', () => {
  const singleSource = upsertNode(emptyWorldModel(), {
    kind: 'host',
    label: 'a.example.com',
    source: 'subfinder',
    confidence: 0.5,
  });
  const multiSource = upsertNode(singleSource.model, {
    kind: 'host',
    label: 'b.example.com',
    source: 'subfinder',
    confidence: 0.5,
  });
  const corroborated = upsertNode(multiSource.model, {
    kind: 'host',
    label: 'b.example.com',
    source: 'amass',
    confidence: 0.5,
  });

  const correlated = crossSourceCorrelatedNodes(corroborated.model);
  assert.equal(correlated.length, 1);
  assert.equal(correlated[0]?.label, 'b.example.com');
});

test('addEdge connects nodes and relatedNodes traverses it, optionally filtered by relation', () => {
  const withHost = upsertNode(emptyWorldModel(), {
    kind: 'host',
    label: 'api.example.com',
    source: 'subfinder',
    confidence: 0.8,
  });
  const withEndpoint = upsertNode(withHost.model, {
    kind: 'endpoint',
    label: '/search',
    source: 'katana',
    confidence: 0.7,
  });
  const connected = addEdge(withEndpoint.model, withHost.node.id, withEndpoint.node.id, 'exposes');

  const related = relatedNodes(connected, withHost.node.id);
  assert.equal(related.length, 1);
  assert.equal(related[0]?.label, '/search');

  assert.equal(relatedNodes(connected, withHost.node.id, 'hosts').length, 0);
});

test('addEdge is idempotent for the same (from, to, relation) triple', () => {
  const withHost = upsertNode(emptyWorldModel(), {
    kind: 'host',
    label: 'api.example.com',
    source: 'subfinder',
    confidence: 0.8,
  });
  const withEndpoint = upsertNode(withHost.model, {
    kind: 'endpoint',
    label: '/search',
    source: 'katana',
    confidence: 0.7,
  });
  let model = addEdge(withEndpoint.model, withHost.node.id, withEndpoint.node.id, 'exposes');
  model = addEdge(model, withHost.node.id, withEndpoint.node.id, 'exposes');
  assert.equal(model.edges.length, 1);
});

test('findNode and nodesByKind look nodes up by kind/label', () => {
  const { model } = upsertNode(emptyWorldModel(), {
    kind: 'host',
    label: 'api.example.com',
    source: 'subfinder',
    confidence: 0.8,
  });
  assert.ok(findNode(model, 'host', 'API.example.com'));
  assert.equal(nodesByKind(model, 'host').length, 1);
  assert.equal(nodesByKind(model, 'endpoint').length, 0);
});

test('saveWorldModel then loadWorldModel round-trips, and loadWorldModel returns empty for a missing file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-worldmodel-test-'));
  try {
    const missing = await loadWorldModel(dir, 'e1');
    assert.equal(missing.ok, true);
    if (missing.ok) assert.deepEqual(missing.value, emptyWorldModel());

    const { model } = upsertNode(emptyWorldModel(), {
      kind: 'host',
      label: 'api.example.com',
      source: 'subfinder',
      confidence: 0.8,
    });
    await saveWorldModel(dir, 'e1', model);
    const loaded = await loadWorldModel(dir, 'e1');
    assert.equal(loaded.ok, true);
    if (loaded.ok) assert.equal(loaded.value.nodes.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('setVerificationStatus updates only the targeted node and bumps lastSeenAt', () => {
  const { model, node } = upsertNode(emptyWorldModel(), {
    kind: 'endpoint',
    label: '/admin',
    source: 'httpx',
    confidence: 0.7,
  });
  const updated = setVerificationStatus(model, node.id, 'contradicted');
  const found = findNode(updated, 'endpoint', '/admin');
  assert.equal(found?.verificationStatus, 'contradicted');
  assert.ok(new Date(found?.lastSeenAt ?? 0).getTime() >= new Date(node.lastSeenAt).getTime());
});

test('staleNodes returns nodes not seen within the ttl and excludes fresh ones', () => {
  const stalePast = new Date(Date.now() - 10_000).toISOString();
  const { model: withStale } = upsertNode(emptyWorldModel(), {
    kind: 'host',
    label: 'old.example.com',
    source: 'subfinder',
    confidence: 0.5,
  });
  const staleModel = { nodes: withStale.nodes.map((n) => ({ ...n, lastSeenAt: stalePast })), edges: withStale.edges };
  const { model: withFresh } = upsertNode(staleModel, {
    kind: 'host',
    label: 'fresh.example.com',
    source: 'subfinder',
    confidence: 0.5,
  });

  const stale = staleNodes(withFresh, new Date().toISOString(), 5_000);
  assert.equal(stale.length, 1);
  assert.equal(stale[0]?.label, 'old.example.com');
});
