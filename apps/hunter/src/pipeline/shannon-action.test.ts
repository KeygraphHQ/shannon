import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HuntAction, ProgramScope } from '../types.js';
import { executeShannonHuntAction } from './shannon-action.js';

function action(): HuntAction {
  const now = new Date().toISOString();
  return {
    id: 'action-1',
    engagementId: 'e1',
    kind: 'shannon',
    targetRef: 'https://app.example.com/search',
    hypothesisId: 'hyp-1',
    rationale: 'x',
    expectedInformationGain: 0.5,
    cost: 0.6,
    status: 'queued',
    createdAt: now,
    completedAt: undefined,
    resultSummary: undefined,
  };
}

function program(overrides: Partial<ProgramScope> = {}): ProgramScope {
  return {
    programId: 'p1',
    programName: 'Test Program',
    platform: 'hackerone',
    authorizationConfirmed: true,
    assets: [],
    rulesOfEngagement: [],
    disallowedTechniques: [],
    rateLimitPerMinute: 60,
    ...overrides,
  };
}

test('a program disallowing "shannon" blocks the action before the eligibility check even runs', async () => {
  const result = await executeShannonHuntAction(action(), {
    program: program({ disallowedTechniques: ['shannon'] }),
    repoPath: undefined, // would normally produce an UNAVAILABLE ineligibility reason instead
    engagementId: 'e1',
    workspaceDir: '/tmp/does-not-matter',
    shannonOutputsByAsset: new Map(),
    liveShannon: undefined,
  });
  assert.equal(result.executionStatus, 'BLOCKED_BY_POLICY');
  assert.match(result.resultSummary, /ROE:/);
  assert.equal(result.skipped, true);
});

test('a program disallowing "automated exploitation" (an alias, not the bare kind) also blocks Shannon', async () => {
  const result = await executeShannonHuntAction(action(), {
    program: program({ disallowedTechniques: ['automated exploitation'] }),
    repoPath: undefined,
    engagementId: 'e1',
    workspaceDir: '/tmp/does-not-matter',
    shannonOutputsByAsset: new Map(),
    liveShannon: undefined,
  });
  assert.equal(result.executionStatus, 'BLOCKED_BY_POLICY');
});

test('a program with no disallowed techniques falls through to the ordinary eligibility check', async () => {
  const result = await executeShannonHuntAction(action(), {
    program: program(),
    repoPath: undefined, // no repo -> ineligible for a different, unrelated reason
    engagementId: 'e1',
    workspaceDir: '/tmp/does-not-matter',
    shannonOutputsByAsset: new Map(),
    liveShannon: undefined,
  });
  assert.equal(result.executionStatus, 'UNAVAILABLE');
  assert.match(result.resultSummary, /black-box/);
});

test('an unrelated ROE rule never blocks a shannon action', async () => {
  const result = await executeShannonHuntAction(action(), {
    program: program({ disallowedTechniques: ['no social engineering'] }),
    repoPath: undefined,
    engagementId: 'e1',
    workspaceDir: '/tmp/does-not-matter',
    shannonOutputsByAsset: new Map(),
    liveShannon: undefined,
  });
  // still ineligible, but for the eligibility reason, not ROE.
  assert.equal(result.executionStatus, 'UNAVAILABLE');
  assert.doesNotMatch(result.resultSummary, /ROE:/);
});
