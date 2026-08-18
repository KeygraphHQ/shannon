/**
 * Runtime mode detection — local (build from source) vs npx (Docker Hub).
 *
 * The root `./shannon` entry point sets SHANNON_LOCAL=1 before importing.
 * When run via npx, `cli/dist/index.js` is executed directly without it.
 */

export type Mode = 'local' | 'npx';

let cachedMode: Mode | undefined;

export function getMode(): Mode {
  if (cachedMode !== undefined) return cachedMode;

  cachedMode = process.env.SHANNON_LOCAL === '1' ? 'local' : 'npx';
  return cachedMode;
}

export function setMode(mode: Mode): void {
  cachedMode = mode;
}

export function isLocal(): boolean {
  return getMode() === 'local';
}

/** The invocation prefix for the current mode, so help and hints point at a runnable command. */
export function commandPrefix(): string {
  return getMode() === 'local' ? './shannon' : 'npx @keygraph/shannon';
}

export function isDevMode(): boolean {
  return process.env.SHANNON_DEV === '1';
}
