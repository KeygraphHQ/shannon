import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ToolRegistry } from './registry.js';
import { ShannonAdapter } from './shannon-adapter.js';

test('registers and retrieves a tool adapter by name', () => {
  const registry = new ToolRegistry();
  registry.register(new ShannonAdapter());
  assert.deepEqual(registry.list(), ['shannon']);
  assert.equal(registry.get('shannon')?.name, 'shannon');
  assert.equal(registry.get('nuclei'), undefined);
});

test('ShannonAdapter run() only plans an invocation, never executes it', async () => {
  const adapter = new ShannonAdapter();
  const result = await adapter.run({ url: 'https://app.example.com', repo: '/repo/app' });
  assert.equal(result.ok, true);
  assert.match(result.summary, /dry-run/);
  assert.match(result.summary, /npx @keygraph\/shannon@1\.9\.0 start/);
});

test('ShannonAdapter surfaces invalid input as a non-ok result rather than throwing', async () => {
  const adapter = new ShannonAdapter();
  const result = await adapter.run({ url: 'not-a-url', repo: '/repo/app' });
  assert.equal(result.ok, false);
});

test('ShannonAdapter reports itself capable — the CLI mechanism needs no local install', async () => {
  const adapter = new ShannonAdapter();
  const capability = await adapter.capability();
  assert.equal(capability.available, true);
});

test('byKind filters registered adapters by their action kind', () => {
  const registry = new ToolRegistry();
  registry.register(new ShannonAdapter());
  assert.equal(registry.byKind('shannon').length, 1);
  assert.equal(registry.byKind('active-recon').length, 0);
});

test('firstAvailable returns the first capable adapter among preferred names, or undefined', async () => {
  const registry = new ToolRegistry();
  registry.register(new ShannonAdapter());
  const found = await registry.firstAvailable('shannon', ['does-not-exist', 'shannon']);
  assert.equal(found?.name, 'shannon');
  assert.equal(await registry.firstAvailable('active-recon', ['shannon']), undefined);
});
