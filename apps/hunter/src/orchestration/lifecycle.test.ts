import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { FixtureDiscoveryProvider } from '../discovery/fixture-provider.js';
import type { DiscoveredProgram, ProgramDiscoveryProvider } from '../discovery/types.js';
import { buildBundledSimulationInput } from '../pipeline/simulation-loader.js';
import type { Result } from '../types.js';
import { crossSourceCorrelatedNodes, findNode } from '../worldmodel/graph.js';
import { type AuthorizationRecord, runHuntLifecycle } from './lifecycle.js';

const BUNDLED_DATASET = fileURLToPath(new URL('../../fixtures/discovery/programs.json', import.meta.url));

async function withTempWorkspace<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-lifecycle-test-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

class StaticProvider implements ProgramDiscoveryProvider {
  readonly name = 'static';
  constructor(private readonly programs: readonly DiscoveredProgram[]) {}
  async discoverPrograms(): Promise<Result<readonly DiscoveredProgram[], string>> {
    return { ok: true, value: this.programs };
  }
}

class FailingProvider implements ProgramDiscoveryProvider {
  readonly name = 'failing';
  async discoverPrograms(): Promise<Result<readonly DiscoveredProgram[], string>> {
    return { ok: false, error: 'simulated provider outage' };
  }
}

function authorization(overrides: Partial<AuthorizationRecord> = {}): AuthorizationRecord {
  return {
    confirmed: true,
    confirmedBy: 'test-operator',
    confirmedAt: new Date().toISOString(),
    scopeReviewed: true,
    ...overrides,
  };
}

const WEB_PROGRAM: DiscoveredProgram = {
  programId: 'webtarget',
  programName: 'Web Target Inc',
  platform: 'hackerone',
  offersBounty: true,
  assets: [{ identifier: 'app.example.com', type: 'domain', instruction: 'in-scope' }],
  rulesOfEngagement: [],
  disallowedTechniques: [],
  signals: {
    bountyAttractiveness: { value: 0.7, confidence: 0.9, freshnessAt: new Date().toISOString(), detail: 'test' },
  },
  sourceProvider: 'test',
  discoveredAt: new Date().toISOString(),
};

test('BLOCKED when every discovery provider fails or returns nothing', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const result = await runHuntLifecycle({
      providers: [new FailingProvider()],
      workspaceDir,
      engagementId: 'e1',
      maxRounds: 1,
    });
    assert.ok(result.ok);
    assert.equal(result.value.finalState, 'BLOCKED');
    assert.equal(result.value.huntResult, undefined);
  });
});

test('AWAITING_AUTHORIZATION without an explicit, confirmed authorization record — never proceeds to a live hunt on its own', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const result = await runHuntLifecycle({
      providers: [new StaticProvider([WEB_PROGRAM])],
      workspaceDir,
      engagementId: 'e1',
      maxRounds: 1,
    });
    assert.ok(result.ok);
    assert.equal(result.value.finalState, 'AWAITING_AUTHORIZATION');
    assert.equal(result.value.huntResult, undefined);
    assert.equal(
      result.value.normalizedScopePath,
      undefined,
      'no scope file — and so no authorizationConfirmed:true — is written before authorization',
    );
    assert.ok(result.value.selectionRationale);
  });
});

test('a confirmed:true but scopeReviewed:false record still stops at AWAITING_AUTHORIZATION', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const result = await runHuntLifecycle({
      providers: [new StaticProvider([WEB_PROGRAM])],
      workspaceDir,
      engagementId: 'e1',
      maxRounds: 1,
      authorization: authorization({ scopeReviewed: false }),
    });
    assert.ok(result.ok);
    assert.equal(result.value.finalState, 'AWAITING_AUTHORIZATION');
  });
});

test('BLOCKED after authorization when the selected program has no web-shaped in-scope asset', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const repoOnly: DiscoveredProgram = {
      ...WEB_PROGRAM,
      programId: 'repo-only',
      assets: [{ identifier: './repo', type: 'repo', instruction: 'in-scope' }],
    };
    const result = await runHuntLifecycle({
      providers: [new StaticProvider([repoOnly])],
      workspaceDir,
      engagementId: 'e1',
      maxRounds: 1,
      authorization: authorization(),
    });
    assert.ok(result.ok);
    assert.equal(result.value.finalState, 'BLOCKED');
  });
});

test('authorization writes a normalized scope file with authorizationConfirmed: true, and never before authorization', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const result = await runHuntLifecycle({
      providers: [new StaticProvider([WEB_PROGRAM])],
      workspaceDir,
      engagementId: 'e1',
      maxRounds: 1,
      authorization: authorization(),
    });
    assert.ok(result.ok);
    assert.ok(result.value.normalizedScopePath);
    const written = JSON.parse(await readFile(result.value.normalizedScopePath as string, 'utf8'));
    assert.equal(written.authorizationConfirmed, true);
    assert.equal(written.programId, 'webtarget');
  });
});

test('end to end through the real orchestration path: discover -> rank -> select -> authorize -> run, reaching a validated finding', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const sim = await buildBundledSimulationInput({ engagementId: 'lifecycle-e2e', workspaceDir, maxRounds: 6 });
    const result = await runHuntLifecycle({
      providers: [new StaticProvider([WEB_PROGRAM])],
      workspaceDir,
      engagementId: 'lifecycle-e2e',
      maxRounds: 6,
      authorization: authorization(),
      ...(sim.repoPath !== undefined ? { repoPath: sim.repoPath } : {}),
      passiveSources: sim.passiveSources,
      activeSources: sim.activeSources,
      jsArtifacts: sim.jsArtifacts,
      behavioralFixtures: sim.behavioralFixtures,
      investigationFixtures: sim.investigationFixtures,
      shannonOutputsByAsset: sim.shannonOutputsByAsset,
    });
    assert.ok(result.ok);
    const output = result.value;
    assert.equal(output.finalState, 'COMPLETED');
    assert.equal(output.selected?.program.programId, 'webtarget');
    assert.equal(output.targetUrl, 'https://app.example.com');

    // The lifecycle really did drive the same production adaptive loop —
    // same world model / finding shape as calling runAdaptiveHunt directly
    // (see pipeline/adaptive-loop.test.ts's "full bundled simulation" test).
    const hunt = output.huntResult;
    assert.ok(hunt);
    assert.ok(findNode(hunt.worldModel, 'host', 'app.example.com'));
    assert.ok(crossSourceCorrelatedNodes(hunt.worldModel).length >= 2);
    assert.equal(hunt.finding?.vulnClass, 'xss');
    assert.equal(hunt.finding?.status, 'reported');
    assert.ok(hunt.reportDraftPath);
    const draft = await readFile(hunt.reportDraftPath as string, 'utf8');
    assert.match(draft, /DRAFT — NOT SUBMITTED/);

    // Every declared lifecycle state is visible and ordered.
    const states = output.transitions.map((t) => t.state);
    assert.deepEqual(states, ['DISCOVERY', 'RANKING', 'AWAITING_AUTHORIZATION', 'READY', 'RUNNING', 'COMPLETED']);
  });
});

test('PAUSED when the round budget is exhausted with real work still queued — a resumable state, not COMPLETED', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const sim = await buildBundledSimulationInput({ engagementId: 'lifecycle-paused', workspaceDir, maxRounds: 1 });
    const result = await runHuntLifecycle({
      providers: [new StaticProvider([WEB_PROGRAM])],
      workspaceDir,
      engagementId: 'lifecycle-paused',
      maxRounds: 1, // deliberately too few rounds to finish the bundled scenario
      authorization: authorization(),
      ...(sim.repoPath !== undefined ? { repoPath: sim.repoPath } : {}),
      passiveSources: sim.passiveSources,
      activeSources: sim.activeSources,
      jsArtifacts: sim.jsArtifacts,
      behavioralFixtures: sim.behavioralFixtures,
      investigationFixtures: sim.investigationFixtures,
      shannonOutputsByAsset: sim.shannonOutputsByAsset,
    });
    assert.ok(result.ok);
    assert.equal(result.value.finalState, 'PAUSED');
    assert.equal(result.value.huntResult?.checkpoint.status, 'stopped');
  });
});

test('ROE (disallowedTechniques) survives normalization into the written scope file the hunt actually runs against', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const restricted: DiscoveredProgram = {
      ...WEB_PROGRAM,
      programId: 'restricted',
      disallowedTechniques: ['active-recon'],
    };
    const result = await runHuntLifecycle({
      providers: [new StaticProvider([restricted])],
      workspaceDir,
      engagementId: 'e1',
      maxRounds: 1,
      authorization: authorization(),
    });
    assert.ok(result.ok);
    const written = JSON.parse(await readFile(result.value.normalizedScopePath as string, 'utf8'));
    assert.deepEqual(written.disallowedTechniques, ['active-recon']);
  });
});

test('re-invoking the lifecycle with the same workspace/engagement id resumes the underlying hunt rather than re-running bootstrap recon', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const sim = await buildBundledSimulationInput({ engagementId: 'lifecycle-resume', workspaceDir, maxRounds: 1 });
    const commonInput = {
      providers: [new StaticProvider([WEB_PROGRAM])],
      workspaceDir,
      engagementId: 'lifecycle-resume',
      authorization: authorization(),
      ...(sim.repoPath !== undefined ? { repoPath: sim.repoPath } : {}),
      passiveSources: sim.passiveSources,
      activeSources: sim.activeSources,
      jsArtifacts: sim.jsArtifacts,
      behavioralFixtures: sim.behavioralFixtures,
      investigationFixtures: sim.investigationFixtures,
      shannonOutputsByAsset: sim.shannonOutputsByAsset,
    };

    const first = await runHuntLifecycle({ ...commonInput, maxRounds: 1 });
    assert.ok(first.ok);
    assert.equal(first.value.finalState, 'PAUSED');

    const second = await runHuntLifecycle({ ...commonInput, maxRounds: 6 });
    assert.ok(second.ok);
    assert.equal(second.value.finalState, 'COMPLETED');
    assert.match(
      second.value.huntResult?.log.join('\n') ?? '',
      /resuming hunt at round 1/,
      'the second run must resume the existing checkpoint, not re-run bootstrap recon from scratch',
    );
    assert.equal(second.value.huntResult?.finding?.status, 'reported');
  });
});

test("bootstrapSourcesFromTarget is invoked with the selected program's own derived domain/url, and its sources actually seed the hunt", async () => {
  await withTempWorkspace(async (workspaceDir) => {
    let capturedTarget: { domain: string; url: string } | undefined;
    const fastSource = {
      name: 'deferred-fast',
      isAvailable: async () => true,
      discover: async () => [
        {
          source: 'deferred-fast',
          kind: 'host' as const,
          label: 'deferred.example.com',
          attributes: {},
          confidence: 0.6,
          discoveredAt: '',
        },
      ],
    };
    const result = await runHuntLifecycle({
      providers: [new StaticProvider([WEB_PROGRAM])],
      workspaceDir,
      engagementId: 'e1',
      maxRounds: 1,
      authorization: authorization(),
      bootstrapSourcesFromTarget: (target) => {
        capturedTarget = target;
        return { passiveSources: [fastSource], activeSources: [] };
      },
    });
    assert.ok(result.ok);
    assert.deepEqual(capturedTarget, { domain: 'app.example.com', url: 'https://app.example.com' });
    assert.ok(findNode(result.value.huntResult?.worldModel as never, 'host', 'deferred.example.com'));
  });
});

test('changing the discovery dataset changes which program the lifecycle selects and authorizes', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const provider = new FixtureDiscoveryProvider(BUNDLED_DATASET);
    const result = await runHuntLifecycle({
      providers: [provider],
      workspaceDir,
      engagementId: 'e1',
      maxRounds: 1,
    });
    assert.ok(result.ok);
    assert.equal(result.value.selected?.program.programId, 'initech-midrich');

    const weakenedInitech = (await provider.discoverPrograms()) as { ok: true; value: DiscoveredProgram[] };
    const patched = weakenedInitech.value.map((p) =>
      p.programId === 'initech-midrich'
        ? {
            ...p,
            signals: {
              ...p.signals,
              bountyAttractiveness: {
                value: 0.01,
                confidence: 0.9,
                freshnessAt: new Date().toISOString(),
                detail: 'weakened for this test',
              },
            },
          }
        : p,
    );
    const secondResult = await runHuntLifecycle({
      providers: [new StaticProvider(patched)],
      workspaceDir,
      engagementId: 'e2',
      maxRounds: 1,
    });
    assert.ok(secondResult.ok);
    assert.notEqual(secondResult.value.selected?.program.programId, undefined);
    assert.notEqual(secondResult.value.selected?.program.programId, 'initech-midrich');
  });
});
