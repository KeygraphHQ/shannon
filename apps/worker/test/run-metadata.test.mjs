import assert from 'node:assert/strict';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { describeRecordedDecision, RunMetadataStore } from '../dist/audit/run-metadata.js';

const FIRST = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const SECOND = '11111111-1111-4111-8111-111111111111';
const THIRD = '22222222-2222-4222-8222-222222222222';
const START = '2026-09-07T08:00:00.000Z';
const END = '2026-09-07T08:15:00.000Z';
const LATER = '2026-09-07T09:00:00.000Z';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function attempt(overrides = {}) {
  return {
    attemptId: FIRST,
    workflowId: 'workflow-one',
    startedAt: START,
    isResume: false,
    code: { revision: 'a'.repeat(40), dirty: false, sha256: 'b'.repeat(64) },
    configuredModel: 'provider:configured-model',
    ...overrides,
  };
}

async function workspace(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'shannon-run-metadata-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('persists one run UUID and original provenance across start retries and fresh readers', async (t) => {
  const root = await workspace(t);
  const store = new RunMetadataStore(root);
  assert.equal(await store.read(), null);

  const started = await store.start(attempt());
  assert.match(started.runId, UUID);
  assert.equal(started.historyComplete, true);
  assert.equal(started.currentAttemptId, FIRST);
  assert.equal(started.resultAttemptId, null);
  assert.deepEqual(started.attempts, [{
    attemptId: FIRST,
    workflowId: 'workflow-one',
    resumedFromAttemptId: null,
    startedAt: START,
    endedAt: null,
    code: attempt().code,
    configuredModel: 'provider:configured-model',
    termination: null,
  }]);

  assert.deepEqual(await store.start(attempt()), started);
  assert.deepEqual(await new RunMetadataStore(root).read(), started);
  await assert.rejects(store.start(attempt({ workflowId: 'different-workflow' })), /reused/);
  await assert.rejects(store.start(attempt({ startedAt: LATER })), /reused/);
  await assert.rejects(store.start(attempt({ configuredModel: 'other:model' })), /reused/);
  await assert.rejects(store.start(attempt({ code: { ...attempt().code, dirty: true } })), /reused/);
  await assert.rejects(store.start(attempt({ attemptId: SECOND, workflowId: 'workflow-two' })), /explicit resume/);
});

test('adds resume attempt UUIDs and lineage while keeping the run UUID stable', async (t) => {
  const store = new RunMetadataStore(await workspace(t));
  const first = await store.start(attempt());
  const secondInput = attempt({
    attemptId: SECOND,
    workflowId: 'workflow-two',
    startedAt: LATER,
    isResume: true,
    code: { revision: null, dirty: null, sha256: 'c'.repeat(64) },
    configuredModel: 'other:configured-model',
  });
  const resumed = await store.start(secondInput);

  assert.equal(resumed.runId, first.runId);
  assert.equal(resumed.historyComplete, true);
  assert.equal(resumed.currentAttemptId, SECOND);
  assert.equal(resumed.resultAttemptId, null);
  assert.equal(resumed.attempts.length, 2);
  assert.deepEqual(resumed.attempts[0], first.attempts[0]);
  assert.equal(resumed.attempts[1].resumedFromAttemptId, FIRST);
  assert.deepEqual(resumed.attempts[1].code, secondInput.code);
  assert.equal(resumed.attempts[1].configuredModel, 'other:configured-model');
  assert.deepEqual(await store.start(secondInput), resumed);
});

test('legacy resume records incomplete history without inventing a prior attempt', async (t) => {
  const store = new RunMetadataStore(await workspace(t));
  const first = await store.start(attempt({ isResume: true, code: { revision: null, dirty: null, sha256: null }, configuredModel: null }));
  assert.equal(first.historyComplete, false);
  assert.equal(first.attempts.length, 1);
  assert.equal(first.attempts[0].resumedFromAttemptId, null);
  assert.deepEqual(first.attempts[0].code, { revision: null, dirty: null, sha256: null });
  assert.equal(first.attempts[0].configuredModel, null);

  const resumed = await store.start(attempt({ attemptId: SECOND, workflowId: 'workflow-two', startedAt: LATER, isResume: true }));
  assert.equal(resumed.runId, first.runId);
  assert.equal(resumed.historyComplete, false);
  assert.equal(resumed.attempts[1].resumedFromAttemptId, FIRST);
});

test('resume lineage determines attempt order when clocks move backward or timestamps tie', async (t) => {
  const root = await workspace(t);
  for (const resumedStart of ['2026-09-07T07:59:00.000Z', START]) {
    const store = new RunMetadataStore(path.join(root, resumedStart === START ? 'tie' : 'rollback'));
    await store.start(attempt());
    const second = await store.start(attempt({ attemptId: SECOND, workflowId: 'workflow-two', startedAt: resumedStart, isResume: true }));
    assert.equal(second.currentAttemptId, SECOND);
    assert.deepEqual(second.attempts.map(({ attemptId }) => attemptId), [FIRST, SECOND]);

    const third = await store.start(attempt({ attemptId: THIRD, workflowId: 'workflow-three', startedAt: LATER, isResume: true }));
    assert.equal(third.currentAttemptId, THIRD);
    assert.deepEqual(third.attempts.map(({ attemptId, resumedFromAttemptId }) => [attemptId, resumedFromAttemptId]), [
      [FIRST, null], [SECOND, FIRST], [THIRD, SECOND],
    ]);
  }
});

test('keeps finalization pending until commit and preserves the first selected timestamp on retry', async (t) => {
  const store = new RunMetadataStore(await workspace(t));
  await store.start(attempt());
  await store.prepareFinalization(FIRST, 'complete', { reason: 'completed', endedAt: END });
  const pending = await store.read();
  assert.equal(pending.resultAttemptId, null);
  assert.equal(pending.attempts[0].endedAt, null);
  assert.equal(pending.attempts[0].termination, null);
  assert.equal(Object.hasOwn(pending.attempts[0], 'pendingFinalization'), false);
  assert.equal(Object.hasOwn(pending.attempts[0], 'finalizedStatus'), false);
  await store.prepareFinalization(FIRST, 'complete', { reason: 'completed', endedAt: LATER });

  const finalized = await store.commitFinalization('complete');
  assert.equal(finalized.resultAttemptId, FIRST);
  assert.equal(finalized.attempts[0].endedAt, END);
  assert.deepEqual(finalized.attempts[0].termination, { code: 'completed', source: 'workflow' });
  assert.deepEqual(await store.commitFinalization('complete'), finalized);
  await assert.rejects(store.prepareFinalization(FIRST, 'incomplete', { reason: 'limit_reached', endedAt: LATER }), /conflicts/);
});

test('matching terminal-state repair and metadata copying retain the original result attempt and ending', async (t) => {
  const root = await workspace(t);
  const source = path.join(root, 'source');
  const copied = path.join(root, 'copied');
  const store = new RunMetadataStore(source);
  await store.start(attempt());
  await store.recordDecision(FIRST, 'limit_reached');
  await store.prepareFinalization(FIRST, 'incomplete', { reason: 'unknown', endedAt: END });

  // A new reader represents publication repair after the terminal state was persisted.
  const repairedStore = new RunMetadataStore(source);
  const repaired = await repairedStore.commitFinalization('incomplete');
  assert.equal(repaired.resultAttemptId, FIRST);
  assert.equal(repaired.attempts[0].endedAt, END);
  assert.deepEqual(repaired.attempts[0].termination, { code: 'limit_reached', source: 'workflow' });
  assert.equal(Object.hasOwn(repaired.attempts[0], 'decision'), false);

  await repairedStore.start(attempt({ attemptId: SECOND, workflowId: 'workflow-two', startedAt: LATER, isResume: true }));
  const laterRepair = await repairedStore.commitFinalization('incomplete');
  assert.equal(laterRepair.currentAttemptId, SECOND);
  assert.equal(laterRepair.resultAttemptId, FIRST);
  assert.deepEqual(laterRepair.attempts[0], repaired.attempts[0]);
  assert.equal(laterRepair.attempts[1].endedAt, null);

  await cp(path.join(source, '.shannon', 'run-metadata'), path.join(copied, '.shannon', 'run-metadata'), { recursive: true });
  assert.deepEqual(await new RunMetadataStore(copied).read(), laterRepair);
});

test('a different terminal status cannot commit a pending result', async (t) => {
  const store = new RunMetadataStore(await workspace(t));
  await store.start(attempt());
  await store.prepareFinalization(FIRST, 'incomplete', { reason: 'uncertain_execution', endedAt: END });
  const observed = await store.commitFinalization('complete');
  assert.equal(observed.resultAttemptId, null);
  assert.equal(observed.attempts[0].endedAt, null);
  assert.equal(observed.attempts[0].termination, null);
});

test('an unknown ending never borrows a previous attempt decision', async (t) => {
  const store = new RunMetadataStore(await workspace(t));
  await store.start(attempt());
  await store.recordDecision(FIRST, 'limit_reached');
  await store.observeEnd(FIRST, END, 'interrupted', 'worker');
  await store.start(attempt({ attemptId: SECOND, workflowId: 'workflow-two', startedAt: LATER, isResume: true }));
  const secondEnd = '2026-09-07T09:15:00.000Z';
  await store.prepareFinalization(SECOND, 'incomplete', { reason: 'unknown', endedAt: secondEnd });
  const finalized = await store.commitFinalization('incomplete');

  assert.equal(finalized.resultAttemptId, SECOND);
  assert.deepEqual(finalized.attempts[0].termination, { code: 'interrupted', source: 'worker' });
  assert.equal(finalized.attempts[1].endedAt, secondEnd);
  assert.deepEqual(finalized.attempts[1].termination, { code: 'unknown', source: 'workflow' });
});

test('an unobserved worker kill leaves the ending and reason unknown', async (t) => {
  const root = await workspace(t);
  await new RunMetadataStore(root).start(attempt());
  const saved = await new RunMetadataStore(root).read();
  assert.equal(saved.attempts[0].endedAt, null);
  assert.equal(saved.attempts[0].termination, null);
  assert.equal(saved.resultAttemptId, null);
});

test('publication retries never finalize abandoned pending history', async (t) => {
  const store = new RunMetadataStore(await workspace(t));
  await store.start(attempt());
  await store.prepareFinalization(FIRST, 'incomplete', { reason: 'limit_reached', endedAt: END });
  await store.observeEnd(FIRST, END, 'interrupted', 'temporal');
  await store.start(attempt({ attemptId: SECOND, workflowId: 'workflow-two', startedAt: LATER, isResume: true }));
  const secondEnd = '2026-09-07T09:15:00.000Z';
  await store.prepareFinalization(SECOND, 'incomplete', { reason: 'component_error', endedAt: secondEnd });
  const finalized = await store.commitFinalization('incomplete', 'workflow-two');
  assert.equal(finalized.resultAttemptId, SECOND);
  assert.deepEqual(finalized.attempts[0].termination, { code: 'interrupted', source: 'temporal' });
  assert.deepEqual(await store.commitFinalization('incomplete', 'workflow-two'), finalized);
  assert.deepEqual(await store.commitFinalization('incomplete'), finalized);
  await assert.rejects(store.commitFinalization('incomplete', 'unrelated-workflow'), /does not match/);
});

test('a replacement ending can supersede an uncommitted finalization intent', async (t) => {
  const store = new RunMetadataStore(await workspace(t));
  await store.start(attempt());
  await store.prepareFinalization(FIRST, 'complete', { reason: 'completed', endedAt: END });
  // The assessment terminal write did not commit; the existing failure handler chose a new outcome.
  await store.prepareFinalization(FIRST, 'incomplete', { reason: 'component_error', endedAt: LATER });
  const finalized = await store.commitFinalization('incomplete');
  assert.equal(finalized.attempts[0].endedAt, LATER);
  assert.deepEqual(finalized.attempts[0].termination, { code: 'component_error', source: 'workflow' });
  await assert.rejects(store.prepareFinalization(FIRST, 'complete', { reason: 'completed', endedAt: END }), /conflicts/);
});

test('records explicit interruption observations and never overwrites a finalized assessment', async (t) => {
  const root = await workspace(t);
  const interrupted = new RunMetadataStore(path.join(root, 'interrupted'));
  await interrupted.start(attempt());
  await interrupted.observeEnd(FIRST, END, 'interrupted', 'temporal');
  const observed = await interrupted.read();
  assert.equal(observed.attempts[0].endedAt, END);
  assert.deepEqual(observed.attempts[0].termination, { code: 'interrupted', source: 'temporal' });
  assert.equal(observed.resultAttemptId, null);
  await interrupted.observeEnd(FIRST, LATER, 'execution_error', 'worker');
  assert.deepEqual(await interrupted.read(), observed);

  const finalizedStore = new RunMetadataStore(path.join(root, 'finalized'));
  await finalizedStore.start(attempt());
  await finalizedStore.prepareFinalization(FIRST, 'complete', { reason: 'completed', endedAt: END });
  const finalized = await finalizedStore.commitFinalization('complete');
  await finalizedStore.observeEnd(FIRST, LATER, 'interrupted', 'worker');
  assert.deepEqual(await finalizedStore.read(), finalized);
});

test('rejects malformed and non-ISO timestamps without assuming synchronized worker and Temporal clocks', async (t) => {
  const root = await workspace(t);
  const store = new RunMetadataStore(path.join(root, 'finalized'));
  for (const startedAt of ['not-a-timestamp', '2026-09-07T08:00:00+00:00']) {
    await assert.rejects(store.start(attempt({ startedAt })), /ISO UTC timestamp/);
  }
  await store.start(attempt());
  await assert.rejects(store.prepareFinalization(FIRST, 'failed', { reason: 'execution_error', endedAt: 'invalid' }), /ISO UTC timestamp/);
  await assert.rejects(store.observeEnd(FIRST, '2026-09-07T08:15:00+00:00', 'interrupted', 'worker'), /ISO UTC timestamp/);
  assert.equal((await store.read()).attempts[0].endedAt, null);

  const earlierServerTime = '2026-09-07T07:59:00.000Z';
  await store.prepareFinalization(FIRST, 'complete', { reason: 'completed', endedAt: earlierServerTime });
  const finalized = await store.commitFinalization('complete');
  assert.equal(finalized.attempts[0].startedAt, START);
  assert.equal(finalized.attempts[0].endedAt, earlierServerTime);
  assert.equal(Object.keys(finalized.attempts[0]).some((key) => /duration|elapsed/i.test(key)), false);

  const interrupted = new RunMetadataStore(path.join(root, 'interrupted'));
  await interrupted.start(attempt());
  await interrupted.observeEnd(FIRST, earlierServerTime, 'interrupted', 'temporal');
  const observed = await interrupted.read();
  assert.equal(observed.attempts[0].startedAt, START);
  assert.equal(observed.attempts[0].endedAt, earlierServerTime);
  assert.deepEqual(observed.attempts[0].termination, { code: 'interrupted', source: 'temporal' });
  assert.equal(Object.keys(observed.attempts[0]).some((key) => /duration|elapsed/i.test(key)), false);
});

test('describes recorded decisions without replacing completion or uncertainty with a coincident limit', () => {
  const input = { decision: 'incomplete', plannerStopped: true, pendingTasks: 0, unknownDeliveries: 1, limitReached: true };
  assert.equal(describeRecordedDecision({ ...input, decision: 'continue' }), null);
  assert.equal(describeRecordedDecision({ ...input, decision: 'complete' }), 'completed');
  assert.equal(describeRecordedDecision(input), 'uncertain_execution');
  assert.equal(describeRecordedDecision({ ...input, limitReached: false }), 'uncertain_execution');
  assert.equal(describeRecordedDecision({ ...input, unknownDeliveries: 0 }), 'limit_reached');
  assert.equal(describeRecordedDecision({ ...input, pendingTasks: 1 }), 'limit_reached');
  assert.equal(describeRecordedDecision({ ...input, plannerStopped: false }), 'limit_reached');
  assert.equal(describeRecordedDecision({ ...input, unknownDeliveries: 0, limitReached: false }), 'unknown');
});
