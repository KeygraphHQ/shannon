import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parseConfig } from './config-parser.js';

// Create a temp directory for test config files
const testDir = join(tmpdir(), `shannon-config-test-${Date.now()}`);

function writeTestConfig(filename: string, content: string): string {
  mkdirSync(testDir, { recursive: true });
  const filepath = join(testDir, filename);
  writeFileSync(filepath, content, 'utf8');
  return filepath;
}

// Cleanup after tests
import { afterAll } from 'vitest';
afterAll(() => {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

describe('parseConfig - prototype pollution prevention', () => {
  it('rejects YAML containing __proto__ key at top level', async () => {
    const configPath = writeTestConfig('proto-top.yaml', `
__proto__:
  polluted: true
rules:
  avoid: []
`);
    await expect(parseConfig(configPath)).rejects.toThrow('forbidden key');
  });

  it('rejects YAML containing __proto__ key in nested object', async () => {
    const configPath = writeTestConfig('proto-nested.yaml', `
authentication:
  login_type: form
  login_url: "https://example.com/login"
  credentials:
    username: admin
    password: pass
    __proto__:
      isAdmin: true
  login_flow:
    - "Navigate to login page"
  success_condition:
    type: url
    value: "/dashboard"
`);
    await expect(parseConfig(configPath)).rejects.toThrow('forbidden key');
  });

  it('rejects YAML containing constructor key', async () => {
    const configPath = writeTestConfig('constructor.yaml', `
constructor:
  prototype:
    polluted: true
`);
    await expect(parseConfig(configPath)).rejects.toThrow('forbidden key');
  });

  it('rejects YAML containing prototype key', async () => {
    const configPath = writeTestConfig('prototype.yaml', `
prototype:
  isAdmin: true
`);
    await expect(parseConfig(configPath)).rejects.toThrow('forbidden key');
  });

  it('accepts valid config without forbidden keys', async () => {
    const configPath = writeTestConfig('valid.yaml', `
rules:
  avoid:
    - description: "Do not test admin panel"
      type: path
      url_path: "/admin"
`);
    const config = await parseConfig(configPath);
    expect(config).toBeDefined();
    expect(config.rules?.avoid).toHaveLength(1);
  });
});
