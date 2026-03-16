/**
 * `shannon workspaces` command — list all workspaces.
 */

import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { getWorkerImage } from '../docker.js';
import { getWorkspacesDir } from '../home.js';

export function workspaces(version: string): void {
  const workspacesDir = getWorkspacesDir();
  const image = getWorkerImage(version);

  try {
    execFileSync(
      'docker',
      [
        'run',
        '--rm',
        '-v',
        `${workspacesDir}:/app/workspaces`,
        '-e',
        'WORKSPACES_DIR=/app/workspaces',
        image,
        'node',
        'apps/worker/dist/temporal/workspaces.js',
      ],
      { stdio: 'inherit', ...(os.platform() === 'win32' && { env: { ...process.env, MSYS_NO_PATHCONV: '1' } }) },
    );
  } catch {
    console.error('ERROR: Failed to list workspaces. Is the Docker image available?');
    console.error(`  Run: docker pull ${image}`);
    process.exit(1);
  }
}
