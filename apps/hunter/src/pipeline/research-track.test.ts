import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { appendMemory, recordMemory } from '../memory/hunt-memory.js';
import { analyzeJavaScript } from '../recon/js-intel.js';
import type { ProgramScope } from '../types.js';
import { addEdge, emptyWorldModel, upsertNode } from '../worldmodel/graph.js';
import { runResearchTrack } from './research-track.js';

function program(): ProgramScope {
  return {
    programId: 'prog-1',
    programName: 'Test Program',
    platform: 'hackerone',
    authorizationConfirmed: true,
    assets: [
      {
        identifier: 'app.example.com',
        type: 'domain',
        instruction: 'in-scope',
        tier: 'standard',
        bountyEligible: true,
        requiresAuthentication: false,
      },
    ],
    rulesOfEngagement: [],
    disallowedTechniques: [],
    rateLimitPerMinute: 60,
  };
}

async function withTempWorkspace<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-research-track-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('runResearchTrack wires anomaly detection, cascade, provenance, state-graph, and attack-path into one real pass', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const jsResult = analyzeJavaScript(
      'fetch(`/internal/admin/export/{id}`); if (user.role === "admin") { showPanel(); }',
      'bundle-admin.js',
      'https://app.example.com/admin',
      'e1',
    );

    let worldModel = emptyWorldModel();
    const js = upsertNode(worldModel, {
      kind: 'js-artifact',
      label: 'bundle-admin.js',
      source: 'js-intelligence',
      confidence: 1,
    });
    worldModel = js.model;
    const endpoint = upsertNode(worldModel, {
      kind: 'endpoint',
      label: '/internal/admin/export/{id}',
      source: 'js-intelligence',
      confidence: 0.6,
    });
    worldModel = endpoint.model;
    worldModel = addEdge(worldModel, js.node.id, endpoint.node.id, 'references');

    const output = await runResearchTrack({
      engagementId: 'e1',
      workspaceDir,
      program: program(),
      worldModel,
      jsProvenanceEdges: jsResult.provenanceEdges,
      behavioralFixtures: [
        {
          assetRef: 'https://app.example.com/internal/admin/users',
          endpoint: '/internal/admin/users',
          responses: {
            anonymous: { status: 200, bodySnippet: '{"users":[{"id":1}]}' },
            'privileged-user': { status: 200, bodySnippet: '{"users":[{"id":1}]}' },
          },
        },
      ],
      isInScope: () => true,
    });

    assert.ok(
      output.anomalies.length === 0,
      'identical anonymous/privileged responses produce no anomaly by themselves (status+body match)',
    );
    assert.ok(output.provenanceEdges.length > 0, 'JS-derived provenance edges are persisted');
    assert.ok(
      output.hypotheses.some((h) => h.vulnClass === 'authz'),
      'client-side auth-logic provenance produces an authz hypothesis',
    );
    assert.ok(output.transitions.length >= 2, 'behavioral fixture responses become workflow transitions');
    assert.ok(output.log.some((line) => line.includes('research-track anomaly-detection')));
    assert.ok(output.log.some((line) => line.includes('research-track provenance')));
    assert.ok(output.log.some((line) => line.includes('research-track state-graph')));
    assert.ok(output.log.some((line) => line.includes('research-track attack-path')));
  });
});

test('runResearchTrack detects a real behavioral anomaly and turns it into competing hypotheses', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const output = await runResearchTrack({
      engagementId: 'e1',
      workspaceDir,
      program: program(),
      worldModel: emptyWorldModel(),
      jsProvenanceEdges: [],
      behavioralFixtures: [
        {
          assetRef: 'https://app.example.com/api/resource',
          endpoint: '/api/resource',
          responses: {
            anonymous: { status: 403, bodySnippet: '{"error":"forbidden"}' },
            'privileged-user': { status: 200, bodySnippet: '{"data":"secret"}' },
          },
        },
      ],
      isInScope: () => true,
    });

    assert.ok(output.anomalies.length > 0);
    assert.ok(output.hypotheses.length >= 2, 'a real anomaly branches into multiple competing hypotheses');
    assert.ok(output.cascadeEvents.some((e) => e.kind === 'hypothesis-generated'));
  });
});

test('runResearchTrack respects scope: an out-of-scope asset produces no hypotheses', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const output = await runResearchTrack({
      engagementId: 'e1',
      workspaceDir,
      program: program(),
      worldModel: emptyWorldModel(),
      jsProvenanceEdges: [],
      behavioralFixtures: [
        {
          assetRef: 'https://out-of-scope.example.com/x',
          endpoint: '/x',
          responses: {
            anonymous: { status: 403, bodySnippet: 'a' },
            'privileged-user': { status: 200, bodySnippet: 'b' },
          },
        },
      ],
      isInScope: () => false,
    });
    assert.equal(output.hypotheses.length, 0);
  });
});

test('runResearchTrack without live execution options never produces a finding (no unauthorized/unconfirmed claims)', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const output = await runResearchTrack({
      engagementId: 'e1',
      workspaceDir,
      program: program(),
      worldModel: emptyWorldModel(),
      jsProvenanceEdges: [],
      behavioralFixtures: [
        {
          assetRef: 'https://app.example.com/api/resource',
          endpoint: '/api/resource',
          responses: {
            anonymous: { status: 403, bodySnippet: 'a' },
            'privileged-user': { status: 200, bodySnippet: 'b' },
          },
        },
      ],
      isInScope: () => true,
    });
    assert.equal(output.findings.length, 0);
    assert.ok(output.log.some((line) => line.includes('deferred')));
  });
});

test('runResearchTrack loads prior hunt memory and reports it, so experiment selection is genuinely memory-aware', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const withoutMemory = await runResearchTrack({
      engagementId: 'e1',
      workspaceDir,
      program: program(),
      worldModel: emptyWorldModel(),
      jsProvenanceEdges: [],
      behavioralFixtures: [
        {
          assetRef: 'https://app.example.com/api/resource',
          endpoint: '/api/resource',
          responses: {
            anonymous: { status: 403, bodySnippet: 'a' },
            'privileged-user': { status: 200, bodySnippet: 'b' },
          },
        },
      ],
      isInScope: () => true,
    });
    assert.ok(!withoutMemory.log.some((line) => line.includes('research-track memory: loaded')));

    await appendMemory(
      workspaceDir,
      recordMemory({
        kind: 'false-positive-pattern',
        description: 'authz leads on this program have repeatedly been false positives',
        outcome: 'negative',
        confidence: 0.6,
        source: 'test',
        vulnClass: 'authz',
      }),
    );

    const withMemory = await runResearchTrack({
      engagementId: 'e2',
      workspaceDir,
      program: program(),
      worldModel: emptyWorldModel(),
      jsProvenanceEdges: [],
      behavioralFixtures: [
        {
          assetRef: 'https://app.example.com/api/resource',
          endpoint: '/api/resource',
          responses: {
            anonymous: { status: 403, bodySnippet: 'a' },
            'privileged-user': { status: 200, bodySnippet: 'b' },
          },
        },
      ],
      isInScope: () => true,
    });
    assert.ok(withMemory.log.some((line) => line.includes('research-track memory: loaded 1 prior experience')));
  });
});

test('runResearchTrack persists the provenance graph and state graph so a second call sees prior data', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const jsResult = analyzeJavaScript('fetch(`/x/{id}`);', 'bundle.js', 'https://app.example.com', 'e1');
    const first = await runResearchTrack({
      engagementId: 'e1',
      workspaceDir,
      program: program(),
      worldModel: emptyWorldModel(),
      jsProvenanceEdges: jsResult.provenanceEdges,
      behavioralFixtures: [],
      isInScope: () => true,
    });
    const second = await runResearchTrack({
      engagementId: 'e1',
      workspaceDir,
      program: program(),
      worldModel: emptyWorldModel(),
      jsProvenanceEdges: [],
      behavioralFixtures: [],
      isInScope: () => true,
    });
    assert.equal(second.provenanceEdges.length, first.provenanceEdges.length);
  });
});
