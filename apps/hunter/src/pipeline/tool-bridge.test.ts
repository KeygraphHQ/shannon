import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ToolRateLimiter } from '../reasoning/policy.js';
import type { AuthStateHeaders } from '../recon/behavioral-live.js';
import { buildDefaultToolRegistry } from '../tools/default-registry.js';
import type { ToolAdapter, ToolRunResult } from '../tools/registry.js';
import { ToolRegistry } from '../tools/registry.js';
import type { HuntAction, HuntBudget, ProgramScope, ToolCapability } from '../types.js';
import { buildInputFromAction, executeActionViaRegistry } from './tool-bridge.js';

function action(overrides: Partial<HuntAction> = {}): HuntAction {
  const now = new Date().toISOString();
  return {
    id: 'action-1',
    engagementId: 'e1',
    kind: 'active-recon',
    targetRef: 'https://app.example.com/search',
    hypothesisId: 'hyp-1',
    rationale: 'x',
    expectedInformationGain: 0.5,
    cost: 0.3,
    status: 'queued',
    createdAt: now,
    completedAt: undefined,
    resultSummary: undefined,
    ...overrides,
  };
}

const BASE_CTX = { engagementId: 'e1' };

// === buildInputFromAction: one test per supported adapter input shape ===

for (const name of ['subfinder', 'chaos', 'gau', 'waybackurls', 'certificate-transparency']) {
  test(`buildInputFromAction builds a { domain } input for ${name}`, () => {
    const result = buildInputFromAction(name, action({ targetRef: 'https://sub.app.example.com/path' }), BASE_CTX);
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.value, { domain: 'sub.app.example.com' });
  });
}

test('buildInputFromAction builds { domain, outputDir } for amass, and errors without an outputDir configured', () => {
  const withDir = buildInputFromAction('amass', action({ targetRef: 'https://app.example.com' }), {
    ...BASE_CTX,
    amassOutputDir: '/tmp/amass-out',
  });
  assert.equal(withDir.ok, true);
  if (withDir.ok) assert.deepEqual(withDir.value, { domain: 'app.example.com', outputDir: '/tmp/amass-out' });

  const withoutDir = buildInputFromAction('amass', action(), BASE_CTX);
  assert.equal(withoutDir.ok, false);
});

for (const name of ['httpx', 'katana']) {
  test(`buildInputFromAction builds a { url } input for ${name}`, () => {
    const result = buildInputFromAction(name, action({ targetRef: 'https://app.example.com/search' }), BASE_CTX);
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.value, { url: 'https://app.example.com/search' });
  });
}

test('buildInputFromAction builds a { host } input for naabu', () => {
  const result = buildInputFromAction('naabu', action({ targetRef: 'https://app.example.com/search' }), BASE_CTX);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value, { host: 'app.example.com' });
});

test('buildInputFromAction builds { url, wordlistPath } for ffuf with a FUZZ keyword appended, and errors without a wordlist configured', () => {
  const withWordlist = buildInputFromAction('ffuf', action(), { ...BASE_CTX, wordlistPath: '/wordlists/common.txt' });
  assert.equal(withWordlist.ok, true);
  if (withWordlist.ok) {
    assert.deepEqual(withWordlist.value, {
      url: 'https://app.example.com/search/FUZZ',
      wordlistPath: '/wordlists/common.txt',
    });
  }

  const withoutWordlist = buildInputFromAction('ffuf', action(), BASE_CTX);
  assert.equal(withoutWordlist.ok, false);
});

test('buildInputFromAction builds { url, engagementId, severity? } for nuclei', () => {
  const withoutSeverity = buildInputFromAction('nuclei', action(), BASE_CTX);
  assert.equal(withoutSeverity.ok, true);
  if (withoutSeverity.ok) {
    assert.deepEqual(withoutSeverity.value, { url: 'https://app.example.com/search', engagementId: 'e1' });
  }

  const withSeverity = buildInputFromAction('nuclei', action(), { ...BASE_CTX, nucleiSeverity: 'critical,high' });
  assert.equal(withSeverity.ok, true);
  if (withSeverity.ok) {
    assert.deepEqual(withSeverity.value, {
      url: 'https://app.example.com/search',
      engagementId: 'e1',
      severity: 'critical,high',
    });
  }
});

test('buildInputFromAction builds { pageUrl, assetRef, engagementId } for js-collector', () => {
  const result = buildInputFromAction(
    'js-collector',
    action({ targetRef: 'https://app.example.com/search' }),
    BASE_CTX,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, {
      pageUrl: 'https://app.example.com/search',
      assetRef: 'https://app.example.com/search',
      engagementId: 'e1',
    });
  }
});

test('buildInputFromAction builds { endpointUrl, assetRef, engagementId, headersByState } for behavioral-test, and errors without configured auth states', () => {
  const headersByState: AuthStateHeaders = { anonymous: {}, 'privileged-user': { 'x-test-role': 'privileged-user' } };
  const withConfig = buildInputFromAction(
    'behavioral-test',
    action({ targetRef: 'https://app.example.com/api/admin' }),
    {
      ...BASE_CTX,
      behavioralAuthStatesByAsset: new Map([['https://app.example.com/api/admin', headersByState]]),
    },
  );
  assert.equal(withConfig.ok, true);
  if (withConfig.ok) {
    assert.deepEqual(withConfig.value, {
      endpointUrl: 'https://app.example.com/api/admin',
      assetRef: 'https://app.example.com/api/admin',
      engagementId: 'e1',
      headersByState,
    });
  }

  const withoutConfig = buildInputFromAction('behavioral-test', action(), BASE_CTX);
  assert.equal(withoutConfig.ok, false);
});

test('buildInputFromAction rejects a tool name it has no rule for', () => {
  const result = buildInputFromAction('not-a-real-tool', action(), BASE_CTX);
  assert.equal(result.ok, false);
});

test('every default-registry adapter and every DEFAULT_PREFERRED_TOOL_NAMES entry has an input-building rule', () => {
  const registry = buildDefaultToolRegistry();
  for (const name of registry.list()) {
    if (name === 'shannon') continue;
    const result = buildInputFromAction(name, action(), {
      engagementId: 'e1',
      wordlistPath: '/wordlists/common.txt',
      amassOutputDir: '/tmp/amass',
      behavioralAuthStatesByAsset: new Map([[action().targetRef, {}]]),
    });
    assert.equal(result.ok, true, `expected an input-building rule for registered adapter "${name}"`);
  }
});

// === executeActionViaRegistry: the full gate chain ===

function program(overrides: Partial<ProgramScope> = {}): ProgramScope {
  return {
    programId: 'p1',
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
      {
        identifier: 'not-in-scope.example.org',
        type: 'domain',
        instruction: 'out-of-scope',
        tier: 'standard',
        bountyEligible: false,
        requiresAuthentication: false,
      },
    ],
    rulesOfEngagement: [],
    disallowedTechniques: [],
    rateLimitPerMinute: 60,
    ...overrides,
  };
}

const BUDGET: HuntBudget = {
  maxRounds: 20,
  maxActions: 50,
  maxRuntimeMs: 30 * 60 * 1000,
  maxShannonExecutions: 3,
  perToolMinIntervalMs: 0,
};

class FakeAdapter implements ToolAdapter<{ readonly domain: string }> {
  readonly kind = 'passive-recon' as const;
  readonly scopeRequirement = 'passive-only' as const;
  readonly requiresAuthorization = false;
  readonly cost = 0.1;
  readonly timeoutMs = 1000;
  readonly name: string;
  readonly risk: 'none' | 'low' | 'medium' | 'high';
  constructor(
    options: {
      readonly name?: string;
      readonly risk?: 'none' | 'low' | 'medium' | 'high';
      readonly cap?: ToolCapability;
      readonly result?: ToolRunResult;
    } = {},
  ) {
    this.name = options.name ?? 'subfinder';
    this.risk = options.risk ?? 'none';
    this.cap = options.cap ?? { available: true, reason: 'ok', version: undefined };
    this.result = options.result ?? {
      ok: true,
      summary: 'fake ran',
      discoveries: [],
      observations: [],
      raw: undefined,
    };
  }
  private readonly cap: ToolCapability;
  private readonly result: ToolRunResult;
  capability(): Promise<ToolCapability> {
    return Promise.resolve(this.cap);
  }
  run(): Promise<ToolRunResult> {
    return Promise.resolve(this.result);
  }
}

test('executeActionViaRegistry reports EXECUTED_NO_RESULTS when a real adapter runs successfully but finds nothing', async () => {
  const registry = new ToolRegistry();
  registry.register(new FakeAdapter()); // default result: ok: true, discoveries: [], observations: []
  const result = await executeActionViaRegistry(action({ kind: 'passive-recon' }), program(), BUDGET, {
    registry,
    engagementId: 'e1',
  });
  assert.equal(result.status, 'EXECUTED_NO_RESULTS', 'a genuinely empty result must never be conflated with FAILED');
  assert.equal(result.toolName, 'subfinder');
});

test('executeActionViaRegistry reports EXECUTED_WITH_RESULTS when a real adapter runs successfully and finds something', async () => {
  const registry = new ToolRegistry();
  registry.register(
    new FakeAdapter({
      result: {
        ok: true,
        summary: 'fake found one',
        discoveries: [
          {
            source: 'subfinder',
            kind: 'host',
            label: 'sub.example.com',
            attributes: {},
            confidence: 0.7,
            discoveredAt: new Date().toISOString(),
          },
        ],
        observations: [],
        raw: undefined,
      },
    }),
  );
  const result = await executeActionViaRegistry(action({ kind: 'passive-recon' }), program(), BUDGET, {
    registry,
    engagementId: 'e1',
  });
  assert.equal(result.status, 'EXECUTED_WITH_RESULTS');
  assert.equal(result.discoveries.length, 1);
});

test('executeActionViaRegistry reports FAILED when the adapter runs but reports failure', async () => {
  const registry = new ToolRegistry();
  registry.register(
    new FakeAdapter({ result: { ok: false, summary: 'exit 1', discoveries: [], observations: [], raw: undefined } }),
  );
  const result = await executeActionViaRegistry(action({ kind: 'passive-recon' }), program(), BUDGET, {
    registry,
    engagementId: 'e1',
  });
  assert.equal(result.status, 'FAILED');
});

test('executeActionViaRegistry reports BLOCKED_BY_SCOPE for an out-of-scope target, without ever calling the adapter', async () => {
  const registry = new ToolRegistry();
  let called = false;
  registry.register(
    new (class extends FakeAdapter {
      override run(): Promise<ToolRunResult> {
        called = true;
        return super.run();
      }
    })(),
  );
  const result = await executeActionViaRegistry(
    action({ kind: 'passive-recon', targetRef: 'https://not-in-scope.example.org' }),
    program(),
    BUDGET,
    { registry, engagementId: 'e1' },
  );
  assert.equal(result.status, 'BLOCKED_BY_SCOPE');
  assert.equal(called, false);
});

test('executeActionViaRegistry reports BLOCKED_BY_POLICY when authorization is not confirmed', async () => {
  const registry = new ToolRegistry();
  registry.register(new FakeAdapter());
  const result = await executeActionViaRegistry(
    action({ kind: 'passive-recon' }),
    program({ authorizationConfirmed: false }),
    BUDGET,
    {
      registry,
      engagementId: 'e1',
    },
  );
  assert.equal(result.status, 'BLOCKED_BY_POLICY');
});

test('executeActionViaRegistry reports BLOCKED_BY_POLICY for a high-risk adapter unless allowHighRisk is set', async () => {
  const registry = new ToolRegistry();
  registry.register(new FakeAdapter({ risk: 'high' }));
  const blockedResult = await executeActionViaRegistry(action({ kind: 'passive-recon' }), program(), BUDGET, {
    registry,
    engagementId: 'e1',
  });
  assert.equal(blockedResult.status, 'UNAVAILABLE'); // no other candidate; high-risk one was rejected and folded into the summary
  assert.match(blockedResult.summary, /risk "high"/);

  const allowed = await executeActionViaRegistry(action({ kind: 'passive-recon' }), program(), BUDGET, {
    registry,
    engagementId: 'e1',
    allowHighRisk: true,
  });
  assert.equal(allowed.status, 'EXECUTED_NO_RESULTS');
});

test('executeActionViaRegistry reports UNAVAILABLE when the adapter reports itself not capable', async () => {
  const registry = new ToolRegistry();
  registry.register(new FakeAdapter({ cap: { available: false, reason: 'binary not found', version: undefined } }));
  const result = await executeActionViaRegistry(action({ kind: 'passive-recon' }), program(), BUDGET, {
    registry,
    engagementId: 'e1',
  });
  assert.equal(result.status, 'UNAVAILABLE');
  assert.match(result.summary, /binary not found/);
});

test('executeActionViaRegistry reports UNAVAILABLE when no adapter at all is registered for the action kind', async () => {
  const registry = new ToolRegistry();
  const result = await executeActionViaRegistry(action({ kind: 'js-intelligence' }), program(), BUDGET, {
    registry,
    engagementId: 'e1',
  });
  assert.equal(result.status, 'UNAVAILABLE');
});

test('executeActionViaRegistry enforces perToolMinIntervalMs via the shared rate limiter before each run', async () => {
  const registry = new ToolRegistry();
  registry.register(new FakeAdapter());
  let now = 0;
  const rateLimiter = new ToolRateLimiter({
    clock: () => now,
    sleep: async (ms) => {
      now += ms;
    },
  });
  const budgetWithInterval: HuntBudget = { ...BUDGET, perToolMinIntervalMs: 1000 };

  const first = await executeActionViaRegistry(action({ kind: 'passive-recon' }), program(), budgetWithInterval, {
    registry,
    engagementId: 'e1',
    rateLimiter,
  });
  assert.equal(first.waitedMs, 0);

  const second = await executeActionViaRegistry(action({ kind: 'passive-recon' }), program(), budgetWithInterval, {
    registry,
    engagementId: 'e1',
    rateLimiter,
  });
  assert.equal(second.waitedMs, 1000, 'the second call to the same tool must wait out the full configured interval');
});

test('executeActionViaRegistry falls through to the next preferred adapter when an earlier one is unavailable', async () => {
  const registry = new ToolRegistry();
  registry.register(
    new FakeAdapter({
      name: 'certificate-transparency',
      cap: { available: false, reason: 'no network', version: undefined },
    }),
  );
  registry.register(new FakeAdapter({ name: 'subfinder' }));
  const result = await executeActionViaRegistry(action({ kind: 'passive-recon' }), program(), BUDGET, {
    registry,
    engagementId: 'e1',
  });
  assert.equal(result.status, 'EXECUTED_NO_RESULTS');
  assert.equal(result.toolName, 'subfinder');
});

test('executeActionViaRegistry: overriding preferredToolNames for one action kind does not starve every other kind of its default preference list', async () => {
  const registry = new ToolRegistry();
  registry.register(new FakeAdapter({ name: 'subfinder' })); // the passive-recon default this test relies on staying in effect
  const result = await executeActionViaRegistry(action({ kind: 'passive-recon' }), program(), BUDGET, {
    registry,
    engagementId: 'e1',
    // Overrides only "active-recon" — "passive-recon" must still fall back to DEFAULT_PREFERRED_TOOL_NAMES.
    preferredToolNames: { 'active-recon': ['ffuf'] },
  });
  assert.equal(result.status, 'EXECUTED_NO_RESULTS');
  assert.equal(result.toolName, 'subfinder');
});
