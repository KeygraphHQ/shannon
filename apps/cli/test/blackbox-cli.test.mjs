import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { link, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

process.env.SHANNON_LOCAL = '1';
process.env.SHANNON_FORWARD_HOSTS = 'false';

const cli = await import('../dist/index.mjs');

function exportedFunction(name) {
  assert.equal(typeof cli[name], 'function', `${name} must be exported from the CLI entry`);
  return cli[name];
}

function mounts(args) {
  const values = [];
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '-v') values.push(args[index + 1]);
  }
  return values;
}

function validationSelector(overrides = {}) {
  const payload = {
    schemaVersion: 1,
    kind: 'blackbox-cross-identity-validation',
    comparisonSha256: 'b'.repeat(64),
    sourceManifestSha256: 'c'.repeat(64),
    comparisonId: 'comparison-000001',
    routeSignature: 'route_790000000000000000000001',
    method: 'GET',
    origin: 'https://target.example',
    routePathPrefix: '/api/memos',
    requestClass: 'request-class-0001',
    recordedRole: 'member',
    victimIdentity: 'victim',
    attackerIdentity: 'attacker',
    ...overrides,
  };
  return {
    schemaVersion: payload.schemaVersion,
    kind: payload.kind,
    comparisonSha256: payload.comparisonSha256,
    sourceManifestSha256: payload.sourceManifestSha256,
    selectionDigest: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    comparisonId: payload.comparisonId,
    routeSignature: payload.routeSignature,
    method: payload.method,
    origin: payload.origin,
    routePathPrefix: payload.routePathPrefix,
    requestClass: payload.requestClass,
    recordedRole: payload.recordedRole,
    victimIdentity: payload.victimIdentity,
    attackerIdentity: payload.attackerIdentity,
  };
}

test('blackbox start accepts a URL and config without a repository', () => {
  const parseStartArgs = exportedFunction('parseStartArgs');

  assert.deepEqual(parseStartArgs(['--blackbox', '-u', 'https://target.example', '-c', 'target.yaml']), {
    url: 'https://target.example',
    config: 'target.yaml',
    blackbox: true,
    pipelineTesting: false,
    keepContainer: false,
    follow: false,
  });
});

test('blackbox start accepts one validation bundle directory', () => {
  const parseStartArgs = exportedFunction('parseStartArgs');

  assert.deepEqual(
    parseStartArgs([
      '--blackbox',
      '-u',
      'https://target.example',
      '-c',
      'target.yaml',
      '--validation-bundle',
      'saved comparison',
    ]),
    {
      url: 'https://target.example',
      config: 'target.yaml',
      validationBundle: 'saved comparison',
      blackbox: true,
      pipelineTesting: false,
      keepContainer: false,
      follow: false,
    },
  );
});

test('blackbox and whitebox start modes reject contradictory inputs', () => {
  const parseStartArgs = exportedFunction('parseStartArgs');

  assert.throws(
    () => parseStartArgs(['--blackbox', '-u', 'https://target.example', '-r', './repo', '-c', 'target.yaml']),
    /--repo is not allowed with --blackbox/,
  );
  assert.throws(
    () => parseStartArgs(['--blackbox', '-u', 'https://target.example']),
    /--config is required with --blackbox/,
  );
  assert.throws(
    () =>
      parseStartArgs([
        '-u',
        'https://target.example',
        '-r',
        './repo',
        '--validation-bundle',
        'saved-comparison',
      ]),
    /--validation-bundle is only allowed with --blackbox/,
  );
  assert.throws(
    () => parseStartArgs(['-u', 'https://target.example']),
    /--repo is required unless --blackbox is set/,
  );
  assert.throws(
    () =>
      parseStartArgs([
        '--blackbox',
        '-u',
        'https://target.example',
        '-c',
        'target.yaml',
        '-w',
        '../scan-two',
      ]),
    /invalid --workspace/i,
  );
  assert.equal(parseStartArgs(['-u', 'https://target.example', '-r', './repo']).repo, './repo');
});

test('validation bundle preprocessing is isolated from the scan container', () => {
  const buildValidationBundleDockerArgs = exportedFunction('buildValidationBundleDockerArgs');
  const bundlePath = 'C:\\evidence\\saved comparison';
  const uid = process.getuid?.() ?? 1001;
  const gid = process.getgid?.() ?? 1001;

  assert.deepEqual(buildValidationBundleDockerArgs({ version: 'test-version', bundlePath }), [
    'run',
    '--rm',
    '--network',
    'none',
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '-v',
    `${bundlePath}:/validation-bundle:ro`,
    '--user',
    `${uid}:${gid}`,
    '--entrypoint',
    'node',
    'shannon-worker',
    'apps/worker/dist/scripts/validate-blackbox-bundle.js',
    '/validation-bundle',
  ]);
});

test('preprocessor output writes only a normalized selector under the target workspace', async (t) => {
  const writeValidationSelection = exportedFunction('writeValidationSelection');
  const root = await mkdtemp(path.join(os.tmpdir(), 'shannon-validation-selection-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const selector = validationSelector();

  const result = writeValidationSelection(root, `${JSON.stringify(selector)}\n`);

  assert.deepEqual(result, {
    hostPath: path.join(root, '.shannon', 'blackbox', 'validation-selection.json'),
    containerPath: '/target/.shannon/blackbox/validation-selection.json',
    selectionDigest: selector.selectionDigest,
  });
  assert.deepEqual(await readdir(path.join(root, '.shannon', 'blackbox')), ['validation-selection.json']);
  assert.equal(await readFile(result.hostPath, 'utf8'), `${JSON.stringify(selector, null, 2)}\n`);
});

test('preprocessor output must be exactly one valid normalized selector', async (t) => {
  const writeValidationSelection = exportedFunction('writeValidationSelection');
  const root = await mkdtemp(path.join(os.tmpdir(), 'shannon-invalid-validation-selection-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  for (const output of [
    '',
    'null\n',
    '[]\n',
    '{}\n{}\n',
    'validator log\n{}\n',
    JSON.stringify({ ...validationSelector(), rawResponse: 'private' }),
    JSON.stringify({ ...validationSelector(), routePathPrefix: '/tampered' }),
  ]) {
    assert.throws(() => writeValidationSelection(root, output), /normalized selector/i);
  }

  await assert.rejects(readdir(path.join(root, '.shannon')), /ENOENT/);
});

test('selector writing does not follow an existing hardlink', async (t) => {
  const writeValidationSelection = exportedFunction('writeValidationSelection');
  const root = await mkdtemp(path.join(os.tmpdir(), 'shannon-linked-validation-selection-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const targetRoot = path.join(root, 'target');
  const selectorPath = path.join(targetRoot, '.shannon', 'blackbox', 'validation-selection.json');
  const outside = path.join(root, 'outside.txt');
  await mkdir(path.dirname(selectorPath), { recursive: true });
  await writeFile(outside, 'preserve-outside');
  await link(outside, selectorPath);

  const selector = validationSelector();
  writeValidationSelection(targetRoot, JSON.stringify(selector));

  assert.equal(await readFile(outside, 'utf8'), 'preserve-outside');
  assert.equal(await readFile(selectorPath, 'utf8'), `${JSON.stringify(selector, null, 2)}\n`);
});

test('Burp environment variables are forwarded by name only when present', () => {
  const buildEnvFlags = exportedFunction('buildEnvFlags');
  process.env.SHANNON_BURP_MCP_URL = 'http://host.docker.internal:9876/sse';
  process.env.SHANNON_BURP_MCP_HOST_HEADER = '127.0.0.1:9876';
  process.env.SHANNON_BURP_PROXY_URL = 'http://host.docker.internal:18080';

  const flags = buildEnvFlags();
  for (const name of ['SHANNON_BURP_MCP_URL', 'SHANNON_BURP_MCP_HOST_HEADER', 'SHANNON_BURP_PROXY_URL']) {
    assert.equal(flags.includes(name), true);
  }
  assert.equal(flags.some((value) => value.includes('host.docker.internal')), false);

  delete process.env.SHANNON_BURP_PROXY_URL;
  assert.equal(buildEnvFlags().includes('SHANNON_BURP_PROXY_URL'), false);
});

test('blackbox Docker args mount only the selected run, synthetic target, config, and auth file', () => {
  const buildWorkerDockerArgs = exportedFunction('buildWorkerDockerArgs');
  const workspacePath = 'C:\\state\\workspaces\\scan-one';
  const workspacesDir = 'C:\\state\\workspaces';
  const targetRoot = `${workspacePath}\\.shannon\\blackbox-target`;
  const configPath = 'C:\\configs\\target.yaml';
  const piAuthPath = 'C:\\users\\tester\\.pi\\agent\\auth.json';
  const args = buildWorkerDockerArgs({
    mode: 'blackbox',
    version: 'test-version',
    url: 'https://target.example',
    targetRoot: { hostPath: targetRoot, containerPath: '/target' },
    workspacePath,
    workspacesDir,
    taskQueue: 'queue-one',
    containerName: 'worker-one',
    envFlags: ['-e', 'SHANNON_BURP_PROXY_URL'],
    config: { hostPath: configPath, containerPath: '/app/configs/target.yaml' },
    workspace: 'scan-one',
    piAuthHostPath: piAuthPath,
  });

  assert.deepEqual(mounts(args), [
    `${workspacePath}:/app/workspaces/scan-one`,
    `${targetRoot}:/target`,
    `${configPath}:/app/configs/target.yaml:ro`,
    `${piAuthPath}:/tmp/.pi/agent/auth.json`,
  ]);
  assert.equal(args.includes(`${workspacesDir}:/app/workspaces`), false);
  assert.equal(args.some((arg) => arg.includes('C:\\state\\repos') || arg.includes('scan-two')), false);
  assert.deepEqual(
    args.slice(args.indexOf('node')),
    [
      'node',
      'apps/worker/dist/temporal/worker.js',
      'https://target.example',
      '/target',
      '--blackbox',
      '--task-queue',
      'queue-one',
      '--config',
      '/app/configs/target.yaml',
      '--workspace',
      'scan-one',
    ],
  );
});

test('blackbox worker receives only the normalized validation selector contract', () => {
  const buildWorkerDockerArgs = exportedFunction('buildWorkerDockerArgs');
  const workspacePath = 'C:\\state\\workspaces\\scan-one';
  const targetRoot = `${workspacePath}\\.shannon\\blackbox-target`;
  const args = buildWorkerDockerArgs({
    mode: 'blackbox',
    version: 'test-version',
    url: 'https://target.example',
    targetRoot: { hostPath: targetRoot, containerPath: '/target' },
    workspacePath,
    workspacesDir: 'C:\\state\\workspaces',
    taskQueue: 'queue-one',
    containerName: 'worker-one',
    envFlags: [],
    config: { hostPath: 'C:\\configs\\target.yaml', containerPath: '/app/configs/target.yaml' },
    workspace: 'scan-one',
    validationSelectionPath: '/target/.shannon/blackbox/validation-selection.json',
    validationSelectionDigest: 'a'.repeat(64),
  });

  assert.deepEqual(mounts(args), [
    `${workspacePath}:/app/workspaces/scan-one`,
    `${targetRoot}:/target`,
    'C:\\configs\\target.yaml:/app/configs/target.yaml:ro',
  ]);
  assert.deepEqual(
    args.slice(args.indexOf('--validation-selection'), args.indexOf('--validation-selection') + 2),
    ['--validation-selection', '/target/.shannon/blackbox/validation-selection.json'],
  );
  assert.deepEqual(
    args.slice(args.indexOf('--validation-selection-digest'), args.indexOf('--validation-selection-digest') + 2),
    ['--validation-selection-digest', 'a'.repeat(64)],
  );
  assert.equal(args.some((argument) => argument.includes('saved comparison') || argument.includes('validation-bundle')), false);
});

test('blackbox worker requires an out-of-band digest with the selector path', () => {
  const buildWorkerDockerArgs = exportedFunction('buildWorkerDockerArgs');
  const base = {
    mode: 'blackbox',
    version: 'test-version',
    url: 'https://target.example',
    targetRoot: { hostPath: 'C:\\target', containerPath: '/target' },
    workspacePath: 'C:\\state\\workspaces\\scan-one',
    workspacesDir: 'C:\\state\\workspaces',
    taskQueue: 'queue-one',
    containerName: 'worker-one',
    envFlags: [],
    config: { hostPath: 'C:\\configs\\target.yaml', containerPath: '/app/configs/target.yaml' },
    workspace: 'scan-one',
  };

  assert.throws(
    () => buildWorkerDockerArgs({ ...base, validationSelectionPath: '/target/.shannon/blackbox/validation-selection.json' }),
    /path and digest.*together/i,
  );
  assert.throws(
    () => buildWorkerDockerArgs({ ...base, validationSelectionDigest: 'a'.repeat(64) }),
    /path and digest.*together/i,
  );
});

function legacyPlatformArgs() {
  const args = [];
  if (os.platform() === 'linux') {
    try {
      execFileSync('which', ['podman'], { stdio: 'pipe' });
    } catch {
      args.push('--add-host', 'host.docker.internal:host-gateway');
    }
    if (process.getuid && process.getgid) {
      args.push('-e', `SHANNON_HOST_UID=${process.getuid()}`, '-e', `SHANNON_HOST_GID=${process.getgid()}`);
    }
  }
  return args;
}

test('whitebox Docker args preserve the existing argument vector', () => {
  const buildWorkerDockerArgs = exportedFunction('buildWorkerDockerArgs');
  const opts = {
    mode: 'whitebox',
    version: 'test-version',
    url: 'https://target.example',
    repo: { hostPath: 'C:\\repos\\target', containerPath: '/repos/target' },
    workspacePath: 'C:\\state\\workspaces\\scan-one',
    workspacesDir: 'C:\\state\\workspaces',
    taskQueue: 'queue-one',
    containerName: 'worker-one',
    envFlags: ['-e', 'SHANNON_AI_MODEL'],
    config: { hostPath: 'C:\\configs\\target.yaml', containerPath: '/app/configs/target.yaml' },
    promptsDir: 'C:\\shannon\\apps\\worker\\prompts',
    outputDir: 'C:\\reports',
    workspace: 'scan-one',
    pipelineTesting: true,
    piAuthHostPath: 'C:\\users\\tester\\.pi\\agent\\auth.json',
  };
  const internalPath = path.join(opts.workspacesDir, opts.workspace, '.shannon');
  const expected = [
    'run',
    '-d',
    '--rm',
    '--name',
    opts.containerName,
    '--network',
    'shannon-net',
    '--label',
    `shannon.workspace=${opts.workspace}`,
    ...legacyPlatformArgs(),
    '-v',
    `${opts.workspacesDir}:/app/workspaces`,
    '-v',
    `${opts.repo.hostPath}:${opts.repo.containerPath}:ro`,
    '-v',
    `${path.join(internalPath, 'deliverables')}:${opts.repo.containerPath}/.shannon/deliverables`,
    '-v',
    `${path.join(internalPath, 'scratchpad')}:${opts.repo.containerPath}/.shannon/scratchpad`,
    '-v',
    `${path.join(internalPath, '.playwright-cli')}:${opts.repo.containerPath}/.shannon/.playwright-cli`,
    '-v',
    `${path.join(internalPath, '.playwright')}:${opts.repo.containerPath}/.playwright`,
    '-v',
    `${opts.promptsDir}:/app/apps/worker/prompts:ro`,
    '-v',
    `${opts.config.hostPath}:${opts.config.containerPath}:ro`,
    '-v',
    `${opts.outputDir}:/app/output`,
    '-v',
    `${opts.piAuthHostPath}:/tmp/.pi/agent/auth.json`,
    ...opts.envFlags,
    '--shm-size',
    '2gb',
    '--security-opt',
    'seccomp=unconfined',
    'shannon-worker',
    'node',
    'apps/worker/dist/temporal/worker.js',
    opts.url,
    opts.repo.containerPath,
    '--task-queue',
    opts.taskQueue,
    '--config',
    opts.config.containerPath,
    '--output',
    '/app/output',
    '--workspace',
    opts.workspace,
    '--pipeline-testing',
  ];

  assert.deepEqual(buildWorkerDockerArgs(opts), expected);
});

test('status rendering handles black-box progress and terminal results without a white-box cast', () => {
  const renderStatusFrame = exportedFunction('renderStatusFrame');
  const toStatusJson = exportedFunction('toStatusJson');
  const isFailedScanState = exportedFunction('isFailedScanState');
  const progress = {
    mode: 'blackbox',
    status: 'running',
    wave: 2,
    revision: 9,
    tasks: [
      { taskId: 'recon-1', status: 'completed', identityLease: 'attacker' },
      { taskId: 'analysis-1', status: 'running', identityLease: null },
    ],
    identityLeases: [],
  };
  const runningInput = {
    workspace: 'scan-one',
    workflowId: 'workflow-one',
    temporalStatus: 'RUNNING',
    state: progress,
    running: [],
    startedAt: 1_000,
  };

  const frame = renderStatusFrame(runningInput, {
    now: 3_000,
    color: false,
    unicode: false,
    live: false,
    frame: 0,
  });
  assert.match(frame, /black-box authorization/i);
  assert.match(frame, /wave:\s*2/i);
  assert.match(frame, /1\/2 completed/i);

  const terminalInput = {
    ...runningInput,
    temporalStatus: 'COMPLETED',
    endedAt: 4_000,
    state: {
      mode: 'blackbox',
      status: 'findings',
      revision: 12,
      findingCount: 2,
      artifactNames: [
        'traffic_inventory.json',
        'blackbox_blackboard.json',
        'blackbox_authz_findings.json',
        'blackbox_authz_evidence.md',
      ],
      failures: [],
    },
  };
  assert.match(renderStatusFrame(terminalInput, {
    now: 4_000,
    color: false,
    unicode: false,
    live: false,
    frame: 0,
  }), /2 replay-verified findings/i);
  assert.deepEqual(toStatusJson(terminalInput, 4_000).blackbox, {
    revision: 12,
    status: 'findings',
    findingCount: 2,
    failures: [],
  });
  assert.deepEqual(toStatusJson(terminalInput, 4_000).phases, []);
  assert.equal(isFailedScanState(terminalInput.state), false);
  assert.equal(isFailedScanState({ ...terminalInput.state, status: 'incomplete' }), true);
});
