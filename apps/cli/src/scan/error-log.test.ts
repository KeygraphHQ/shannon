import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { persistedFailureMessage, readLastPersistedAgentFailure, resumeFailureMessage } from './error-log.js';

/** One record exactly as the worker's writeErrorLog appends it (apps/worker/src/ai/pi/pi-executor.ts). */
function workerRecord(partial: Record<string, unknown> = {}): string {
  return `${JSON.stringify({
    timestamp: '2026-11-13T03:40:40.536Z',
    agent: 'pi-executor',
    error: { code: 'AGENT_EXECUTION_FAILED', category: 'unknown', message: 'The agent could not complete its work.' },
    duration: 2538157,
    turns: 5,
    retryable: false,
    provider: { provider: 'openrouter', model: 'm', stopReason: 'error' },
    ...partial,
  })}\n`;
}

function writeLog(contents: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shannon-error-log-'));
  const logPath = path.join(dir, 'error.log');
  fs.writeFileSync(logPath, contents);
  return logPath;
}

test('reads the most recent record from a multi-entry log', () => {
  const logPath = writeLog(
    workerRecord({
      timestamp: '2026-11-13T03:00:00.000Z',
      error: { code: 'OTHER', message: 'first failure' },
      retryable: true,
    }) + workerRecord(),
  );
  const failure = readLastPersistedAgentFailure(logPath);
  assert.equal(failure?.code, 'AGENT_EXECUTION_FAILED');
  assert.equal(failure?.message, 'The agent could not complete its work.');
  assert.equal(failure?.retryable, false);
  assert.equal(failure?.providerStopReason, 'error');
});

test('a truncated final line (crash mid-append) falls back to the prior record', () => {
  const logPath = writeLog(
    `${workerRecord({ retryable: true, error: { code: 'OTHER', message: 'first failure' } })}{"timestamp":"2026-`,
  );
  const failure = readLastPersistedAgentFailure(logPath);
  assert.equal(failure?.code, 'OTHER');
  assert.equal(failure?.retryable, true);
});

test('a missing log file means no failure was recorded', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shannon-error-log-'));
  assert.equal(readLastPersistedAgentFailure(path.join(dir, 'error.log')), undefined);
});

test('an empty or unparseable log means no failure was recorded', () => {
  assert.equal(readLastPersistedAgentFailure(writeLog('')), undefined);
  assert.equal(readLastPersistedAgentFailure(writeLog('\n\n')), undefined);
  assert.equal(readLastPersistedAgentFailure(writeLog('not json\n42\n')), undefined);
});

test('a record without a message or code is not surfaced', () => {
  const logPath = writeLog(`${JSON.stringify({ retryable: false })}\n`);
  assert.equal(readLastPersistedAgentFailure(logPath), undefined);
});

test('a record without provider details yields no stop reason', () => {
  const logPath = writeLog(workerRecord({ provider: undefined }));
  const failure = readLastPersistedAgentFailure(logPath);
  assert.equal(failure?.providerStopReason, undefined);
  assert.equal(failure?.retryable, false);
});

test('persistedFailureMessage renders context, reason, stop reason, and reference code', () => {
  const message = persistedFailureMessage({
    code: 'AGENT_EXECUTION_FAILED',
    message: 'The agent could not complete its work.',
    retryable: false,
    providerStopReason: 'error',
  });
  assert.equal(
    message,
    'The previous run of this workspace recorded this failure|The agent could not complete its work.' +
      '|Provider stop reason: error|Reference code: AGENT_EXECUTION_FAILED',
  );
});

test('persistedFailureMessage omits absent fields', () => {
  const message = persistedFailureMessage({ message: 'The agent could not complete its work.' });
  assert.equal(
    message,
    'The previous run of this workspace recorded this failure|The agent could not complete its work.',
  );
});

test('resumeFailureMessage prefers a typed outcome message over the persisted record', () => {
  const outcomeMessage =
    'preflight failed|Provider authentication failed.|Hint: Verify the selected provider' +
    "'s API key is valid and not expired.|Reference code: AuthenticationError";
  const logPath = writeLog(workerRecord());
  assert.equal(resumeFailureMessage(outcomeMessage, logPath, true), outcomeMessage);
});

test('resumeFailureMessage replaces the generic wrapper with the persisted reason', () => {
  const logPath = writeLog(workerRecord());
  const message = resumeFailureMessage('Pipeline failed|The scan could not be completed.', logPath, true);
  assert.match(message, /The agent could not complete its work\./);
  assert.match(message, /Provider stop reason: error/);
  assert.match(message, /Reference code: AGENT_EXECUTION_FAILED/);
});

test('resumeFailureMessage keeps the outcome message when no record exists', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shannon-error-log-'));
  const outcomeMessage = 'Pipeline failed|The scan could not be completed.';
  assert.equal(resumeFailureMessage(outcomeMessage, path.join(dir, 'error.log'), true), outcomeMessage);
});

test('resumeFailureMessage never reads the record on a fresh launch', () => {
  const logPath = writeLog(workerRecord());
  const outcomeMessage = 'Pipeline failed|The scan could not be completed.';
  assert.equal(resumeFailureMessage(outcomeMessage, logPath, false), outcomeMessage);
});
