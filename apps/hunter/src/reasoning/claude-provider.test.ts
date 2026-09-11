import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WorldModelSnapshot } from '../types.js';
import { ClaudeReasoningProvider } from './claude-provider.js';

function fakeAnthropicResponse(toolName: string, input: unknown): Response {
  return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: toolName, input }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function snapshotWithOneCandidate(): WorldModelSnapshot {
  const now = new Date().toISOString();
  return {
    programId: 'p1',
    nodes: [],
    edges: [],
    hypotheses: [
      {
        id: 'hyp-1',
        engagementId: 'e1',
        statement: 'xss on /search',
        vulnClass: 'xss',
        assetRef: 'https://app.example.com/search',
        supportingObservationIds: [],
        contradictingObservationIds: [],
        potentialImpact: 'medium',
        confidence: 0.4,
        priorityScore: 0.5,
        informationGain: 0.5,
        requiredEvidence: [],
        nextInvestigation: 'run shannon',
        status: 'open',
        createdAt: now,
        updatedAt: now,
      },
    ],
    recentObservations: [],
    completedActions: [],
    candidateActions: [
      {
        id: 'action-1',
        engagementId: 'e1',
        kind: 'shannon',
        targetRef: 'https://app.example.com/search',
        hypothesisId: 'hyp-1',
        rationale: 'run shannon',
        expectedInformationGain: 0.5,
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

test('selectNextBestAction never calls the API when there are no candidate actions', async () => {
  let called = false;
  const provider = new ClaudeReasoningProvider({
    apiKey: 'fake',
    fetchImpl: (async () => {
      called = true;
      throw new Error('should not be called');
    }) as typeof fetch,
  });
  const snapshot = { ...snapshotWithOneCandidate(), candidateActions: [] };
  const proposal = await provider.selectNextBestAction(snapshot);
  assert.equal(proposal, undefined);
  assert.equal(called, false);
});

test('selectNextBestAction parses and validates a well-formed tool_use response', async () => {
  const fakeFetch = (async () =>
    fakeAnthropicResponse('select_next_best_action', {
      kind: 'shannon',
      targetRef: 'https://app.example.com/search',
      hypothesisId: 'hyp-1',
      whyThisAction: 'source-aware confirmation',
      hypothesisTested: 'xss on /search',
      uncertaintyReduced: 'whether the sink is reachable',
      confirmingObservation: 'a verified Shannon finding',
      contradictingObservation: 'Shannon reports sanitized input',
      nextStepIfConfirmed: 'validate further',
      nextStepIfContradicted: 'drop the hypothesis',
    })) as typeof fetch;

  const provider = new ClaudeReasoningProvider({ apiKey: 'fake', fetchImpl: fakeFetch });
  const proposal = await provider.selectNextBestAction(snapshotWithOneCandidate());
  assert.equal(proposal?.kind, 'shannon');
  assert.equal(proposal?.targetRef, 'https://app.example.com/search');
});

test('selectNextBestAction throws when the API responds non-2xx, rather than fabricating a proposal', async () => {
  const fakeFetch = (async () => new Response('rate limited', { status: 429 })) as typeof fetch;
  const provider = new ClaudeReasoningProvider({ apiKey: 'fake', fetchImpl: fakeFetch });
  await assert.rejects(() => provider.selectNextBestAction(snapshotWithOneCandidate()), /429/);
});

test('selectNextBestAction throws when the response has no matching tool_use block', async () => {
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ content: [{ type: 'text', text: 'no tool call' }] }), {
      status: 200,
    })) as typeof fetch;
  const provider = new ClaudeReasoningProvider({ apiKey: 'fake', fetchImpl: fakeFetch });
  await assert.rejects(() => provider.selectNextBestAction(snapshotWithOneCandidate()), /did not include the expected/);
});

test('selectNextBestAction throws when the tool_use input fails schema validation, rather than passing it through', async () => {
  const fakeFetch = (async () => fakeAnthropicResponse('select_next_best_action', { kind: 'shannon' })) as typeof fetch;
  const provider = new ClaudeReasoningProvider({ apiKey: 'fake', fetchImpl: fakeFetch });
  await assert.rejects(() => provider.selectNextBestAction(snapshotWithOneCandidate()), /schema validation/);
});

test('generateHypotheses returns an empty array without calling the API when there are no observations', async () => {
  let called = false;
  const provider = new ClaudeReasoningProvider({
    apiKey: 'fake',
    fetchImpl: (async () => {
      called = true;
      throw new Error('should not be called');
    }) as typeof fetch,
  });
  assert.deepEqual(await provider.generateHypotheses([], 'e1'), []);
  assert.equal(called, false);
});

test('generateHypotheses validates every proposed hypothesis in the array', async () => {
  const fakeFetch = (async () =>
    fakeAnthropicResponse('propose_hypotheses', {
      hypotheses: [
        {
          statement: 'xss on /search',
          vulnClass: 'xss',
          assetRef: 'https://app.example.com/search',
          potentialImpact: 'medium',
          confidence: 0.5,
          informationGain: 0.5,
          requiredEvidence: ['reproduction'],
          nextInvestigation: 'run shannon',
          supportingObservationIds: ['obs-1'],
        },
      ],
    })) as typeof fetch;
  const provider = new ClaudeReasoningProvider({ apiKey: 'fake', fetchImpl: fakeFetch });
  const proposals = await provider.generateHypotheses(
    [
      {
        id: 'obs-1',
        engagementId: 'e1',
        source: 'js-intelligence',
        assetRef: 'https://app.example.com/search',
        vulnClass: 'xss',
        title: 'x',
        description: 'x',
        severityHint: 'medium',
        confidenceHint: 'medium',
        verified: false,
        tags: [],
        collectedAt: new Date().toISOString(),
      },
    ],
    'e1',
  );
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0]?.vulnClass, 'xss');
});
