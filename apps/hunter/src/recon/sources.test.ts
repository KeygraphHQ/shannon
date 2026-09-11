import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { isToolInstalled, LocalFixtureReconSource, runReconSources, verifyToolIdentity } from './sources.js';

async function withTempFixture<T>(content: unknown, fn: (path: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-recon-source-test-'));
  const path = join(dir, 'fixture.json');
  await writeFile(path, JSON.stringify(content), 'utf8');
  try {
    return await fn(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('isToolInstalled returns true for a binary that certainly exists', async () => {
  assert.equal(await isToolInstalled('sh'), true);
});

test('isToolInstalled returns false for a binary that certainly does not exist, without throwing', async () => {
  assert.equal(await isToolInstalled('definitely-not-a-real-tool-xyz-123'), false);
});

test('LocalFixtureReconSource reports available and parses its fixture', async () => {
  await withTempFixture(
    [{ kind: 'host', label: 'api.example.com', confidence: 0.8, attributes: { via: 'test' } }],
    async (path) => {
      const source = new LocalFixtureReconSource('subfinder', path);
      assert.equal(await source.isAvailable(), true);
      const discoveries = await source.discover();
      assert.equal(discoveries.length, 1);
      assert.equal(discoveries[0]?.source, 'subfinder');
      assert.equal(discoveries[0]?.label, 'api.example.com');
    },
  );
});

test('LocalFixtureReconSource reports unavailable for a missing fixture file', async () => {
  const source = new LocalFixtureReconSource('amass', '/nonexistent/path/fixture.json');
  assert.equal(await source.isAvailable(), false);
});

test('LocalFixtureReconSource rejects a malformed fixture', async () => {
  await withTempFixture([{ notARealField: true }], async (path) => {
    const source = new LocalFixtureReconSource('bad-source', path);
    await assert.rejects(() => source.discover());
  });
});

test('runReconSources skips unavailable sources and concatenates the rest', async () => {
  await withTempFixture([{ kind: 'host', label: 'a.example.com', confidence: 0.5 }], async (path) => {
    const available = new LocalFixtureReconSource('subfinder', path);
    const unavailable = new LocalFixtureReconSource('amass', '/nonexistent/fixture.json');
    const discoveries = await runReconSources([available, unavailable]);
    assert.equal(discoveries.length, 1);
    assert.equal(discoveries[0]?.source, 'subfinder');
  });
});

test('verifyToolIdentity reports unavailable for a binary name that does not exist, without throwing', async () => {
  const capability = await verifyToolIdentity({
    binary: 'definitely-not-a-real-tool-xyz-123',
    versionArgs: ['-version'],
    expectedSignature: /anything/,
  });
  assert.equal(capability.available, false);
  assert.match(capability.reason, /not found on PATH/);
});

test('verifyToolIdentity rejects a real binary whose output does not match the expected tool signature', async () => {
  // "sh" exists on every POSIX box but is obviously not any recon tool.
  const capability = await verifyToolIdentity({
    binary: 'sh',
    versionArgs: ['-c', 'echo not-the-right-tool'],
    expectedSignature: /this-signature-will-never-match/,
  });
  assert.equal(capability.available, false);
  assert.match(capability.reason, /unrelated program/);
});

test('verifyToolIdentity confirms a real installed tool when both presence and signature match', async () => {
  // Only assert the positive path when the environment genuinely has the
  // tool, so this test is meaningful without being flaky across machines.
  if (!(await isToolInstalled('ffuf'))) {
    return;
  }
  const capability = await verifyToolIdentity({
    binary: 'ffuf',
    versionArgs: ['-V'],
    expectedSignature: /ffuf/i,
  });
  assert.equal(capability.available, true);
  assert.ok(capability.version);
});

test('verifyToolIdentity catches a same-named-but-different binary (e.g. Python httpx instead of ProjectDiscovery httpx)', async () => {
  if (!(await isToolInstalled('httpx'))) {
    return;
  }
  // ProjectDiscovery's httpx prints a banner containing "httpx" and a
  // version on `-version`; a same-named unrelated tool will not.
  const capability = await verifyToolIdentity({
    binary: 'httpx',
    versionArgs: ['-version'],
    expectedSignature: /projectdiscovery/i,
  });
  // This assertion documents reality rather than assuming it: on a system
  // where the installed `httpx` is not ProjectDiscovery's tool, identity
  // verification must correctly say so instead of silently proceeding.
  assert.equal(capability.available, false);
});
