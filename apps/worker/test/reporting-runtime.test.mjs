// Requires a separately started, isolated Temporal dev server. This tests a synthetic
// workflow with local fixture activities, not the production assessment entrypoint.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Client, Connection, WorkflowFailedError } from '@temporalio/client';
import { bundleWorkflowCode, DefaultLogger, NativeConnection, Worker } from '@temporalio/worker';
import { createReportingActivities } from './fixtures/reporting-runtime/activities.mjs';

const ARTIFACT_NAMES = [
  'traffic_inventory.json',
  'blackbox_blackboard.json',
  'blackbox_authz_findings.json',
  'blackbox_authz_evidence.md',
];
const FIXTURE_MODEL = 'fixture:configured-but-never-called';
const TEMP_PREFIX = 'shannon-reporting-runtime-';
const WORKER_DIRECTORY = fileURLToPath(new URL('../', import.meta.url));

function temporalAddress() {
  const address = process.env.REPORTING_TEMPORAL_ADDRESS ?? '127.0.0.1:7233';
  const loopback = /^(?:127\.0\.0\.1|localhost|\[::1\]):([0-9]{1,5})$/.exec(address);
  if (address !== 'temporal:7233' && (!loopback || Number(loopback[1]) < 1 || Number(loopback[1]) > 65535)) {
    throw new Error('REPORTING_TEMPORAL_ADDRESS must be loopback:port or exactly temporal:7233 in the isolated test network');
  }
  return address;
}

async function bounded(promise, milliseconds, description) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${description} exceeded ${milliseconds}ms`)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function removeOwnedRoot(root) {
  const resolved = path.resolve(root);
  assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
  assert.ok(path.basename(resolved).startsWith(TEMP_PREFIX));
  assert.equal((await stat(resolved)).isDirectory(), true);
  await rm(resolved, { recursive: true, force: true });
}

function attemptInput(root, label, overrides = {}) {
  return {
    workspace: path.join(root, label),
    attemptId: randomUUID(),
    workflowId: `reporting-runtime-${label}-${randomUUID()}`,
    startedAt: new Date().toISOString(),
    isResume: false,
    configuredModel: FIXTURE_MODEL,
    status: 'complete',
    reason: 'completed',
    ...overrides,
  };
}

async function readBundle(workspace) {
  const directory = path.join(workspace, 'copied-report');
  assert.deepEqual((await readdir(directory)).sort(), [...ARTIFACT_NAMES].sort());
  const contents = {};
  for (const name of ARTIFACT_NAMES) {
    contents[name] = await readFile(path.join(directory, name), 'utf8');
    assert.equal(contents[name], await readFile(path.join(workspace, '.shannon', 'deliverables', name), 'utf8'));
  }
  const board = JSON.parse(contents['blackbox_blackboard.json']);
  const inventory = JSON.parse(contents['traffic_inventory.json']);
  const findings = JSON.parse(contents['blackbox_authz_findings.json']);
  const markdown = contents['blackbox_authz_evidence.md'];
  assert.deepEqual(findings, []);
  assert.equal(inventory.length, 1);
  assert.equal(inventory[0].origin, 'https://reporting-fixture.invalid');
  assert.equal('rawRecordRef' in inventory[0], false);
  assert.equal('stateRef' in board.identities[0], false);
  assert.match(markdown, /Reportable findings \| 0 \|/);
  assert.match(markdown, /Saved traffic records \| 1 \|/);
  assert.match(markdown, /Total application coverage is unknown/);
  assert.match(markdown, /No replay-verified findings were produced/);
  assert.match(markdown, /Run completion does not establish that the application is secure/);
  return { board, inventory, findings, markdown, contents };
}

async function packagedInstallation(root) {
  const directory = path.join(root, 'packaged-installation');
  const dist = path.join(directory, 'apps', 'worker', 'dist');
  await mkdir(path.join(dist, 'audit'), { recursive: true });
  await mkdir(path.join(dist, 'utils'), { recursive: true });
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ type: 'module' }));
  for (const relative of ['audit/run-metadata.js', 'utils/concurrency.js', 'utils/file-io.js']) {
    await copyFile(path.join(WORKER_DIRECTORY, 'dist', relative), path.join(dist, relative));
  }
  await assert.rejects(stat(path.join(directory, '.git')), { code: 'ENOENT' });
  return { module: path.join(dist, 'audit', 'run-metadata.js'), marker: path.join(dist, 'fixture-marker.js') };
}

test('passive reporting modules through an isolated Temporal runtime', { timeout: 180_000 }, async (t) => {
  const address = temporalAddress();
  const root = await mkdtemp(path.join(tmpdir(), TEMP_PREFIX));
  t.after(() => removeOwnedRoot(root));
  let connection;
  try {
    connection = await Connection.connect({ address, connectTimeout: '5 seconds' });
  } catch (error) {
    throw new Error(`Isolated Temporal server unavailable at ${address}; start the reporting test server explicitly. This test does not skip.`, { cause: error });
  }
  t.after(() => bounded(connection.close(), 5_000, 'Temporal client cleanup'));
  const nativeConnection = await bounded(NativeConnection.connect({ address }), 10_000, 'Temporal worker connection');
  t.after(() => bounded(nativeConnection.close(), 5_000, 'Temporal native connection cleanup'));
  const client = new Client({ connection, namespace: 'default' });
  const taskQueue = `reporting-runtime-${randomUUID()}`;
  const workflowBundle = await bounded(bundleWorkflowCode({
    workflowsPath: fileURLToPath(new URL('./fixtures/reporting-runtime/workflows.js', import.meta.url)),
    logger: new DefaultLogger('WARN'),
  }), 30_000, 'Synthetic workflow bundling');
  const worker = await bounded(Worker.create({
    connection: nativeConnection,
    namespace: 'default',
    taskQueue,
    workflowBundle,
    activities: createReportingActivities(root),
    shutdownGraceTime: '2 seconds',
    shutdownForceTime: '5 seconds',
    maxConcurrentActivityTaskExecutions: 2,
    maxConcurrentWorkflowTaskExecutions: 2,
  }), 15_000, 'Synthetic reporting worker creation');
  const activeHandles = new Set();
  const rpc = (fn, milliseconds = 10_000) => connection.withDeadline(Date.now() + milliseconds, fn);
  async function start(type, input) {
    const handle = await rpc(() => client.workflow.start(type, {
      workflowId: input.workflowId,
      taskQueue,
      args: [input],
      workflowExecutionTimeout: '35 seconds',
      workflowTaskTimeout: '10 seconds',
    }));
    activeHandles.add(handle);
    return handle;
  }
  async function execute(type, input) {
    const handle = await start(type, input);
    try {
      const result = await rpc(() => handle.result(), 40_000);
      activeHandles.delete(handle);
      return result;
    } catch (error) {
      if (error instanceof WorkflowFailedError) activeHandles.delete(handle);
      throw error;
    }
  }
  async function auxiliary(type, input) {
    return execute(type, { ...input, workflowId: `reporting-runtime-observation-${randomUUID()}` });
  }
  await worker.runUntil(async () => {
    try {
      await t.test('completion publishes metadata and all four copied artifacts', { timeout: 45_000 }, async () => {
        const input = attemptInput(root, 'completion');
        const result = await execute('reportingLifecycle', input);
        const report = await readBundle(input.workspace);
        assert.equal(report.board.runStatus, 'complete');
        assert.deepEqual(report.board.runMetadata, result.metadata);
        assert.equal(result.metadata.resultAttemptId, input.attemptId);
        assert.equal(result.metadata.currentAttemptId, input.attemptId);
        assert.equal(result.metadata.attempts[0].configuredModel, FIXTURE_MODEL);
        assert.equal(result.metadata.attempts[0].startedAt, input.startedAt);
        assert.equal(result.metadata.attempts[0].termination.code, 'completed');
        assert.match(result.metadata.attempts[0].code.sha256, /^[0-9a-f]{64}$/);
        assert.match(report.markdown, /Stop explanation: the run reached its recorded completion condition \(source: workflow\)/);
      });

      await t.test('incomplete outcome retains its recorded reason and unknown coverage', { timeout: 45_000 }, async () => {
        const input = attemptInput(root, 'incomplete', { status: 'incomplete', reason: 'limit_reached' });
        await execute('reportingLifecycle', input);
        const report = await readBundle(input.workspace);
        assert.equal(report.board.runStatus, 'incomplete');
        assert.equal(report.board.runMetadata.attempts[0].termination.code, 'limit_reached');
        assert.match(report.markdown, /The run was incomplete/);
        assert.match(report.markdown, /Stop explanation: the run reached its execution limit \(source: workflow\)/);
      });

      await t.test('Temporal publication activity retry retains the first selected ending', { timeout: 45_000 }, async () => {
        const input = attemptInput(root, 'retry', { failPublicationOnce: true });
        await execute('reportingLifecycle', input);
        const report = await readBundle(input.workspace);
        const attempts = (await readFile(path.join(input.workspace, '.fixture', 'publications.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
        assert.deepEqual(attempts.map(attempt => attempt.activityAttempt), [1, 2]);
        assert.deepEqual(attempts.map(attempt => attempt.injectedFailure), [true, false]);
        assert.equal(attempts[0].selectedEndedAt, attempts[1].selectedEndedAt);
        assert.equal(attempts[0].recordedEndedAt, attempts[1].recordedEndedAt);
        assert.equal(report.board.runMetadata.attempts.length, 1);
        assert.equal(report.board.runMetadata.attempts[0].endedAt, attempts[0].selectedEndedAt);
        assert.ok(report.markdown.includes(attempts[0].selectedEndedAt));
      });

      await t.test('later repair attempt preserves the original result owner and provenance', { timeout: 45_000 }, async () => {
        const original = attemptInput(root, 'repair');
        await execute('reportingLifecycle', original);
        const before = await readBundle(original.workspace);
        const repair = attemptInput(root, 'repair', {
          isResume: true,
          configuredModel: 'fixture:repair-never-called',
          code: { revision: null, dirty: null, sha256: 'c'.repeat(64) },
        });
        await execute('reportingRepair', repair);
        const after = await readBundle(original.workspace);
        assert.equal(after.board.runMetadata.runId, before.board.runMetadata.runId);
        assert.equal(after.board.runMetadata.resultAttemptId, original.attemptId);
        assert.equal(after.board.runMetadata.currentAttemptId, repair.attemptId);
        assert.deepEqual(after.board.runMetadata.attempts[0], before.board.runMetadata.attempts[0]);
        assert.equal(after.board.runMetadata.attempts[1].resumedFromAttemptId, original.attemptId);
        assert.equal(after.board.runMetadata.attempts[1].endedAt, null);
        assert.ok(after.markdown.includes(`Result attempt | ${original.attemptId} |`));
        assert.ok(after.markdown.includes(`Latest attempt | ${repair.attemptId} |`));
        assert.match(after.markdown, /Stop explanation: the run reached its recorded completion condition/);
      });

      await t.test('unobserved ending stays unknown until a Temporal cancellation close is recorded', { timeout: 45_000 }, async () => {
        const input = attemptInput(root, 'cancelled');
        const handle = await start('reportingWaiting', input);
        const readyDeadline = Date.now() + 10_000;
        while (!await rpc(() => handle.query('reportingReady'))) {
          if (Date.now() > readyDeadline) throw new Error('Synthetic waiting workflow did not become ready');
          await delay(50);
        }
        await rpc(() => handle.cancel());
        await assert.rejects(rpc(() => handle.result()), error => error instanceof WorkflowFailedError && error.cause?.name === 'CancelledFailure');
        activeHandles.delete(handle);
        // Deliberately withhold the close observation from the production journal.
        await auxiliary('reportingSnapshot', input);
        const unknown = await readBundle(input.workspace);
        assert.equal(unknown.board.runMetadata.resultAttemptId, null);
        assert.equal(unknown.board.runMetadata.attempts[0].endedAt, null);
        assert.equal(unknown.board.runMetadata.attempts[0].termination, null);
        assert.match(unknown.markdown, /Ended at \| not recorded \|/);
        assert.match(unknown.markdown, /Stop explanation: not recorded/);
        const description = await rpc(() => handle.describe());
        assert.equal(description.status.name, 'CANCELLED');
        assert.ok(description.closeTime instanceof Date);
        await auxiliary('reportingObservedCancellation', {
          ...input,
          observedStatus: description.status.name,
          observedCloseTime: description.closeTime.toISOString(),
        });
        const observed = await readBundle(input.workspace);
        assert.equal(observed.board.runMetadata.attempts[0].endedAt, description.closeTime.toISOString());
        assert.deepEqual(observed.board.runMetadata.attempts[0].termination, { code: 'interrupted', source: 'temporal' });
        assert.equal(observed.board.runMetadata.resultAttemptId, null);
        assert.match(observed.markdown, /Recorded termination \| the execution was interrupted \(source: temporal\)/);
        assert.match(observed.markdown, /Stop explanation: not recorded/);
      });

      await t.test('a packaged no-Git installation exports its worker JavaScript fingerprint', { timeout: 45_000 }, async () => {
        const packaged = await packagedInstallation(root);
        const first = attemptInput(root, 'packaged-first', { packagedModule: packaged.module });
        await execute('reportingLifecycle', first);
        const original = await readBundle(first.workspace);
        const originalCode = original.board.runMetadata.attempts[0].code;
        assert.equal(originalCode.revision, null);
        assert.equal(originalCode.dirty, null);
        assert.match(originalCode.sha256, /^[0-9a-f]{64}$/);
        assert.match(original.markdown, /Worker code revision \| not recorded \|/);
        assert.ok(original.markdown.includes(`Worker JavaScript SHA-256 | ${originalCode.sha256} |`));
        await writeFile(packaged.marker, '// Synthetic fingerprint marker; never executed.\n');
        const changed = attemptInput(root, 'packaged-changed', { packagedModule: packaged.module });
        await execute('reportingLifecycle', changed);
        const updated = await readBundle(changed.workspace);
        assert.notEqual(updated.board.runMetadata.attempts[0].code.sha256, originalCode.sha256);
        assert.deepEqual((await readBundle(first.workspace)).board.runMetadata.attempts[0].code, originalCode);
      });
    } finally {
      const cleanup = await Promise.allSettled([...activeHandles].map(
        handle => rpc(() => handle.terminate('Synthetic reporting test cleanup'), 5_000),
      ));
      const failures = cleanup.filter(result => result.status === 'rejected').map(result => result.reason);
      if (failures.length > 0) throw new AggregateError(failures, 'Synthetic reporting workflow cleanup failed');
    }
  }, { promiseCompletionTimeout: '5 seconds' });
});
