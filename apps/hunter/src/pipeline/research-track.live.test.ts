/**
 * Live localhost end-to-end test for the research track.
 *
 * Unlike `research-track.test.ts` (fully offline/synthetic), this drives
 * `runResearchTrack` with `live` execution enabled against
 * `testing/local-app-server.ts` — a real experiment really executes over a
 * real socket to 127.0.0.1. It proves two things the offline tests cannot:
 *
 * 1. A genuinely designed experiment can genuinely run through the exact
 *    same `executeActionViaRegistry` gate chain the primary loop uses, and
 *    its real observation folds back into the hypothesis that spawned it.
 * 2. Even when a real anomaly was found and a real experiment ran, the
 *    research track never fabricates a finding from an unverified
 *    behavioral-diff observation alone (RULE 7) — adversarial validation
 *    correctly reports "inconclusive," not "passed," and zero findings are
 *    produced. This is the "does not report the false-positive/unproven
 *    lead" property, demonstrated live rather than only asserted offline.
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { AuthStateHeaders } from '../recon/behavioral-live.js';
import { startLocalTestApp } from '../testing/local-app-server.js';
import { buildDefaultToolRegistry } from '../tools/default-registry.js';
import type { ProgramScope } from '../types.js';
import { emptyWorldModel } from '../worldmodel/graph.js';
import { runResearchTrack } from './research-track.js';

async function withTempWorkspace<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-research-live-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('research track live: a real anomaly drives a real experiment, but never fabricates a finding without verified reproduction', async () => {
  const app = await startLocalTestApp();
  try {
    await withTempWorkspace(async (workspaceDir) => {
      const program: ProgramScope = {
        programId: 'local-research-e2e',
        programName: 'Local Research E2E',
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

      const assetRef = `${app.url}/api/admin/users`;
      // anonymous (no/blank role -> 200 privileged body) vs authenticated-user
      // (any other role string -> 403) is a genuine, real anomaly on this
      // fixture app: an authenticated user getting *less* access than an
      // anonymous one.
      const headersByState: AuthStateHeaders = {
        anonymous: { 'x-test-role': 'anonymous' },
        'authenticated-user': { 'x-test-role': 'authenticated-user' },
      };

      const output = await runResearchTrack({
        engagementId: 'e1',
        workspaceDir,
        program,
        worldModel: emptyWorldModel(),
        jsProvenanceEdges: [],
        behavioralFixtures: [
          {
            assetRef,
            endpoint: '/api/admin/users',
            responses: {
              anonymous: { status: 200, bodySnippet: '{"users":[{"id":1,"name":"admin"}]}' },
              'authenticated-user': { status: 403, bodySnippet: '{"error":"forbidden"}' },
            },
          },
        ],
        isInScope: () => true,
        live: {
          registry: buildDefaultToolRegistry(),
          behavioralAuthStatesByAsset: new Map([[assetRef, headersByState]]),
        },
      });

      assert.ok(output.anomalies.length > 0, 'a real status-code anomaly must be detected from the fixture data');
      assert.ok(output.hypotheses.length > 0, 'the anomaly must branch into competing hypotheses');
      assert.ok(
        output.log.some((line) => line.includes('research-track experiment: ran')),
        'a real experiment must actually execute (not just be deferred)',
      );
      assert.ok(
        output.log.some((line) => line.includes('EXECUTED')),
        'the real adapter must report a genuine EXECUTED_* status against 127.0.0.1',
      );
      assert.ok(
        output.log.some((line) => line.includes('adversarial-validation') && line.includes('inconclusive')),
        'an unverified behavioral-diff observation must never be validated as "passed"',
      );
      assert.equal(output.findings.length, 0, 'no finding may be fabricated from an unverified observation alone');
    });
  } finally {
    await app.close();
  }
});
