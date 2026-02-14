/**
 * Docker Bridge
 *
 * Checks Docker availability, detects Podman vs Docker,
 * and manages container lifecycle for Shannon infrastructure.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import type { PathResolver } from './path-resolver.js';

const execFileAsync = promisify(execFile);

export interface DockerStatus {
  available: boolean;
  isPodman: boolean;
  containersRunning: boolean;
  temporalHealthy: boolean;
}

/**
 * Check if Docker (or Podman) is available on the system.
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    await execFileAsync('docker', ['info'], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Podman is available (for compose file selection).
 */
export async function isPodman(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('podman', ['--version'], { timeout: 5_000 });
    return stdout.includes('podman');
  } catch {
    return false;
  }
}

/**
 * Build the docker compose command arguments.
 * Mirrors the COMPOSE_FILE / COMPOSE_OVERRIDE logic from the shannon CLI.
 */
export async function getComposeArgs(paths: PathResolver): Promise<string[]> {
  const args = ['-f', paths.composeFile];

  // Only add the Docker override if NOT using Podman
  const podman = await isPodman();
  if (!podman) {
    const dockerOverride = paths.composeFile.replace(
      'docker-compose.yml',
      'docker-compose.docker.yml'
    );
    try {
      const { readFile } = await import('fs/promises');
      await readFile(dockerOverride);
      args.push('-f', dockerOverride);
    } catch {
      // Override file doesn't exist, skip
    }
  }

  return args;
}

/**
 * Check if Shannon containers are running and Temporal is healthy.
 */
export async function getDockerStatus(paths: PathResolver): Promise<DockerStatus> {
  const available = await isDockerAvailable();
  if (!available) {
    return {
      available: false,
      isPodman: false,
      containersRunning: false,
      temporalHealthy: false,
    };
  }

  const podman = await isPodman();
  const composeArgs = await getComposeArgs(paths);

  // Check if containers are running
  let containersRunning = false;
  try {
    const { stdout } = await execFileAsync(
      'docker',
      ['compose', ...composeArgs, 'ps', '--format', 'json'],
      { timeout: 10_000, cwd: paths.shannonRoot }
    );
    containersRunning = stdout.trim().length > 0;
  } catch {
    containersRunning = false;
  }

  // Check Temporal health
  let temporalHealthy = false;
  if (containersRunning) {
    try {
      const { stdout } = await execFileAsync(
        'docker',
        [
          'compose', ...composeArgs,
          'exec', '-T', 'temporal',
          'temporal', 'operator', 'cluster', 'health',
          '--address', 'localhost:7233',
        ],
        { timeout: 10_000, cwd: paths.shannonRoot }
      );
      temporalHealthy = stdout.includes('SERVING');
    } catch {
      temporalHealthy = false;
    }
  }

  return {
    available,
    isPodman: podman,
    containersRunning,
    temporalHealthy,
  };
}

/**
 * Start Shannon containers (docker compose up -d).
 * Mirrors ensure_containers() from the shannon CLI.
 */
export async function ensureContainers(paths: PathResolver): Promise<void> {
  const composeArgs = await getComposeArgs(paths);

  await execFileAsync(
    'docker',
    ['compose', ...composeArgs, 'up', '-d', '--build'],
    { timeout: 300_000, cwd: paths.shannonRoot }
  );

  // Wait for Temporal to be healthy (up to 60 seconds)
  for (let i = 0; i < 30; i++) {
    try {
      const { stdout } = await execFileAsync(
        'docker',
        [
          'compose', ...composeArgs,
          'exec', '-T', 'temporal',
          'temporal', 'operator', 'cluster', 'health',
          '--address', 'localhost:7233',
        ],
        { timeout: 10_000, cwd: paths.shannonRoot }
      );
      if (stdout.includes('SERVING')) {
        return;
      }
    } catch {
      // Not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error('Timeout waiting for Temporal to become healthy after 60 seconds');
}

/**
 * Stop Shannon containers.
 */
export async function stopContainers(paths: PathResolver, clean: boolean = false): Promise<void> {
  const composeArgs = await getComposeArgs(paths);
  const downArgs = clean
    ? ['compose', ...composeArgs, '--profile', 'router', 'down', '-v']
    : ['compose', ...composeArgs, '--profile', 'router', 'down'];

  await execFileAsync('docker', downArgs, {
    timeout: 60_000,
    cwd: paths.shannonRoot,
  });
}
