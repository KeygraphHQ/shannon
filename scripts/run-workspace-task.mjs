#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const task = process.argv[2];
const cleanCommand = [process.execPath, ['-e', "import('node:fs').then(fs => fs.rmSync('dist', { recursive: true, force: true }))"]];
const workspaceTasks = [
  {
    name: 'worker',
    dir: 'apps/worker',
    commands: {
      build: [process.execPath, [path.resolve('node_modules/typescript/bin/tsc')]],
      check: [process.execPath, [path.resolve('node_modules/typescript/bin/tsc'), '--noEmit']],
      clean: cleanCommand,
    },
  },
  {
    name: 'cli',
    dir: 'apps/cli',
    commands: {
      build: [process.execPath, [path.resolve('apps/cli/node_modules/tsdown/dist/run.mjs')]],
      check: [process.execPath, [path.resolve('node_modules/typescript/bin/tsc'), '--noEmit']],
      clean: cleanCommand,
    },
  },
];

if (!task) {
  console.error('Usage: node scripts/run-workspace-task.mjs <build|check|clean>');
  process.exit(1);
}

for (const workspace of workspaceTasks) {
  const cwd = path.resolve(workspace.dir);
  const command = workspace.commands[task];
  if (!command) {
    console.error(`Unsupported task: ${task}`);
    process.exit(1);
  }

  console.log(`\n> ${workspace.name}:${task}`);

  const [cmd, args] = command;
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
