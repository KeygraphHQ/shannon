import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertResumeCompatible,
  copyBlackboxDeliverables,
  deriveWorkflowId,
  enforceResumeTerminationFailure,
  parseCliArgs,
  workflowNameFor,
} from '../dist/temporal/worker-cli.js';
import { MetricsTracker } from '../dist/audit/metrics-tracker.js';

const ARTIFACTS = [
  'traffic_inventory.json',
  'blackbox_blackboard.json',
  'blackbox_authz_findings.json',
  'blackbox_authz_evidence.md',
];

const SCOPE = {
  mode: 'blackbox',
  targetOrigin: 'https://target.example',
  identities: ['attacker', 'victim'],
  burpMcpUrl: 'http://host.docker.internal:9876/',
  burpMcpHostHeader: '127.0.0.1:9876',
  burpProxyUrl: 'http://host.docker.internal:18080/',
};

test('derived workflow IDs stay within the control-key identifier limit', () => {
  const longWorkspace = 'a'.repeat(128);
  const anotherWorkspace = `${'a'.repeat(127)}b`;
  const fresh = deriveWorkflowId(longWorkspace, 'new', 1_800_000_000_000);
  const resumed = deriveWorkflowId(longWorkspace, 'resume', 1_800_000_000_000);

  assert.match(fresh, /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
  assert.match(resumed, /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
  assert.notEqual(fresh, deriveWorkflowId(anotherWorkspace, 'new', 1_800_000_000_000));
  assert.equal(deriveWorkflowId('named_shannon-123', 'new', 1_800_000_000_000), 'named_shannon-123');
});

test('worker CLI selects black-box mode without changing the white-box default', () => {
  assert.deepEqual(
    parseCliArgs([
      'https://target.example/login',
      '/target',
      '--blackbox',
      '--task-queue',
      'queue-1',
      '--config',
      '/app/configs/target.yaml',
    ]),
    {
      mode: 'blackbox',
      webUrl: 'https://target.example/login',
      repoPath: '/target',
      taskQueue: 'queue-1',
      configPath: '/app/configs/target.yaml',
      pipelineTestingMode: false,
    },
  );
  assert.equal(workflowNameFor('blackbox'), 'blackboxAuthzWorkflow');
  assert.equal(workflowNameFor('whitebox'), 'pentestPipelineWorkflow');

  const whitebox = parseCliArgs(['https://target.example', '/repo', '--task-queue', 'queue-2']);
  assert.equal(whitebox.mode, 'whitebox');
  assert.throws(
    () => parseCliArgs(['https://target.example', '/target', '--blackbox', '--task-queue', 'queue-3']),
    /--config.*blackbox/i,
  );
  assert.throws(() => parseCliArgs(['https://target.example', '--task-queue', 'queue-3']), /repoPath/i);
});

test('resume treats legacy sessions as white-box and compares canonical black-box scope', () => {
  assert.doesNotThrow(() =>
    assertResumeCompatible(
      { session: { id: 'legacy', webUrl: 'https://target.example' } },
      { mode: 'whitebox', webUrl: 'https://target.example' },
    ),
  );
  assert.throws(
    () =>
      assertResumeCompatible(
        { session: { id: 'legacy', webUrl: 'https://target.example' } },
        { mode: 'blackbox', webUrl: 'https://target.example' },
        SCOPE,
      ),
    /mode/i,
  );

  const session = {
    session: {
      id: 'blackbox-run',
      webUrl: 'https://target.example/first/path',
      mode: 'blackbox',
      blackboxScope: { ...SCOPE, identities: ['victim', 'attacker'] },
    },
  };
  assert.doesNotThrow(() =>
    assertResumeCompatible(session, { mode: 'blackbox', webUrl: 'https://TARGET.example/other/path' }, SCOPE),
  );

  for (const [field, value] of [
    ['targetOrigin', 'https://other.example'],
    ['identities', ['attacker', 'backup']],
    ['burpMcpUrl', 'http://host.docker.internal:9999/'],
    ['burpMcpHostHeader', '127.0.0.1:9999'],
    ['burpProxyUrl', 'http://host.docker.internal:19090/'],
  ]) {
    assert.throws(
      () => assertResumeCompatible(session, { mode: 'blackbox', webUrl: 'https://target.example' }, {
        ...SCOPE,
        [field]: value,
      }),
      new RegExp(field.replace(/[A-Z]/g, (letter) => `.?${letter.toLowerCase()}`), 'i'),
    );
  }
});

test('black-box resume fails closed when a running predecessor cannot be terminated', () => {
  const failure = new Error('Temporal unavailable');
  assert.throws(
    () => enforceResumeTerminationFailure('blackbox', 'prior-workflow', failure),
    /prior-workflow.*Temporal unavailable/i,
  );
  assert.doesNotThrow(() => enforceResumeTerminationFailure('whitebox', 'prior-workflow', failure));
});

test('session state persists mode and black-box scope and records a resume once', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'shannon-blackbox-session-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'run-1', '.shannon'), { recursive: true });
  const metadata = {
    id: 'run-1',
    webUrl: 'https://target.example/login',
    repoPath: '/target',
    outputPath: root,
    mode: 'blackbox',
    blackboxScope: SCOPE,
  };
  const tracker = new MetricsTracker(metadata);
  await tracker.initialize('workflow-1');
  await tracker.addResumeAttempt('workflow-resume', ['workflow-1']);
  await tracker.addResumeAttempt('workflow-resume', ['workflow-1']);

  const saved = JSON.parse(await readFile(path.join(root, 'run-1', '.shannon', 'session.json'), 'utf8'));
  assert.equal(saved.session.mode, 'blackbox');
  assert.deepEqual(saved.session.blackboxScope, SCOPE);
  assert.equal(saved.session.resumeAttempts.filter(({ workflowId }) => workflowId === 'workflow-resume').length, 1);
  assert.equal(JSON.stringify(saved).includes('password'), false);

  const reordered = new MetricsTracker({
    ...metadata,
    blackboxScope: { ...SCOPE, identities: ['victim', 'attacker'] },
  });
  await reordered.initialize('workflow-resume-2');
  await assert.rejects(
    new MetricsTracker({ ...metadata, blackboxScope: { ...SCOPE, burpProxyUrl: 'http://proxy.example:9000/' } })
      .initialize('workflow-resume-3'),
    /burpProxyUrl/i,
  );
});

test('black-box output copies exactly the fixed regular-file manifest', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'shannon-blackbox-output-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const deliverables = path.join(root, '.shannon', 'deliverables');
  const output = path.join(root, 'output');
  await mkdir(path.join(root, '.shannon', 'blackbox', 'raw'), { recursive: true });
  await mkdir(path.join(root, '.shannon', 'blackbox', 'identities'), { recursive: true });
  await mkdir(deliverables, { recursive: true });
  for (const name of ARTIFACTS) await writeFile(path.join(deliverables, name), `fixture:${name}`, 'utf8');
  await writeFile(path.join(deliverables, 'unexpected-secret.json'), 'must not copy', 'utf8');

  copyBlackboxDeliverables(root, output);

  assert.deepEqual((await readdir(output)).sort(), [...ARTIFACTS].sort());
  for (const name of ARTIFACTS) assert.equal(await readFile(path.join(output, name), 'utf8'), `fixture:${name}`);
});

test('black-box output rejects a missing or symlinked artifact before copying', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'shannon-blackbox-output-invalid-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const deliverables = path.join(root, '.shannon', 'deliverables');
  const output = path.join(root, 'output');
  await mkdir(deliverables, { recursive: true });
  for (const name of ARTIFACTS.slice(0, -1)) await writeFile(path.join(deliverables, name), name, 'utf8');

  assert.throws(() => copyBlackboxDeliverables(root, output), /missing.*blackbox_authz_evidence\.md/i);
  await mkdir(path.join(root, 'outside'), { recursive: true });
  await symlink(path.join(root, 'outside'), path.join(deliverables, ARTIFACTS.at(-1)), 'junction');
  assert.throws(() => copyBlackboxDeliverables(root, output), /regular file|symbolic link/i);
  await assert.rejects(readdir(output), /ENOENT/);
});
