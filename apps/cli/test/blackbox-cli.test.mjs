import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
