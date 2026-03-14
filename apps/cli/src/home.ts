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
 * In dev mode, return the credentials directory if it exists and has files.
 * In npx mode, there is no credentials directory (single file mount instead).
 */
export function getCredentialsDir(): string | undefined {
  if (getMode() !== 'local') return undefined;

  const dir = path.resolve('credentials');
  if (!fs.existsSync(dir)) return undefined;

  const entries = fs.readdirSync(dir);
  return entries.length > 0 ? dir : undefined;
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
