/**
 * Live pipeline integration test.
 *
 * Chains `js-live.ts` (HTML -> script -> source map -> recovered source)
 * and `behavioral-live.ts` (real per-auth-state HTTP requests) together
 * against `testing/local-app-server.ts` — every fetch in this test is a
 * real HTTP request over a real socket to 127.0.0.1, never a canned
 * fixture and never an external host. It then feeds the resulting
 * observations into the same hypothesis engine the adaptive loop uses, to
 * demonstrate that a new live observation can change what gets
 * prioritized next — without needing to run the full adaptive loop.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  hypothesesFromObservations,
  selectNextInvestigation,
  updateHypothesisWithObservation,
} from '../reasoning/hypothesis.js';
import { startLocalTestApp } from '../testing/local-app-server.js';
import { compareAuthStatesLive } from './behavioral-live.js';
import { probeEndpoint } from './http-probe.js';
import { analyzeLiveApplication, detectSourceMappingUrl, extractScriptSources } from './js-live.js';

test('probeEndpoint performs a real live request and normalizes the response', async () => {
  const app = await startLocalTestApp();
  try {
    const result = await probeEndpoint(app.url);
    assert.equal(result.statusCode, 200);
    assert.equal(result.contentType, 'text/html');
    assert.match(result.bodyExcerpt, /Test App/);
  } finally {
    await app.close();
  }
});

test('extractScriptSources and detectSourceMappingUrl find the real script and its source map reference', async () => {
  const app = await startLocalTestApp();
  try {
    const html = await (await fetch(app.url)).text();
    const scripts = extractScriptSources(html, app.url);
    assert.deepEqual(scripts, [`${app.url}/app.js`]);

    const js = await (await fetch(scripts[0] as string)).text();
    assert.equal(detectSourceMappingUrl(js), '/app.js.map');
  } finally {
    await app.close();
  }
});

test('analyzeLiveApplication performs the full live HTML -> JS -> source-map -> observations chain against a real local server', async () => {
  const app = await startLocalTestApp();
  try {
    const result = await analyzeLiveApplication(app.url, `${app.url}/search`, 'e1');

    assert.equal(result.scriptsAnalyzed, 1);
    assert.equal(result.sourceMapsRecovered, 1);

    // Bundle-level: the DOM XSS sink/source pairing is in app.js itself.
    assert.ok(result.observations.some((o) => o.vulnClass === 'xss'));

    // Source-map-recovered original source references /internal/admin/debug — only visible after recovering the source map.
    assert.ok(result.discoveries.some((d) => d.kind === 'endpoint' && d.label === '/internal/admin/debug'));
    assert.ok(result.discoveries.some((d) => d.kind === 'source-location'));
  } finally {
    await app.close();
  }
});

test("compareAuthStatesLive performs real per-state requests and detects the fixture app's intentional authz bug", async () => {
  const app = await startLocalTestApp();
  try {
    const result = await compareAuthStatesLive('e1', app.url, `${app.url}/api/admin/users`, {
      anonymous: {},
      'privileged-user': { 'x-test-role': 'privileged-user' },
    });
    assert.equal(result.statesQueried, 2);
    assert.ok(result.observations.some((o) => o.vulnClass === 'authz'));
  } finally {
    await app.close();
  }
});

test('a new live observation can change which hypothesis is selected next (adaptive prioritization)', async () => {
  const app = await startLocalTestApp();
  try {
    const jsResult = await analyzeLiveApplication(app.url, `${app.url}/search`, 'e1');
    const behavioral = await compareAuthStatesLive('e1', app.url, `${app.url}/api/admin/users`, {
      anonymous: {},
      'privileged-user': { 'x-test-role': 'privileged-user' },
    });

    const initialObservations = [...jsResult.observations, ...behavioral.observations];
    const hypotheses = hypothesesFromObservations(initialObservations, 'e1');
    const firstChoice = selectNextInvestigation(hypotheses);
    assert.ok(firstChoice);

    // Simulate learning a strong, verified, independently-sourced confirmation for a *different* hypothesis than firstChoice.
    const other = hypotheses.find((h) => h.id !== firstChoice?.id);
    assert.ok(other, 'the live app must yield at least two distinct hypotheses for this to be meaningful');
    const confirmingObservation = {
      id: 'obs-live-confirmation',
      engagementId: 'e1',
      source: 'active-recon' as const,
      assetRef: other?.assetRef ?? '',
      vulnClass: other?.vulnClass ?? '',
      title: 'independent confirmation',
      description: 'a second, independent live probe confirmed this',
      severityHint: 'critical',
      confidenceHint: 'high',
      verified: true,
      tags: [],
      collectedAt: new Date().toISOString(),
    };
    const strengthened = other ? updateHypothesisWithObservation(other, confirmingObservation, true) : undefined;
    const updatedHypotheses = hypotheses.map((h) => (h.id === strengthened?.id ? strengthened : h));
    const secondChoice = selectNextInvestigation(updatedHypotheses);

    assert.notEqual(
      secondChoice?.id,
      firstChoice?.id,
      'new live evidence must be able to change the next-best-action, not just reinforce the original choice',
    );
  } finally {
    await app.close();
  }
});
