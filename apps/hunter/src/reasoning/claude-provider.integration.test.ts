/**
 * Claude reasoning provider — live integration harness.
 *
 * `claude-provider.test.ts` proves `ClaudeReasoningProvider`'s parsing,
 * validation, and error handling against a scripted `fetch`; it never talks
 * to a real model. This file is the "clearly separated integration test
 * harness" that actually does: a real HTTPS call to
 * `https://api.anthropic.com/v1/messages` using the exact mechanism this
 * package ships (`ANTHROPIC_API_KEY`, the same credential convention the
 * rest of this Shannon monorepo already documents in the root CLAUDE.md's
 * provider table — not an invented or Claude-Code-specific API). See
 * `claude-provider.ts`'s module docstring for why this, and not a
 * Claude-Code-subscription/OAuth mechanism, is the supported integration
 * point for a standalone Node package like this one: Shannon's own worker
 * authenticates model calls the same way (`ANTHROPIC_API_KEY` /
 * `SHANNON_AI_API_KEY`), and the one OAuth/subscription-reuse path Shannon
 * offers (`SHANNON_USE_PI_AUTH`) is specific to the pi coding-agent harness
 * the worker embeds, which this package does not use.
 *
 * Every test here is skipped unless `ANTHROPIC_API_KEY` is present in the
 * environment — it never runs in ordinary `pnpm test`/CI unless that
 * credential is explicitly supplied. When it does run, it reasons only over
 * a synthetic, hard-coded `WorldModelSnapshot` — no real program, no real
 * hostname, no network request to anything other than the Anthropic API
 * itself. This is what `router.ts`'s `source: 'claude'` actually looks like
 * when exercised for real, as opposed to `source: 'heuristic'` (the
 * fallback/no-key path) — the two are never conflated in `checkpoint.decisions`
 * or the audit log.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WorldModelSnapshot } from '../types.js';
import { ClaudeReasoningProvider } from './claude-provider.js';

const apiKey = process.env.ANTHROPIC_API_KEY;
const skip = apiKey ? false : 'ANTHROPIC_API_KEY is not set; skipping the live Claude integration test';

function syntheticSnapshot(): WorldModelSnapshot {
  const now = new Date().toISOString();
  return {
    programId: 'integration-test-program',
    nodes: [],
    edges: [],
    hypotheses: [
      {
        id: 'hyp-integration-1',
        engagementId: 'integration-test',
        statement: 'reflected XSS on the search endpoint of a synthetic test asset',
        vulnClass: 'xss',
        assetRef: 'https://synthetic-test-asset.invalid/search',
        supportingObservationIds: [],
        contradictingObservationIds: [],
        potentialImpact: 'medium',
        confidence: 0.4,
        priorityScore: 0.5,
        informationGain: 0.6,
        requiredEvidence: ['proof the payload executes in a real browser context'],
        nextInvestigation: 'source-aware Shannon scan of the affected endpoint',
        status: 'open',
        createdAt: now,
        updatedAt: now,
      },
    ],
    recentObservations: [],
    completedActions: [],
    candidateActions: [
      {
        id: 'action-integration-1',
        engagementId: 'integration-test',
        kind: 'shannon',
        targetRef: 'https://synthetic-test-asset.invalid/search',
        hypothesisId: 'hyp-integration-1',
        rationale: 'confirm the reflected XSS candidate with a source-aware exploitation pass',
        expectedInformationGain: 0.6,
        cost: 0.6,
        status: 'queued',
        createdAt: now,
        completedAt: undefined,
        resultSummary: undefined,
      },
    ],
    round: 1,
  };
}

test('ClaudeReasoningProvider.selectNextBestAction makes a real Anthropic API call and returns a schema-valid proposal', {
  skip,
}, async () => {
  const provider = new ClaudeReasoningProvider({ apiKey: apiKey as string });
  const proposal = await provider.selectNextBestAction(syntheticSnapshot());
  assert.ok(proposal, 'a real model call over a single-candidate snapshot must return a proposal');
  assert.equal(proposal?.kind, 'shannon');
  assert.equal(proposal?.targetRef, 'https://synthetic-test-asset.invalid/search');
  assert.equal(proposal?.hypothesisId, 'hyp-integration-1');
  assert.ok(proposal?.whyThisAction.length > 0);
});

test('ClaudeReasoningProvider.generateHypotheses makes a real Anthropic API call grounded strictly in the supplied observations', {
  skip,
}, async () => {
  const provider = new ClaudeReasoningProvider({ apiKey: apiKey as string });
  const observation = {
    id: 'obs-integration-1',
    engagementId: 'integration-test',
    source: 'js-intelligence' as const,
    assetRef: 'https://synthetic-test-asset.invalid/search',
    vulnClass: 'xss',
    title: 'unescaped query parameter written into innerHTML',
    description: 'A synthetic bundle assigns a URL query parameter directly into element.innerHTML with no encoding.',
    severityHint: 'medium',
    confidenceHint: 'medium',
    verified: false,
    tags: ['synthetic'],
    collectedAt: new Date().toISOString(),
  };
  const proposals = await provider.generateHypotheses([observation], 'integration-test');
  assert.ok(
    proposals.length >= 1,
    'a real model call over one concrete observation must propose at least one hypothesis',
  );
  for (const proposal of proposals) {
    assert.ok(
      proposal.supportingObservationIds.every((id) => id === observation.id),
      'every cited supporting observation id must be one Claude was actually given, never invented',
    );
  }
});
