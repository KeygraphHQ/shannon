import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ActionProposal, HuntAction } from '../types.js';
import { DEFAULT_BUDGET, evaluateProposal, ToolRateLimiter } from './policy.js';

function action(overrides: Partial<HuntAction> = {}): HuntAction {
  const now = new Date().toISOString();
  return {
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
    ...overrides,
  };
}

function proposalFor(a: HuntAction): ActionProposal {
  return {
    kind: a.kind,
    targetRef: a.targetRef,
    hypothesisId: a.hypothesisId,
    whyThisAction: 'x',
    hypothesisTested: 'x',
    uncertaintyReduced: 'x',
    confirmingObservation: 'x',
    contradictingObservation: 'x',
    nextStepIfConfirmed: 'x',
    nextStepIfContradicted: 'x',
  };
}

test('accepts a proposal that exactly matches a real queued action', () => {
  const queued = action();
  const decision = evaluateProposal(proposalFor(queued), {
    candidateActions: [queued],
    actionsSoFar: 0,
    shannonExecutionsSoFar: 0,
    elapsedMs: 0,
    budget: DEFAULT_BUDGET,
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.action?.id, queued.id);
});

test('rejects a proposal with no matching action id — the hallucination guard', () => {
  const queued = action();
  const hallucinated: ActionProposal = { ...proposalFor(queued), targetRef: 'https://not-a-real-target.example.com' };
  const decision = evaluateProposal(hallucinated, {
    candidateActions: [queued],
    actionsSoFar: 0,
    shannonExecutionsSoFar: 0,
    elapsedMs: 0,
    budget: DEFAULT_BUDGET,
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /hallucination guard/);
});

test('rejects when no proposal was made', () => {
  const decision = evaluateProposal(undefined, {
    candidateActions: [action()],
    actionsSoFar: 0,
    shannonExecutionsSoFar: 0,
    elapsedMs: 0,
    budget: DEFAULT_BUDGET,
  });
  assert.equal(decision.allowed, false);
});

test('rejects once the action budget is exhausted, before even checking the proposal', () => {
  const queued = action();
  const decision = evaluateProposal(proposalFor(queued), {
    candidateActions: [queued],
    actionsSoFar: 50,
    shannonExecutionsSoFar: 0,
    elapsedMs: 0,
    budget: DEFAULT_BUDGET,
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /action budget exhausted/);
});

test('rejects once the runtime budget is exhausted', () => {
  const queued = action();
  const decision = evaluateProposal(proposalFor(queued), {
    candidateActions: [queued],
    actionsSoFar: 0,
    shannonExecutionsSoFar: 0,
    elapsedMs: DEFAULT_BUDGET.maxRuntimeMs + 1,
    budget: DEFAULT_BUDGET,
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /runtime budget exhausted/);
});

test('rejects a shannon action once the Shannon execution budget is exhausted, even though it matches a real queued action', () => {
  const queued = action({ kind: 'shannon' });
  const decision = evaluateProposal(proposalFor(queued), {
    candidateActions: [queued],
    actionsSoFar: 0,
    shannonExecutionsSoFar: DEFAULT_BUDGET.maxShannonExecutions,
    elapsedMs: 0,
    budget: DEFAULT_BUDGET,
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /Shannon execution budget exhausted/);
});

test('a non-shannon action is unaffected by the Shannon execution budget', () => {
  const queued = action({ kind: 'active-recon' });
  const decision = evaluateProposal(proposalFor(queued), {
    candidateActions: [queued],
    actionsSoFar: 0,
    shannonExecutionsSoFar: DEFAULT_BUDGET.maxShannonExecutions,
    elapsedMs: 0,
    budget: DEFAULT_BUDGET,
  });
  assert.equal(decision.allowed, true);
});

// === ToolRateLimiter ===

function fakeClockAndSleep() {
  let now = 0;
  const sleeps: number[] = [];
  return {
    clock: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      now += ms;
    },
    advance: (ms: number) => {
      now += ms;
    },
    sleeps,
  };
}

test("ToolRateLimiter does not wait on a tool's first turn", async () => {
  const { clock, sleep } = fakeClockAndSleep();
  const limiter = new ToolRateLimiter({ clock, sleep });
  const result = await limiter.waitForTurn('httpx', 1000);
  assert.equal(result.waitedMs, 0);
  assert.equal(result.tool, 'httpx');
});

test('ToolRateLimiter deterministically waits out the remainder of the minimum interval on a second, too-soon turn', async () => {
  const { clock, sleep, advance } = fakeClockAndSleep();
  const limiter = new ToolRateLimiter({ clock, sleep });
  await limiter.waitForTurn('httpx', 1000);
  advance(400); // only 400ms have passed; 600ms still owed
  const second = await limiter.waitForTurn('httpx', 1000);
  assert.equal(second.waitedMs, 600);
});

test('ToolRateLimiter does not wait once the minimum interval has already elapsed', async () => {
  const { clock, sleep, advance } = fakeClockAndSleep();
  const limiter = new ToolRateLimiter({ clock, sleep });
  await limiter.waitForTurn('httpx', 1000);
  advance(1500);
  const second = await limiter.waitForTurn('httpx', 1000);
  assert.equal(second.waitedMs, 0);
});

test('ToolRateLimiter tracks each tool independently — one tool never waits on another', async () => {
  const { clock, sleep } = fakeClockAndSleep();
  const limiter = new ToolRateLimiter({ clock, sleep });
  await limiter.waitForTurn('httpx', 1000);
  const nucleiTurn = await limiter.waitForTurn('nuclei', 1000);
  assert.equal(nucleiTurn.waitedMs, 0);
});

test('ToolRateLimiter serializes concurrent calls for the same tool (concurrency-safe): each waits its own full interval from the previous', async () => {
  const { clock, sleep } = fakeClockAndSleep();
  const limiter = new ToolRateLimiter({ clock, sleep });
  const [first, second, third] = await Promise.all([
    limiter.waitForTurn('subfinder', 500),
    limiter.waitForTurn('subfinder', 500),
    limiter.waitForTurn('subfinder', 500),
  ]);
  assert.equal(first?.waitedMs, 0);
  assert.equal(second?.waitedMs, 500);
  assert.equal(third?.waitedMs, 500);
});
