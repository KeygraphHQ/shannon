/**
 * Live localhost end-to-end test for attack-path discovery.
 *
 * `research-track.test.ts` only ever exercises `findAttackChains` against a
 * synthetic, hand-built combined graph. This proves the same engine over a
 * *genuinely collected* provenance edge: a real HTTP fetch of the local
 * test app's search page, real JS collection (`recon/js-live.ts`) of its
 * script, and the real DOM-XSS pattern in that script producing a real
 * `worldmodel/provenance.ts` edge — all over a real socket to 127.0.0.1,
 * never a fixture standing in for a live discovery.
 *
 * A single live fetch cannot, by itself, produce a *multi-hop* chain (that
 * needs a second graph — the application state/workflow graph — with data
 * in it), so this test also seeds one state-graph transition directly via
 * `worldmodel/state-graph.ts:saveStateGraph`, exactly as
 * `pipeline/research-track.ts` itself would if a prior round's behavioral
 * testing had already recorded one. This is the honestly-labeled seam
 * between "genuinely live" (the JS/provenance half) and "deterministically
 * seeded" (the workflow-transition half) — see the inline comments.
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { analyzeLiveApplication } from '../recon/js-live.js';
import { startLocalTestApp } from '../testing/local-app-server.js';
import type { ProgramScope } from '../types.js';
import { emptyWorldModel, upsertNode } from '../worldmodel/graph.js';
import { recordTransition, saveStateGraph } from '../worldmodel/state-graph.js';
import { runResearchTrack } from './research-track.js';

function program(): ProgramScope {
  return {
    programId: 'local-attack-path-e2e',
    programName: 'Local Attack-Path E2E',
    platform: 'hackerone',
    authorizationConfirmed: true,
    assets: [
      {
        identifier: '127.0.0.1',
        type: 'ip',
        instruction: 'in-scope',
        tier: 'standard',
        bountyEligible: true,
        requiresAuthentication: false,
      },
    ],
    rulesOfEngagement: [],
    disallowedTechniques: [],
    rateLimitPerMinute: 600,
  };
}

async function withTempWorkspace<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-attack-path-live-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('a real JS discovery and a real provenance edge chain into a workflow transition, discovered live', async () => {
  const app = await startLocalTestApp();
  try {
    await withTempWorkspace(async (workspaceDir) => {
      // === Genuinely live: fetch the page, fetch app.js, recover its source map, analyze both. ===
      const pageUrl = `${app.url}/`;
      const liveResult = await analyzeLiveApplication(pageUrl, app.url, 'e1');

      const domXssEdge = liveResult.provenanceEdges.find((e) => e.sinkKind === 'dom-sink');
      assert.ok(
        domXssEdge,
        "the local test app's real app.js contains a genuine DOM-XSS pattern; a live provenance edge must be produced from it",
      );
      assert.equal(domXssEdge?.sinkRef, app.url, 'the sink is the real page asset, not the script filename');

      let worldModel = emptyWorldModel();
      for (const discovery of liveResult.discoveries) {
        const up = upsertNode(worldModel, {
          kind: discovery.kind,
          label: discovery.label,
          source: discovery.source,
          confidence: discovery.confidence,
          attributes: discovery.attributes,
        });
        worldModel = up.model;
      }
      assert.ok(
        worldModel.nodes.some((n) => n.kind === 'js-artifact' && n.label === `${app.url}/app.js`),
        'the real app.js script must be recorded as a js-artifact node from the live fetch',
      );

      // === Deterministically seeded: a workflow transition, exactly as a
      // prior round of real behavioral testing would have recorded one
      // (see `pipeline/research-track.ts`'s own behavioral-fixture ->
      // transition conversion) — not itself a live HTTP call in this test,
      // but real data once written by an actual round.
      await saveStateGraph(workspaceDir, 'e1', [
        recordTransition({
          engagementId: 'e1',
          actorRef: 'user-a',
          role: 'authenticated-user',
          authState: 'authenticated-user',
          fromState: app.url,
          action: 'proceed-to-checkout',
          toState: 'checkout',
          authorizationOutcome: 'allowed',
          resourceRef: 'checkout',
          source: 'behavioral-diff',
        }),
      ]);

      const output = await runResearchTrack({
        engagementId: 'e1',
        workspaceDir,
        program: program(),
        worldModel,
        jsProvenanceEdges: liveResult.provenanceEdges,
        behavioralFixtures: [],
        isInScope: () => true,
      });

      const chain = output.attackChains.find((c) => c.endRef === 'checkout');
      assert.ok(
        chain,
        'a chain must connect the live JS discovery, through the live provenance edge, to the seeded workflow transition',
      );
      assert.equal(chain?.steps.length, 2);
      assert.equal(chain?.steps[0]?.kind, 'provenance-edge');
      assert.equal(chain?.steps[1]?.kind, 'state-transition');
      assert.ok(chain && chain.score > 0 && chain.score < 1);
      assert.ok(output.log.some((line) => line.includes('research-track attack-path')));
    });
  } finally {
    await app.close();
  }
});
