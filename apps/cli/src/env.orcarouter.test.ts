/**
 * OrcaRouter at the CLI boundary.
 *
 * The worker tests prove the provider works; this proves the CLI in front of it accepts
 * both entry points and forwards the right things into the scan container. The forwarding
 * is the part that fails silently in production: a credential the CLI never forwards is a
 * provider the worker reports as unconfigured, with nothing in the CLI to suggest why.
 */

import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { credentialStorePath } from './commands/connect.js';
import { upsertEnvFile } from './config/writer.js';
import { buildEnvFlags, hasExportedCredentials, loadEnv, validateCredentials } from './env.js';
import { setMode } from './mode.js';

const FAKE_KEY = 'sk-orca-cli-test-000000000000';

/** Environment variables these tests touch, so each case starts from a known state. */
const MANAGED = [
  'SHANNON_LOCAL',
  'SHANNON_AI_MODEL',
  'SHANNON_AI_BASE_URL',
  'SHANNON_AI_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'XAI_API_KEY',
  'AWS_BEARER_TOKEN_BEDROCK',
  'AWS_REGION',
  'ORCAROUTER_API_KEY',
  'ORCA_API_KEY',
  'ORCA_KEY',
  'ORCAROUTER_AUTH_METHOD',
  'ORCA_BASE_URL',
  'ORCA_AUTH_BASE_URL',
  'ORCA_API_BASE_URL',
] as const;

describe('OrcaRouter credential validation', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const name of MANAGED) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
    process.env.SHANNON_AI_MODEL = 'orcarouter:openai/gpt-5.5';
  });

  afterEach(() => {
    for (const name of MANAGED) {
      const value = saved[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('accepts a key supplied under the provider-specific variable', () => {
    process.env.ORCAROUTER_API_KEY = FAKE_KEY;
    expect(validateCredentials()).toEqual({ valid: true });
  });

  it('accepts a key supplied under the shorthand aliases', () => {
    process.env.ORCA_API_KEY = FAKE_KEY;
    expect(validateCredentials().valid).toBe(true);

    delete process.env.ORCA_API_KEY;
    process.env.ORCA_KEY = FAKE_KEY;
    expect(validateCredentials().valid).toBe(true);
  });

  it('reports a missing credential with the command that fixes it', () => {
    const result = validateCredentials();

    expect(result.valid).toBe(false);
    expect(result.error).toContain('orcarouter');
    expect(result.error).toContain('connect');
  });

  it('counts a configured OrcaRouter credential as an exported one', () => {
    expect(hasExportedCredentials()).toBe(false);
    process.env.ORCAROUTER_API_KEY = FAKE_KEY;
    expect(hasExportedCredentials()).toBe(true);
  });

  it('does not require a browser or a second credential for the API-key path', () => {
    process.env.ORCAROUTER_API_KEY = FAKE_KEY;
    // No OAuth state, no connect marker: the key alone is a complete configuration.
    expect(process.env.ORCAROUTER_AUTH_METHOD).toBeUndefined();
    expect(validateCredentials()).toEqual({ valid: true });
  });
});

describe('forwarding into the scan container', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const name of MANAGED) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
    process.env.SHANNON_AI_MODEL = 'orcarouter:openai/gpt-5.5';
  });

  afterEach(() => {
    for (const name of MANAGED) {
      const value = saved[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('forwards the OrcaRouter key for an OrcaRouter run', () => {
    process.env.ORCAROUTER_API_KEY = FAKE_KEY;
    expect(buildEnvFlags()).toContain('ORCAROUTER_API_KEY');
  });

  it('forwards an alias the user exported, so the worker can adopt it', () => {
    process.env.ORCA_KEY = FAKE_KEY;
    expect(buildEnvFlags()).toContain('ORCA_KEY');
  });

  it('forwards which entry point produced the credential', () => {
    process.env.ORCAROUTER_API_KEY = FAKE_KEY;
    process.env.ORCAROUTER_AUTH_METHOD = 'pkce';
    expect(buildEnvFlags()).toContain('ORCAROUTER_AUTH_METHOD');
  });

  it('forwards an explicit origin override so the worker contacts the same origins', () => {
    process.env.ORCAROUTER_API_KEY = FAKE_KEY;
    process.env.ORCA_BASE_URL = 'https://orca.internal.example';
    expect(buildEnvFlags()).toContain('ORCA_BASE_URL');
  });

  it('keeps an OrcaRouter key out of a run that selected another provider', () => {
    process.env.SHANNON_AI_MODEL = 'anthropic:claude-sonnet-4-6';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-example';
    process.env.ORCAROUTER_API_KEY = FAKE_KEY;

    const flags = buildEnvFlags();
    expect(flags).toContain('ANTHROPIC_API_KEY');
    // One provider per scan: the other provider's credential stays on the host.
    expect(flags).not.toContain('ORCAROUTER_API_KEY');
  });

  it('passes the credential by name rather than by value', () => {
    process.env.ORCAROUTER_API_KEY = FAKE_KEY;
    // Docker inherits the value from this process's environment, so the key never appears
    // in the `docker run` argv where `ps` could read it.
    expect(buildEnvFlags()).not.toContain(FAKE_KEY);
  });
});

/**
 * Where a connected key lands.
 *
 * A credential written to a file the running mode never reads is the failure mode this
 * covers: `connect` would report success and the next scan would report no credential.
 * Both modes are exercised, and the local one is checked by reading the file back through
 * the same resolver a scan uses rather than by inspecting the file alone.
 */
describe('where a connected credential is stored', () => {
  let dir: string;
  let savedCwd: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'shannon-orca-'));
    savedCwd = process.cwd();
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(savedCwd);
    setMode(process.env.SHANNON_LOCAL === '1' ? 'local' : 'npx');
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes to ./.env in local mode, so the mode that reads .env finds the key', () => {
    process.env.SHANNON_LOCAL = '1';
    setMode('local');

    expect(credentialStorePath()).toBe(path.join(dir, '.env'));

    upsertEnvFile(credentialStorePath(), {
      ORCAROUTER_API_KEY: FAKE_KEY,
      ORCAROUTER_AUTH_METHOD: 'pkce',
      SHANNON_AI_MODEL: 'orcarouter:openai/gpt-5.5',
    });

    delete process.env.ORCAROUTER_API_KEY;
    delete process.env.SHANNON_AI_MODEL;
    loadEnv();

    // The resolver the scan uses must see exactly what connect wrote.
    expect(process.env.ORCAROUTER_API_KEY).toBe(FAKE_KEY);
    expect(process.env.SHANNON_AI_MODEL).toBe('orcarouter:openai/gpt-5.5');
    expect(validateCredentials()).toEqual({ valid: true });
  });

  it('targets ~/.shannon/config.toml in npx mode', () => {
    delete process.env.SHANNON_LOCAL;
    setMode('npx');

    expect(credentialStorePath()).toContain(path.join('.shannon', 'config.toml'));
    expect(credentialStorePath()).not.toBe(path.join(dir, '.env'));
  });

  it('writes the file owner-only, like every other credential file', () => {
    const envPath = path.join(dir, '.env');
    upsertEnvFile(envPath, { ORCAROUTER_API_KEY: FAKE_KEY });
    expect(statSync(envPath).mode & 0o777).toBe(0o600);
  });

  it('preserves unrelated lines and replaces a key that was already there', () => {
    const envPath = path.join(dir, '.env');
    writeFileSync(envPath, '# my notes\nANTHROPIC_API_KEY=sk-ant-keep-me\n\nORCAROUTER_API_KEY=sk-orca-old\n', 'utf8');

    upsertEnvFile(envPath, { ORCAROUTER_API_KEY: FAKE_KEY, ORCAROUTER_AUTH_METHOD: 'pkce' });
    const written = readFileSync(envPath, 'utf8');

    // A connect must not reformat a file the user also keeps other credentials in, and a
    // re-connect must not leave two definitions of the same variable behind.
    expect(written).toContain('# my notes');
    expect(written).toContain('ANTHROPIC_API_KEY=sk-ant-keep-me');
    expect(written).not.toContain('sk-orca-old');
    expect(written.match(/^ORCAROUTER_API_KEY=/gm)).toHaveLength(1);
    expect(written).toContain('ORCAROUTER_AUTH_METHOD=pkce');
  });

  it('creates the file when there is none', () => {
    const envPath = path.join(dir, 'nested', '.env');
    upsertEnvFile(envPath, { ORCAROUTER_API_KEY: FAKE_KEY });
    expect(readFileSync(envPath, 'utf8')).toBe(`ORCAROUTER_API_KEY=${FAKE_KEY}\n`);
  });
});
