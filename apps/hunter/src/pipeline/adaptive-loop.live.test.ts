/**
 * Full localhost end-to-end test.
 *
 * Unlike `adaptive-loop.test.ts` (fixture-driven throughout) and
 * `recon/live-pipeline.test.ts` (live, but exercises the JS/behavioral
 * pipelines directly, never through `runAdaptiveHunt`), this test drives
 * the complete real loop — `pipeline/adaptive-loop.ts:runAdaptiveHunt`
 * itself, with `liveRecon` enabled — against `testing/local-app-server.ts`.
 * Every recon call below (`JsCollectorAdapter.run`, `probeEndpoint`, and
 * every action the round loop executes through `liveRecon`) is a real
 * request over a real socket to 127.0.0.1; nothing here is a canned
 * fixture standing in for a tool that could have run.
 *
 * What this test demonstrates end to end: discovery/enumeration (real
 * `httpx` against 127.0.0.1, if installed), live JS collection and
 * source-map recovery, live behavioral auth-state comparison, hypothesis
 * generation from those real observations, next-best-action selection
 * through the real deterministic policy gate, real adapter execution with
 * an explicit `ExecutionStatus` on every event, a full audit trail
 * (scope/policy decisions recorded on every `HuntEvent`), and
 * checkpoint/resume across two separate `runAdaptiveHunt` calls.
 *
 * A second test below (`'js-intelligence becomes reachable...'`) proves the
 * round loop can select and really execute a `js-intelligence` action too —
 * `reasoning/actions.ts:ACTION_KIND_BY_VULN_CLASS` routes the
 * `js-intel-endpoint-discovery` vulnClass to it, reusing the same
 * `JsCollectorAdapter` the first test also exercises directly, never a
 * second implementation of JS collection.
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ToolRateLimiter } from '../reasoning/policy.js';
import type { AuthStateHeaders } from '../recon/behavioral-live.js';
import { probeEndpoint } from '../recon/http-probe.js';
import { detectSourceMappingUrl, parseSourceMap } from '../recon/js-live.js';
import { startLocalTestApp } from '../testing/local-app-server.js';
import { buildDefaultToolRegistry } from '../tools/default-registry.js';
import { JsCollectorAdapter } from '../tools/live-adapters.js';
import type { ProgramScope } from '../types.js';
import { type AdaptiveHuntInput, type JsArtifactInput, runAdaptiveHunt } from './adaptive-loop.js';

async function withTempWorkspace<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-live-e2e-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('full localhost end-to-end: live discovery, real adapter execution, full audit trail, and checkpoint/resume', async () => {
  const app = await startLocalTestApp();
  try {
    await withTempWorkspace(async (workspaceDir) => {
      const program: ProgramScope = {
        programId: 'local-e2e',
        programName: 'Local E2E Test App',
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
      const programScopePath = join(workspaceDir, 'program.json');
      await writeFile(programScopePath, JSON.stringify(program), 'utf8');

      // Real JS-collector adapter run (fetches HTML -> script -> source map, live) — exercised directly since
      // "js-intelligence" is not a round-loop-reachable ActionKind (see module docstring).
      const jsCollector = new JsCollectorAdapter();
      const collectorResult = await jsCollector.run({
        pageUrl: app.url,
        assetRef: `${app.url}/search`,
        engagementId: 'local-e2e',
      });
      assert.equal(collectorResult.ok, true);
      assert.ok(collectorResult.observations.some((o) => o.vulnClass === 'xss'));
      assert.ok(
        collectorResult.discoveries.some((d) => d.kind === 'endpoint' && d.label === '/internal/admin/debug'),
        'source-map recovery must surface the endpoint only visible in the original TypeScript source',
      );

      // Feed the same real, live-fetched content into the bootstrap (bundle + source-map-recovered original).
      const appJs = await (await fetch(`${app.url}/app.js`)).text();
      const mapPath = detectSourceMappingUrl(appJs);
      assert.ok(mapPath);
      const mapJson = await (await fetch(`${app.url}${mapPath}`)).text();
      const parsedMap = parseSourceMap(mapJson);
      const recoveredSource = parsedMap.sourcesContent[0];
      assert.ok(recoveredSource);

      // Real per-auth-state HTTP requests against the deliberately-buggy admin endpoint.
      const anon = await probeEndpoint(`${app.url}/api/admin/users`, {});
      const priv = await probeEndpoint(`${app.url}/api/admin/users`, {
        headers: { 'x-test-role': 'privileged-user' },
      });

      const behavioralAuthStates: AuthStateHeaders = {
        anonymous: {},
        'privileged-user': { 'x-test-role': 'privileged-user' },
      };
      const rateLimiter = new ToolRateLimiter();

      // Real active-recon execution: ffuf against a tiny, fast, local-only wordlist. httpx/katana/naabu/nuclei
      // are not restricted to here deliberately — on a dev machine without ProjectDiscovery's httpx installed
      // (some systems have an unrelated "httpx" HTTP-client CLI under the same name — verifyToolIdentity
      // correctly refuses it), falling through the full active-recon preference list would otherwise reach
      // nuclei's full default template set, which is neither fast nor meaningful against this synthetic app.
      const wordlistPath = join(workspaceDir, 'wordlist.txt');
      await writeFile(wordlistPath, 'search\nhidden\nadmin\n', 'utf8');

      const baseInput: AdaptiveHuntInput = {
        engagementId: 'local-e2e',
        programScopePath,
        url: app.url,
        repoPath: undefined,
        workspaceDir,
        maxRounds: 1,
        passiveSources: [],
        activeSources: [],
        jsArtifacts: [
          { sourceRef: `${app.url}/app.js`, assetRef: `${app.url}/search`, content: appJs },
          {
            sourceRef: parsedMap.sources[0] ?? mapPath,
            assetRef: `${app.url}/search`,
            content: recoveredSource as string,
          },
        ],
        behavioralFixtures: [
          {
            assetRef: `${app.url}/api/admin/users`,
            endpoint: '/api/admin/users',
            responses: {
              anonymous: { status: anon.statusCode, bodySnippet: anon.bodyExcerpt },
              'privileged-user': { status: priv.statusCode, bodySnippet: priv.bodyExcerpt },
            },
          },
        ],
        investigationFixtures: new Map(),
        shannonOutputsByAsset: new Map(),
        liveRecon: {
          registry: buildDefaultToolRegistry(),
          rateLimiter,
          wordlistPath,
          preferredToolNames: { 'active-recon': ['ffuf'] },
          behavioralAuthStatesByAsset: new Map([[`${app.url}/api/admin/users`, behavioralAuthStates]]),
        },
      };

      // First run: deliberately bounded to 1 round, so it stops mid-hunt (not because work ran out).
      const first = await runAdaptiveHunt(baseInput);
      assert.equal(first.ok, true);
      if (!first.ok) return;
      assert.equal(first.value.checkpoint.status, 'stopped');
      assert.ok(
        first.value.checkpoint.hypotheses.length >= 2,
        'the live JS + behavioral bootstrap must yield at least an xss and an authz hypothesis',
      );
      assert.ok(first.value.checkpoint.hypotheses.some((h) => h.vulnClass === 'xss'));
      assert.ok(first.value.checkpoint.hypotheses.some((h) => h.vulnClass === 'authz'));

      const firstEvent = first.value.checkpoint.events[0];
      assert.ok(firstEvent, 'the first round must produce an audit event');
      assert.equal(firstEvent?.scopeDecision, 'in-scope', 'every event must carry a real pre-execution scope decision');
      assert.ok(
        firstEvent?.policyDecision && firstEvent.policyDecision.length > 0,
        "every event must carry the policy layer's decision reason",
      );
      assert.ok(firstEvent?.executionStatus, 'every event must carry an explicit ExecutionStatus');

      // Resume: same workspace/engagement, more rounds — must continue, not restart.
      const resumed = await runAdaptiveHunt({ ...baseInput, maxRounds: 8 });
      assert.equal(resumed.ok, true);
      if (!resumed.ok) return;
      assert.ok(
        resumed.value.checkpoint.round > first.value.checkpoint.round,
        'resuming must continue past where the first run stopped',
      );

      const allEvents = resumed.value.checkpoint.events;
      const statusesSeen = new Set(allEvents.map((e) => e.executionStatus));
      assert.ok(
        statusesSeen.has('EXECUTED_WITH_RESULTS') || statusesSeen.has('EXECUTED_NO_RESULTS'),
        `expected at least one genuinely executed action; saw: ${[...statusesSeen].join(', ')}`,
      );
      // The real behavioral-test run against the deliberately-buggy /api/admin/users must find the
      // authz anomaly — a genuine result, not merely "ran and found nothing".
      assert.ok(
        statusesSeen.has('EXECUTED_WITH_RESULTS'),
        `expected at least one execution to genuinely find something; saw: ${[...statusesSeen].join(', ')}`,
      );

      // Adaptivity: the action queue is rebuilt from live-updated state every round — consecutive rounds never repeat the same (kind, target).
      for (let i = 1; i < allEvents.length; i += 1) {
        const prev = allEvents[i - 1];
        const curr = allEvents[i];
        assert.ok(
          prev && curr && (prev.target !== curr.target || prev.action !== curr.action),
          `round ${i} repeated the exact same action as the round before it; the queue must exclude what was just completed`,
        );
      }
    });
  } finally {
    await app.close();
  }
});

test('js-intelligence becomes reachable and selectable through the round-loop action queue, and a later real run discovers genuinely new information', async () => {
  const app = await startLocalTestApp();
  try {
    await withTempWorkspace(async (workspaceDir) => {
      // Exercises the new CIDR scope matching in a real pipeline context too: 127.0.0.1 falls inside 127.0.0.0/8.
      const program: ProgramScope = {
        programId: 'js-intel-e2e',
        programName: 'JS Intelligence Reachability E2E',
        platform: 'hackerone',
        authorizationConfirmed: true,
        assets: [
          {
            identifier: '127.0.0.0/8',
            type: 'cidr',
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
      const programScopePath = join(workspaceDir, 'program.json');
      await writeFile(programScopePath, JSON.stringify(program), 'utf8');

      const adminUrl = `${app.url}/admin`;

      // A synthetic bootstrap reference to "/admin" — as if some other page's JS mentioned it — is
      // the only seed. The bootstrap phase never fetches /admin itself; only a later, real, round-loop
      // js-intelligence action does that (and /admin genuinely serves its own script, admin.js, which
      // bootstrap has never seen — see testing/local-app-server.ts).
      const jsArtifacts: JsArtifactInput[] = [
        { sourceRef: 'synthetic-bootstrap-reference.js', assetRef: adminUrl, content: "fetch('/admin');" },
      ];

      const input: AdaptiveHuntInput = {
        engagementId: 'js-intel-e2e',
        programScopePath,
        url: app.url,
        repoPath: undefined,
        workspaceDir,
        maxRounds: 0,
        passiveSources: [],
        activeSources: [],
        jsArtifacts,
        behavioralFixtures: [],
        investigationFixtures: new Map(),
        shannonOutputsByAsset: new Map(),
        liveRecon: { registry: buildDefaultToolRegistry() },
      };

      // First call: maxRounds 0 runs only the bootstrap (no round executes yet) — this captures the
      // real "before" state, distinct from the state after the real js-intelligence action below runs.
      const bootstrapped = await runAdaptiveHunt(input);
      assert.equal(bootstrapped.ok, true);
      if (!bootstrapped.ok) return;

      const bootstrapHyp = bootstrapped.value.checkpoint.hypotheses.find(
        (h) => h.vulnClass === 'js-intel-endpoint-discovery',
      );
      assert.ok(bootstrapHyp, 'the synthetic bootstrap reference must derive a js-intel-endpoint-discovery hypothesis');
      assert.equal(bootstrapHyp?.assetRef, adminUrl);
      const initialSupportCount = bootstrapHyp?.supportingObservationIds.length ?? 0;
      assert.equal(initialSupportCount, 1, 'the hypothesis starts with exactly the one bootstrap observation');
      assert.equal(bootstrapped.value.checkpoint.actions.length, 0, 'no action has executed yet');

      // Second call: same workspace/engagement, resumed with rounds enabled — this is where the round
      // loop actually selects and really executes the js-intelligence action.
      const result = await runAdaptiveHunt({ ...input, maxRounds: 5 });
      assert.equal(result.ok, true);
      if (!result.ok) return;

      const jsIntelHyp = result.value.checkpoint.hypotheses.find((h) => h.vulnClass === 'js-intel-endpoint-discovery');
      assert.ok(jsIntelHyp);

      const jsIntelAction = result.value.checkpoint.actions.find((a) => a.kind === 'js-intelligence');
      assert.ok(
        jsIntelAction,
        '"js-intelligence" must be a real, selectable ActionKind reached from the round-loop queue — not orphaned',
      );
      assert.equal(jsIntelAction?.targetRef, adminUrl);

      const jsIntelEvent = result.value.checkpoint.events.find((e) => e.action === 'js-intelligence');
      assert.ok(jsIntelEvent);
      assert.equal(
        jsIntelEvent?.executionStatus,
        'EXECUTED_WITH_RESULTS',
        'the js-collector adapter must have genuinely run and found the new /api/admin/users reference, not been mocked, blocked, or come back empty',
      );
      assert.equal(jsIntelEvent?.tool, 'js-collector');
      assert.equal(
        jsIntelEvent?.scopeDecision,
        'in-scope',
        'the CIDR-scoped asset must resolve to in-scope, not merely unknown',
      );

      // New information: admin.js (only fetched by this real round-loop action, never by bootstrap)
      // references /api/admin/users — a genuinely new observation that feeds back into (and
      // strengthens) the very hypothesis that selected this action.
      assert.ok(
        (jsIntelEvent?.newObservationCount ?? 0) > 0,
        'the real run against /admin must discover admin.js and yield a new observation bootstrap never saw',
      );

      assert.ok(
        (jsIntelHyp?.supportingObservationIds.length ?? 0) > initialSupportCount,
        'new, really-discovered observations must be folded back into the hypothesis that caused the action to run',
      );
      assert.notEqual(
        jsIntelHyp?.updatedAt,
        bootstrapHyp?.updatedAt,
        'the hypothesis must show it was actually updated by the real run, not just re-read unchanged',
      );
    });
  } finally {
    await app.close();
  }
});
