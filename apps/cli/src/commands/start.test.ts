import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ERROR_LOG_FILENAME, resolveRunFile } from '../paths.js';
import { classifyWorkspaceLaunch, writeLaunchStateAtomically } from './start.js';

const URL = 'https://target.example.com';

class ExitTrap extends Error {
  readonly exitCode: number;
  constructor(exitCode: number) {
    super(`process.exit(${exitCode}) trapped by the test`);
    this.exitCode = exitCode;
  }
}

interface FailStop {
  readonly exitCode: number;
  readonly lines: readonly string[];
}

/**
 * Run body with fail()'s process.exit trapped and its stderr lines captured, so a refusal
 * can be asserted instead of ending the test process. Anything else thrown passes through.
 */
function trapFail(body: () => void): FailStop {
  const originalExit = process.exit;
  const originalError = console.error;
  const lines: string[] = [];
  process.exit = (code?: number) => {
    throw new ExitTrap(typeof code === 'number' ? code : 1);
  };
  console.error = (...args: unknown[]) => {
    lines.push(args.map((arg) => String(arg)).join(' '));
  };
  try {
    body();
    throw new Error('expected the launch to be refused via fail()');
  } catch (error) {
    if (!(error instanceof ExitTrap)) throw error;
    return { exitCode: error.exitCode, lines };
  } finally {
    process.exit = originalExit;
    console.error = originalError;
  }
}

/** The worker's fixed vulnerability classes and the agent roster a non-exploit scan expects. */
function validDurableScanState(): unknown {
  return {
    schema_version: 1,
    exploit: false,
    participating_classes: ['injection', 'xss', 'auth', 'authz', 'ssrf'],
    expected_agents: [
      'pre-recon',
      'recon',
      'injection-vuln',
      'xss-vuln',
      'auth-vuln',
      'authz-vuln',
      'ssrf-vuln',
      'report',
    ],
  };
}

/** One error.log record exactly as the worker's writeErrorLog appends it. */
function workerErrorLogRecord(partial: Record<string, unknown> = {}): string {
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

interface WorkspaceFixture {
  readonly status: string;
  readonly errorLog?: string;
}

/** A resumable-looking workspace: valid launch.json, session.json, and optional error.log records. */
function writeWorkspace(fixture: WorkspaceFixture): string {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'shannon-workspace-'));
  const internalPath = path.join(workspacePath, '.shannon');
  fs.mkdirSync(path.join(internalPath, 'deliverables'), { recursive: true });
  writeLaunchStateAtomically(internalPath, undefined, false, false);
  fs.writeFileSync(
    path.join(internalPath, 'session.json'),
    `${JSON.stringify({ session: { id: 'sess', webUrl: URL, status: fixture.status }, durableScanState: validDurableScanState() })}\n`,
  );
  if (fixture.errorLog !== undefined) {
    fs.writeFileSync(resolveRunFile(workspacePath, ERROR_LOG_FILENAME), fixture.errorLog);
  }
  return workspacePath;
}

test('a workspace whose run is still in progress resumes', () => {
  const workspacePath = writeWorkspace({ status: 'in-progress' });
  assert.deepEqual(classifyWorkspaceLaunch(workspacePath, URL, undefined, false, false), { isResume: true });
});

test('a terminally failed workspace (non-retryable error.log) is refused, not resumed', () => {
  const workspacePath = writeWorkspace({ status: 'failed', errorLog: workerErrorLogRecord() });
  const stop = trapFail(() => {
    classifyWorkspaceLaunch(workspacePath, URL, undefined, false, false);
  });
  assert.equal(stop.exitCode, 1);
  assert.ok(
    stop.lines.some((line) => line.includes('failed terminally')),
    `message: ${stop.lines.join('\\n')}`,
  );
  assert.ok(
    stop.lines.some((line) => line.includes('different -w name')),
    `message: ${stop.lines.join('\\n')}`,
  );
  assert.ok(
    stop.lines.some((line) => line.includes('The agent could not complete its work.')),
    `hint: ${stop.lines.join('\\n')}`,
  );
  assert.ok(
    stop.lines.some((line) => line.includes('AGENT_EXECUTION_FAILED')),
    `hint: ${stop.lines.join('\\n')}`,
  );
});

test('the refusal reads the latest error.log record, not the first', () => {
  const workspacePath = writeWorkspace({
    status: 'failed',
    errorLog: `${workerErrorLogRecord({ retryable: true })}${workerErrorLogRecord({ error: { code: 'OTHER', message: 'later failure' }, retryable: false })}`,
  });
  const stop = trapFail(() => {
    classifyWorkspaceLaunch(workspacePath, URL, undefined, false, false);
  });
  assert.ok(
    stop.lines.some((line) => line.includes('later failure (OTHER)')),
    `hint: ${stop.lines.join('\\n')}`,
  );
});

test('a failed but retryable recording stays resumable', () => {
  const workspacePath = writeWorkspace({ status: 'failed', errorLog: workerErrorLogRecord({ retryable: true }) });
  assert.deepEqual(classifyWorkspaceLaunch(workspacePath, URL, undefined, false, false), { isResume: true });
});

test('a failed status with no error.log stays resumable', () => {
  const workspacePath = writeWorkspace({ status: 'failed' });
  assert.deepEqual(classifyWorkspaceLaunch(workspacePath, URL, undefined, false, false), { isResume: true });
});

test('a completed run is not refused over a stale non-retryable record', () => {
  const workspacePath = writeWorkspace({ status: 'completed', errorLog: workerErrorLogRecord() });
  assert.deepEqual(classifyWorkspaceLaunch(workspacePath, URL, undefined, false, false), { isResume: true });
});

test('an absent workspace directory launches fresh', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'shannon-workspace-'));
  const decision = classifyWorkspaceLaunch(path.join(parent, 'never-created'), URL, undefined, false, false);
  assert.equal(decision.isResume, false);
});

test('a resumed output path is read back from the recorded launch state', () => {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'shannon-workspace-'));
  const internalPath = path.join(workspacePath, '.shannon');
  fs.mkdirSync(internalPath, { recursive: true });
  writeLaunchStateAtomically(internalPath, '/tmp/reports', false, false);
  fs.writeFileSync(
    path.join(internalPath, 'session.json'),
    `${JSON.stringify({ session: { id: 'sess', webUrl: URL, status: 'in-progress' }, durableScanState: validDurableScanState() })}\n`,
  );
  const decision = classifyWorkspaceLaunch(workspacePath, URL, undefined, false, false);
  assert.deepEqual(decision, { isResume: true, outputDir: '/tmp/reports' });
});
