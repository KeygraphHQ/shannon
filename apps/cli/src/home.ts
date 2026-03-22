/**
 * Shannon state directory management.
 *
 * Local mode (cloned repo): uses ./workspaces/, ./credentials/
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
 * Resolve the Vertex credentials file path.
 *
 * Checks GOOGLE_APPLICATION_CREDENTIALS env var first (may be set by TOML resolver),
 * then falls back to mode-appropriate default location.
 */
export function getCredentialsPath(): string {
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (envPath && fs.existsSync(envPath)) return path.resolve(envPath);

  if (getMode() === 'local') {
    return path.resolve('credentials', 'google-sa-key.json');
  }

  return path.join(SHANNON_HOME, 'google-sa-key.json');
}

/**
 * Initialize state directories.
 * Local mode: creates ./workspaces/ and ./credentials/
 * NPX mode: creates ~/.shannon/workspaces/
 */
export function initHome(): void {
  if (getMode() === 'local') {
    fs.mkdirSync(path.resolve('workspaces'), { recursive: true });
    fs.mkdirSync(path.resolve('credentials'), { recursive: true });
  } else {
    fs.mkdirSync(path.join(SHANNON_HOME, 'workspaces'), { recursive: true });
  }
}
