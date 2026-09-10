import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ActionProposal, WorldModelSnapshot } from '../types.js';
import { ClaudeReasoningProvider } from './claude-provider.js';
import { HeuristicReasoningProvider } from './heuristic-provider.js';
import type { ReasoningProvider } from './provider.js';
import { createReasoningProvider, selectNextBestActionWithFallback } from './router.js';

const EMPTY_SNAPSHOT: WorldModelSnapshot = {
  programId: 'p1',
  nodes: [],
  edges: [],
  hypotheses: [],
  recentObservations: [],
  completedActions: [],
  candidateActions: [],
  round: 1,
};

test('createReasoningProvider picks the heuristic provider outright when no API key is configured', () => {
  const router = createReasoningProvider({});
  assert.equal(router.configuredSource, 'heuristic');
  assert.ok(router.primary instanceof HeuristicReasoningProvider);
  assert.equal(router.primary, router.fallback);
});

test('createReasoningProvider picks Claude as primary, with heuristic as fallback, when an API key is configured', () => {
  const router = createReasoningProvider({ ANTHROPIC_API_KEY: 'fake-key' });
  assert.equal(router.configuredSource, 'claude');
  assert.ok(router.primary instanceof ClaudeReasoningProvider);
  assert.ok(router.fallback instanceof HeuristicReasoningProvider);
});

class FailingProvider implements ReasoningProvider {
  readonly source = 'claude' as const;
  selectNextBestAction(): Promise<ActionProposal | undefined> {
    return Promise.reject(new Error('simulated model outage'));
  }
  generateHypotheses(): Promise<readonly []> {
    return Promise.resolve([]);
  }
}

test('selectNextBestActionWithFallback falls back to the heuristic provider when the primary throws, and reports why', async () => {
  const result = await selectNextBestActionWithFallback(
    { primary: new FailingProvider(), fallback: new HeuristicReasoningProvider(), configuredSource: 'claude' },
    EMPTY_SNAPSHOT,
  );
  assert.equal(result.source, 'heuristic');
  assert.match(result.fallbackReason ?? '', /simulated model outage/);
});

test('selectNextBestActionWithFallback uses the primary directly when it succeeds', async () => {
  const heuristic = new HeuristicReasoningProvider();
  const result = await selectNextBestActionWithFallback(
    { primary: heuristic, fallback: heuristic, configuredSource: 'heuristic' },
    EMPTY_SNAPSHOT,
  );
  assert.equal(result.source, 'heuristic');
  assert.equal(result.fallbackReason, undefined);
});
