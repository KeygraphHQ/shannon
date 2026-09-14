import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ToolAdapter, ToolRunResult } from '../tools/registry.js';
import { ToolRegistry } from '../tools/registry.js';
import type { ToolCapability } from '../types.js';
import { buildLiveBootstrapSources, reconSourceFromToolAdapter } from './live-bootstrap-sources.js';

class FakeAdapter implements ToolAdapter<{ readonly domain: string }> {
  readonly kind = 'passive-recon' as const;
  readonly scopeRequirement = 'passive-only' as const;
  readonly requiresAuthorization = false;
  readonly cost = 0.1;
  readonly risk = 'none' as const;
  readonly timeoutMs = 1000;
  constructor(
    readonly name: string,
    private readonly cap: ToolCapability = { available: true, reason: 'ok', version: undefined },
    private readonly result: ToolRunResult = {
      ok: true,
      summary: 'ran',
      discoveries: [
        { source: name, kind: 'host', label: `${name}.example.com`, attributes: {}, confidence: 0.6, discoveredAt: '' },
      ],
      observations: [],
      raw: undefined,
    },
  ) {}
  capability(): Promise<ToolCapability> {
    return Promise.resolve(this.cap);
  }
  run(): Promise<ToolRunResult> {
    return Promise.resolve(this.result);
  }
}

test("reconSourceFromToolAdapter delegates isAvailable to the adapter's real capability check", async () => {
  const unavailable = new FakeAdapter('x', { available: false, reason: 'not installed', version: undefined });
  const source = reconSourceFromToolAdapter('x', unavailable, () => ({ domain: 'example.com' }));
  assert.equal(await source.isAvailable(), false);
});

test("reconSourceFromToolAdapter's discover() returns the adapter's discoveries", async () => {
  const adapter = new FakeAdapter('subfinder');
  const source = reconSourceFromToolAdapter('subfinder', adapter, () => ({ domain: 'example.com' }));
  const discoveries = await source.discover();
  assert.equal(discoveries.length, 1);
  assert.equal(discoveries[0]?.label, 'subfinder.example.com');
});

test('buildLiveBootstrapSources only wraps adapters that are actually registered', () => {
  const registry = new ToolRegistry();
  registry.register(new FakeAdapter('subfinder'));
  const { passiveSources, activeSources } = buildLiveBootstrapSources(registry, 'example.com', 'https://example.com');
  assert.deepEqual(
    passiveSources.map((s) => s.name),
    ['subfinder'],
  );
  assert.equal(activeSources.length, 0);
});

test('buildLiveBootstrapSources includes amass only when an output directory is configured', () => {
  const registry = new ToolRegistry();
  registry.register(new FakeAdapter('amass'));

  const withoutDir = buildLiveBootstrapSources(registry, 'example.com', 'https://example.com');
  assert.equal(
    withoutDir.passiveSources.some((s) => s.name === 'amass'),
    false,
  );

  const withDir = buildLiveBootstrapSources(registry, 'example.com', 'https://example.com', {
    amassOutputDir: '/tmp/amass',
  });
  assert.equal(
    withDir.passiveSources.some((s) => s.name === 'amass'),
    true,
  );
});

test("buildLiveBootstrapSources never wraps ffuf or nuclei — those stay investigation-only, through the round loop's own gate chain", () => {
  const registry = new ToolRegistry();
  registry.register(new FakeAdapter('ffuf'));
  registry.register(new FakeAdapter('nuclei'));
  const { passiveSources, activeSources } = buildLiveBootstrapSources(registry, 'example.com', 'https://example.com');
  assert.equal(passiveSources.length, 0);
  assert.equal(activeSources.length, 0);
});

test('a genuinely full registry produces passive certificate-transparency/subfinder/chaos/gau/waybackurls and active httpx/katana/naabu', () => {
  const registry = new ToolRegistry();
  for (const name of [
    'certificate-transparency',
    'subfinder',
    'chaos',
    'gau',
    'waybackurls',
    'httpx',
    'katana',
    'naabu',
  ]) {
    registry.register(new FakeAdapter(name));
  }
  const { passiveSources, activeSources } = buildLiveBootstrapSources(registry, 'example.com', 'https://example.com');
  assert.deepEqual(
    passiveSources.map((s) => s.name).sort(),
    ['certificate-transparency', 'chaos', 'gau', 'subfinder', 'waybackurls'].sort(),
  );
  assert.deepEqual(activeSources.map((s) => s.name).sort(), ['httpx', 'katana', 'naabu'].sort());
});
