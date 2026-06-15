/**
 * Shannon state directory management.
 *
 * Local mode (cloned repo): uses ./workspaces/
 * NPX mode: uses ~/.shannon/workspaces/, ~/.shannon/
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getMode } from './mode.js';

const SHANNON_HOME = path.join(os.homedir(), '.shannon');

export function getConfigFile(): string {
  return path.join(SHANNON_HOME, 'config.toml');
}

export function getWorkspacesDir(): string {
  return getMode() === 'local' ? path.resolve('workspaces') : path.join(SHANNON_HOME, 'workspaces');
}

/**
 * Initialize state directories.
 * Local mode: creates ./workspaces/
 * NPX mode: creates ~/.shannon/workspaces/
 */
export function initHome(): void {
  if (getMode() === 'local') {
    fs.mkdirSync(path.resolve('workspaces'), { recursive: true });
  } else {
    fs.mkdirSync(path.join(SHANNON_HOME, 'workspaces'), { recursive: true });
  }
}
