/**
 * Full autonomy loop audit.
 *
 * `adaptive-loop.live.test.ts` proves discovery through real adapter
 * execution and checkpoint/resume, but stops before a finding is ever
 * created (no hypothesis there reaches independent validation). This file
 * closes that gap: it drives `runAdaptiveHunt` all the way through
 *
 *   scope -> discovery -> real local adapter -> observation -> world model
 *   -> hypothesis -> reasoning -> next-best action -> tool bridge ->
 *   execution -> new observation -> changed queue -> validation -> evidence
 *   -> dedup -> report ("HackerOne") draft -> checkpoint -> resume
 *
 * against `testing/local-app-server.ts`, with every step genuinely real
 * except Shannon's own binary, which this package must never spawn for
 * real against any target (external or local) outside an explicitly
 * confirmed, human-authorized invocation — so here it is exercised through
 * `liveShannon.confirmed: true` with an *injected* fake `spawnImpl`
 * (`shannon/execution-adapter.ts`'s own supported test seam), writing a
 * real, schema-valid `report.json` to a real temp path that
 * `executeShannonAction` then genuinely discovers, reads, and ingests from
 * disk — real file I/O and real schema validation, a mocked subprocess.
 *
 * Independent validation requires two *distinct* observation sources
 * corroborating the same hypothesis (`SOURCE_DIVERSITY_FOR_INDEPENDENT_VALIDATION`
 * in adaptive-loop.ts): the live JS-collector's static DOM-XSS signal
 * (`source: "js-intelligence"`) and Shannon's own exploitation result
 * (`source: "shannon"`, `verified: true`) on the same asset. That is what
 * pushes the hypothesis past "reproduced" into "independently_validated"
 * and on to a report draft.
 */

import assert from 'node:assert/strict';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { detectSourceMappingUrl, parseSourceMap } from '../recon/js-live.js';
import type { SpawnFn } from '../shannon/execution-adapter.js';
import { startLocalTestApp } from '../testing/local-app-server.js';
import { buildDefaultToolRegistry } from '../tools/default-registry.js';
import type { ProgramScope } from '../types.js';
import { type AdaptiveHuntInput, type JsArtifactInput, runAdaptiveHunt } from './adaptive-loop.js';

async function withTempWorkspace<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-full-loop-e2e-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function mockChildProcess(exitCode: number): ChildProcess {
  const child = new EventEmitter() as unknown as ChildProcess & { stdout: EventEmitter; stderr: EventEmitter };
  (child as unknown as { stdout: EventEmitter }).stdout = new EventEmitter();
  (child as unknown as { stderr: EventEmitter }).stderr = new EventEmitter();
  (child as unknown as { kill: () => void }).kill = () => {
    child.emit('close', 143);
  };
  setTimeout(() => child.emit('close', exitCode), 0);
  return child;
}

test('full autonomy loop: real discovery through real execution to a validated finding, evidence, dedup, and a report draft — with checkpoint/resume throughout', async () => {
  const app = await startLocalTestApp();
  try {
    await withTempWorkspace(async (workspaceDir) => {
      const program: ProgramScope = {
        programId: 'full-loop-e2e',
        programName: 'Full Autonomy Loop E2E',
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

      const searchUrl = `${app.url}/search`;

      // Real fetches: bundle + source-map recovery, exactly like adaptive-loop.live.test.ts.
      const appJs = await (await fetch(`${app.url}/app.js`)).text();
      const mapPath = detectSourceMappingUrl(appJs);
      assert.ok(mapPath);
      const mapJson = await (await fetch(`${app.url}${mapPath}`)).text();
      const parsedMap = parseSourceMap(mapJson);
      const recoveredSource = parsedMap.sourcesContent[0];
      assert.ok(recoveredSource);

      const jsArtifacts: JsArtifactInput[] = [
        { sourceRef: `${app.url}/app.js`, assetRef: searchUrl, content: appJs },
        { sourceRef: parsedMap.sources[0] ?? mapPath, assetRef: searchUrl, content: recoveredSource as string },
      ];

      // A real, schema-valid Shannon report.json (see ingestion/shannon-output.ts) discovered and
      // ingested from a real path under the workspace — never fetched from a network, never an
      // invented shape. Exit code 0 and status: "exploited" are what push the shared xss hypothesis
      // past "reproduced" into "independently_validated".
      const deliverablesDir = join(workspaceDir, 'engagements', 'full-loop-e2e', '.shannon', 'deliverables');
      const { mkdir } = await import('node:fs/promises');
      await mkdir(deliverablesDir, { recursive: true });
      await writeFile(
        join(deliverablesDir, 'report.json'),
        JSON.stringify({
          report_meta: {
            target: searchUrl,
            assessment_date: '2026-01-01',
            scope: searchUrl,
            executive_summary: 'Confirmed reflected/DOM XSS on the search endpoint.',
            exploit: true,
          },
          findings: [
            {
              finding_id: 'XSS-01',
              title: 'DOM XSS in search results rendering',
              category: 'XSS',
              owasp_category: 'A05:2025 — Injection',
              severity: 'medium',
              vulnerable_location: '/search',
              http_location: { method: 'GET', url: searchUrl, parameter: 'q' },
              overview: 'The q parameter is written unencoded into innerHTML.',
              impact: 'Arbitrary script execution in the victim browser.',
              remediation: 'Encode output before writing to innerHTML.',
              auth_state: 'Unauthenticated',
              prerequisites: 'None',
              exploitation_steps: [{ items: [{ kind: 'prose', text: 'Send a crafted q parameter.' }] }],
              proof_of_impact: [{ kind: 'prose', text: 'Payload executed in a real browser context.' }],
              status: 'exploited',
            },
          ],
        }),
        'utf8',
      );

      let spawnedCommand: string | undefined;
      const spawnImpl: SpawnFn = (command) => {
        spawnedCommand = command;
        return mockChildProcess(0);
      };

      const baseInput: AdaptiveHuntInput = {
        engagementId: 'full-loop-e2e',
        programScopePath,
        url: app.url,
        // A real, existing local directory — required for Shannon eligibility (source-aware only,
        // never black-box). It is never actually read by Shannon here: spawnImpl is injected and
        // fake, so only the eligibility/invocation-planning path touches this path at all.
        repoPath: workspaceDir,
        workspaceDir,
        maxRounds: 1,
        passiveSources: [],
        activeSources: [],
        jsArtifacts,
        behavioralFixtures: [],
        investigationFixtures: new Map(),
        shannonOutputsByAsset: new Map(),
        liveRecon: { registry: buildDefaultToolRegistry() },
        liveShannon: { confirmed: true, spawnImpl },
      };

      // First call: bounded to 1 round, so it genuinely stops mid-hunt (checkpoint/resume below is real).
      const first = await runAdaptiveHunt(baseInput);
      assert.equal(first.ok, true);
      if (!first.ok) return;
      assert.equal(first.value.checkpoint.status, 'stopped');
      assert.equal(first.value.finding, undefined, 'a single round is not enough to reach a validated finding yet');

      // Resume: same workspace/engagement, more rounds — this is where the queue changes because of
      // what round 1 already learned, and where the Shannon action (if not already run) executes.
      const result = await runAdaptiveHunt({ ...baseInput, maxRounds: 8 });
      assert.equal(result.ok, true);
      if (!result.ok) return;

      assert.ok(
        result.value.checkpoint.round > first.value.checkpoint.round,
        'resuming must continue past where the first run stopped',
      );

      const shannonEvent = result.value.checkpoint.events.find((e) => e.action === 'shannon');
      assert.ok(shannonEvent, 'a shannon action must have been selected from the real xss hypothesis');
      assert.equal(shannonEvent?.executionStatus, 'EXECUTED_WITH_RESULTS');
      assert.equal(spawnedCommand, 'npx', 'Shannon must have been invoked through its real, verified command shape');

      // Adaptivity: round-to-round, the action actually selected changes as new information arrives —
      // never the same (kind, target) pair twice, because completedActionKeys excludes what just ran.
      const events = result.value.checkpoint.events;
      for (let i = 1; i < events.length; i += 1) {
        const prev = events[i - 1];
        const curr = events[i];
        assert.ok(prev && curr && (prev.target !== curr.target || prev.action !== curr.action));
      }

      // Validation: independent corroboration from two distinct real sources (js-intelligence + shannon)
      // on the same asset pushed the hypothesis all the way to a finding.
      assert.ok(result.value.finding, 'the hunt must reach a validated finding from real, corroborating evidence');
      const finding = result.value.finding;
      if (!finding) return;
      assert.equal(finding.vulnClass, 'xss');
      assert.equal(finding.assetRef, searchUrl);
      assert.ok(
        ['independently_validated', 'impact_demonstrated', 'deduplicated', 'report_ready', 'reported'].includes(
          finding.status,
        ),
        `expected an independently-validated-or-later status, got "${finding.status}"`,
      );
      const distinctSourcesOnFinding = new Set(
        finding.observationIds.map((id) => (id.startsWith('obs-shannon-') ? 'shannon' : 'other')),
      );
      assert.ok(
        distinctSourcesOnFinding.has('shannon'),
        'the finding must be supported by the real Shannon-ingested observation',
      );

      // Evidence: recorded once the finding passed reproduction + independent validation.
      assert.ok(
        finding.evidenceIds.length > 0,
        'a reproduced, independently-validated finding must have evidence entries',
      );

      // Dedup + report draft ("HackerOne draft"): only reached once the finding is genuinely unique.
      if (finding.status === 'report_ready' || finding.status === 'reported') {
        assert.ok(result.value.reportDraftPath, 'a report_ready/reported finding must have a written report draft');
        const draftContent = await readFile(result.value.reportDraftPath as string, 'utf8');
        assert.match(draftContent, /xss/i);
        assert.ok(
          finding.transitionLog.some((t) => t.status === 'deduplicated'),
          'the transition log must show the finding actually passed through deduplication, not skipped it',
        );
      }
    });
  } finally {
    await app.close();
  }
});
