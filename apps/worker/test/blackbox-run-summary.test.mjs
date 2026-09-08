import assert from 'node:assert/strict';
import test from 'node:test';

import { renderBlackboxRunSummary } from '../dist/blackbox/run-summary.js';

function input(overrides = {}) {
  return {
    status: 'complete',
    failure: null,
    findingCount: 0,
    identities: [
      { name: 'alice', authenticated: true },
      { name: 'bob', authenticated: false },
    ],
    exchanges: [
      { identity: 'alice', routeSignature: 'route-a' },
      { identity: 'alice', routeSignature: 'route-a' },
      { identity: 'bob', routeSignature: 'route-a' },
      { identity: 'anonymous', routeSignature: 'route-b' },
    ],
    tasks: [],
    hypotheses: [],
    verifications: [],
    candidateCount: 0,
    rejectedTaskCount: 0,
    ...overrides,
  };
}

function runMetadata(overrides = {}) {
  return {
    schemaVersion: 1,
    runId: 'run-original',
    historyComplete: true,
    currentAttemptId: 'attempt-repair',
    resultAttemptId: 'attempt-original',
    attempts: [{
      attemptId: 'attempt-original',
      workflowId: 'workflow-original',
      resumedFromAttemptId: null,
      startedAt: '2026-09-07T08:00:00.000Z',
      endedAt: '2026-09-07T08:30:00.000Z',
      code: { revision: 'a'.repeat(40), dirty: false, sha256: 'b'.repeat(64) },
      configuredModel: 'provider:original-model',
      termination: { code: 'limit_reached', source: 'workflow' },
    }, {
      attemptId: 'attempt-repair',
      workflowId: 'workflow-repair',
      resumedFromAttemptId: 'attempt-original',
      startedAt: '2026-09-08T10:00:00.000Z',
      endedAt: null,
      code: { revision: null, dirty: null, sha256: null },
      configuredModel: 'provider:repair-model',
      termination: { code: 'completed', source: 'worker' },
    }],
    ...overrides,
  };
}

test('counts observed request shapes and identity pairs without claiming test coverage', () => {
  const records = input();
  const before = structuredClone(records);
  const report = renderBlackboxRunSummary(records);

  assert.match(report, /Saved traffic records \| 4 \|/);
  assert.match(report, /Observed route groups \| 2 \|/);
  assert.match(report, /Observed route\/identity pairs \| 3 \|/);
  assert.match(report, /Configured identities marked authenticated \| 1 of 2 \|/);
  assert.match(report, /Identities with observed traffic \| 2 named; anonymous: yes \|/);
  assert.match(report, /Total application coverage is unknown/);
  assert.match(report, /does not recheck session validity/);
  assert.deepEqual(records, before);
  assert.equal(renderBlackboxRunSummary({ ...records, exchanges: [...records.exchanges].reverse() }), report);
});

test('keeps lifecycle categories separate from findings and completed checks', () => {
  const report = renderBlackboxRunSummary(input({
    tasks: ['completed', 'failed', 'pending', 'running', 'rejected'].map(status => ({ status })),
    hypotheses: ['open', 'queued', 'tested', 'blocked', 'verified', 'disproved', 'no_demonstrated_impact'].map(status => ({ status })),
    verifications: ['verified', 'verified', 'disproved', 'blocked'].map(verdict => ({ verdict })),
    candidateCount: 5,
    rejectedTaskCount: 3,
    findingCount: 1,
  }));

  assert.match(report, /Reportable findings \| 1 \|/);
  assert.match(report, /Tasks \| completed: 1; failed: 1; pending: 1; running: 1; rejected: 1 \|/);
  assert.match(report, /Unresolved hypotheses \| 4 \|/);
  assert.match(report, /tested: 1; blocked: 1; verified: 1; disproved: 1; no_demonstrated_impact: 1/);
  assert.match(report, /Candidate records \| 5 \|/);
  assert.match(report, /Verifier records \| verified: 2; disproved: 1; blocked: 1 \|/);
  assert.match(report, /Rejected proposal records \| 3 \|/);
  assert.match(report, /counts overlap and must not be added together/);
  assert.match(report, /not promoted to findings by this summary/);
});

test('does not infer a stop explanation from completed tasks, status, or an absent error', () => {
  for (const status of ['complete', 'incomplete', 'failed']) {
    for (const failure of [null, '', '   ']) {
      const report = renderBlackboxRunSummary(input({ status, failure, tasks: [{ status: 'completed' }] }));
      assert.match(report, /Stop explanation: not recorded\./);
    }
  }

  const report = renderBlackboxRunSummary(input({ failure: 'private error detail' }));
  assert.match(report, /a failure was recorded; see the report failure detail/);
  assert.equal(report.includes('private error detail'), false);
});

test('empty observations remain distinct from zero findings', () => {
  const report = renderBlackboxRunSummary(input({ exchanges: [] }));
  assert.match(report, /Saved traffic records \| 0 \|/);
  assert.match(report, /Observed route groups \| 0 \|/);
  assert.match(report, /Observed route\/identity pairs \| 0 \|/);
  assert.match(report, /Identities with observed traffic \| 0 named; anonymous: no \|/);
  assert.match(report, /Reportable findings \| 0 \|/);
  assert.match(report, /Run completion does not establish that the application is secure/);
});

test('attributes results to the result attempt while preserving later repair metadata', () => {
  const metadata = runMetadata();
  const before = structuredClone(metadata);
  const report = renderBlackboxRunSummary(input({ status: 'incomplete', runMetadata: metadata }));

  assert.match(report, /Run ID \| run-original \|/);
  assert.match(report, /Result attempt \| attempt-original \|/);
  assert.match(report, /Latest attempt \| attempt-repair \|/);
  assert.match(report, /Attempt: attempt-original \(result attempt\)/);
  assert.match(report, /Attempt: attempt-repair \(latest attempt\)/);
  assert.match(report, /Resumed from attempt \| attempt-original \|/);
  assert.match(report, /Stop explanation: the run reached its execution limit \(source: workflow\)\./);
  assert.doesNotMatch(report, /Stop explanation: the run reached its recorded completion condition/);
  assert.match(report, /Ended at \| 2026-09-07T08:30:00.000Z \|/);
  assert.match(report, /Ended at \| not recorded \|/);
  assert.match(report, /Configured model \| provider:original-model \|/);
  assert.match(report, /Configured model \| provider:repair-model \|/);
  assert.match(report, /Worker code has uncommitted changes \| no \|/);
  assert.match(report, /Worker code has uncommitted changes \| not recorded \|/);
  assert.match(report, /not proof that a model call occurred/);
  assert.deepEqual(metadata, before);
  assert.equal(renderBlackboxRunSummary(input({ status: 'incomplete', runMetadata: metadata })), report);
});

test('keeps legacy and incomplete attempt history unknown without borrowing the latest termination', () => {
  const legacy = renderBlackboxRunSummary(input());
  assert.doesNotMatch(legacy, /Recorded execution provenance/);
  for (const resultAttemptId of [null, 'attempt-not-in-history']) {
    const report = renderBlackboxRunSummary(input({
      runMetadata: runMetadata({ historyComplete: false, resultAttemptId }),
    }));
    assert.match(report, /Attempt history \| incomplete; earlier history is not fully recorded \|/);
    assert.match(report, /Stop explanation: not recorded\./);
    assert.doesNotMatch(report, /Stop explanation: the run reached/);
  }
  const metadata = runMetadata();
  metadata.attempts[0].termination = null;
  const report = renderBlackboxRunSummary(input({ runMetadata: metadata, failure: 'historical private failure' }));
  assert.match(report, /Stop explanation: a failure was recorded; see the report failure detail\./);
  assert.doesNotMatch(report, /historical private failure/);
});

test('reports an explicitly unknown termination without inventing an end time', () => {
  const metadata = runMetadata();
  metadata.attempts[0].endedAt = null;
  for (const code of ['unknown', 'future_reason', 'toString']) {
    metadata.attempts[0].termination = { code, source: 'worker' };
    const report = renderBlackboxRunSummary(input({ runMetadata: metadata }));
    assert.match(report, /Stop explanation: the termination reason is unknown \(source: worker\)\./);
    assert.match(report, /Ended at \| not recorded \|/);
    assert.doesNotMatch(report, /2026-09-07T08:30:00.000Z/);
  }
});

test('escapes metadata markup and line breaks without changing the recorded input', () => {
  const metadata = runMetadata();
  const payload = 'value|column\n<script>**bold**_text_`code`[link](https://example.test)&\\';
  metadata.runId = payload;
  metadata.attempts[0].configuredModel = payload;
  metadata.attempts[0].code.revision = payload;
  metadata.attempts[0].workflowId = payload;
  const before = structuredClone(metadata);
  const report = renderBlackboxRunSummary(input({ runMetadata: metadata }));
  assert.doesNotMatch(report, /<script>|\*\*bold\*\*|`code`|\[link\]|value\|column/);
  assert.match(report, /value&#124;column &#60;script&#62;&#42;&#42;bold/);
  assert.match(report, /&#96;code&#96;&#91;link&#93;/);
  assert.match(report, /&#38;&#92;/);
  for (const line of report.split('\n').filter(line => line.startsWith('|'))) {
    assert.equal((line.match(/\|/g) ?? []).length, 3, line);
  }
  assert.deepEqual(metadata, before);
});
