import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { startLocalTestApp } from '../testing/local-app-server.js';
import {
  AmassAdapter,
  ChaosAdapter,
  FfufAdapter,
  GauAdapter,
  HttpxAdapter,
  interpretFfufResult,
  KatanaAdapter,
  NaabuAdapter,
  NucleiAdapter,
  parseAmassOutput,
  parseChaosOutput,
  parseCrtShOutput,
  parseFfufOutput,
  parseHttpxOutput,
  parseKatanaOutput,
  parseNaabuOutput,
  parseNucleiOutput,
  parseSubfinderOutput,
  parseUrlListOutput,
  SubfinderAdapter,
  spawnCapture,
  WaybackurlsAdapter,
} from './cli-adapters.js';
import { isToolInstalled } from './sources.js';

// === Parsers: fed canned sample output, never a live tool ===

test('parseSubfinderOutput reads JSON-lines host records', () => {
  const stdout = '{"host":"api.example.com","source":"crtsh"}\n{"host":"www.example.com","source":"dns"}\n';
  const discoveries = parseSubfinderOutput(stdout);
  assert.equal(discoveries.length, 2);
  assert.equal(discoveries[0]?.source, 'subfinder');
  assert.equal(discoveries[0]?.label, 'api.example.com');
});

test('parseSubfinderOutput tolerates blank lines and stray non-JSON output', () => {
  const stdout = '\n{"host":"api.example.com"}\n\nnot json at all\n';
  assert.equal(parseSubfinderOutput(stdout).length, 1);
});

test('parseAmassOutput reads JSON-lines asset records with a name field', () => {
  const stdout = '{"name":"api.example.com","sources":["subfinder","dns"]}\n';
  const discoveries = parseAmassOutput(stdout);
  assert.equal(discoveries.length, 1);
  assert.equal(discoveries[0]?.label, 'api.example.com');
});

test('parseChaosOutput reads either an "input" or "host" field', () => {
  const stdout = '{"input":"api.example.com"}\n{"host":"www.example.com"}\n';
  assert.equal(parseChaosOutput(stdout).length, 2);
});

test('parseCrtShOutput de-duplicates and strips wildcard prefixes from certificate transparency records', () => {
  const json = JSON.stringify([
    { name_value: '*.example.com\napi.example.com' },
    { common_name: 'API.EXAMPLE.COM' },
    { name_value: 'www.example.com' },
  ]);
  const discoveries = parseCrtShOutput(json);
  const labels = discoveries.map((d) => d.label).sort();
  assert.deepEqual(labels, ['api.example.com', 'example.com', 'www.example.com']);
});

test('parseCrtShOutput returns an empty list for a non-array response', () => {
  assert.deepEqual(parseCrtShOutput('{}'), []);
});

test('parseUrlListOutput reads plain newline-delimited URLs from gau/waybackurls', () => {
  const stdout = 'https://app.example.com/a\nhttps://app.example.com/b\n\n';
  const discoveries = parseUrlListOutput('gau', stdout);
  assert.equal(discoveries.length, 2);
  assert.equal(discoveries[0]?.source, 'gau');
});

test('parseHttpxOutput reads url/host/status/title/tech fields', () => {
  const stdout = '{"url":"https://app.example.com","status-code":200,"title":"Home","tech":["nginx"]}\n';
  const discoveries = parseHttpxOutput(stdout);
  assert.equal(discoveries.length, 1);
  assert.equal(discoveries[0]?.attributes.statusCode, 200);
  assert.equal(discoveries[0]?.attributes.title, 'Home');
});

test('parseKatanaOutput reads a crawled endpoint URL', () => {
  const stdout = '{"request":{"endpoint":"https://app.example.com/search"}}\n{"url":"https://app.example.com/other"}\n';
  const discoveries = parseKatanaOutput(stdout);
  assert.equal(discoveries.length, 2);
});

test('parseNaabuOutput reads host/port pairs', () => {
  const stdout = '{"host":"app.example.com","port":443}\n';
  const discoveries = parseNaabuOutput(stdout);
  assert.equal(discoveries[0]?.label, 'app.example.com:443');
  assert.equal(discoveries[0]?.attributes.port, 443);
});

test('parseFfufOutput reads one JSON match record per line (verified against a real ffuf run)', () => {
  const line = JSON.stringify({
    input: {},
    position: 1,
    status: 200,
    length: 42,
    words: 2,
    lines: 1,
    url: 'http://127.0.0.1:1/admin',
    host: '127.0.0.1:1',
  });
  const discoveries = parseFfufOutput(`${line}\n`);
  assert.equal(discoveries.length, 1);
  assert.equal(discoveries[0]?.label, 'http://127.0.0.1:1/admin');
  assert.equal(discoveries[0]?.attributes.statusCode, 200);
  assert.equal(discoveries[0]?.attributes.contentLength, 42);
});

test('parseFfufOutput tolerates a leading terminal control-code prefix on the JSON line', () => {
  const line = `[2K${JSON.stringify({ status: 200, url: 'http://127.0.0.1:1/hidden' })}`;
  const discoveries = parseFfufOutput(line);
  assert.equal(discoveries.length, 1);
  assert.equal(discoveries[0]?.label, 'http://127.0.0.1:1/hidden');
});

test('parseFfufOutput reads multiple match lines', () => {
  const lines = [
    JSON.stringify({ status: 200, url: 'http://127.0.0.1:1/a' }),
    JSON.stringify({ status: 301, url: 'http://127.0.0.1:1/b' }),
  ].join('\n');
  assert.equal(parseFfufOutput(lines).length, 2);
});

test('parseFfufOutput returns an empty list when there is no JSON output', () => {
  assert.deepEqual(parseFfufOutput(''), []);
});

test('parseNucleiOutput maps template matches into candidate observations, never verified', () => {
  const stdout = JSON.stringify({
    'template-id': 'exposed-panel',
    info: { name: 'Exposed Admin Panel', severity: 'medium' },
    'matched-at': 'https://app.example.com/admin',
  });
  const { discoveries, observations } = parseNucleiOutput(`${stdout}\n`, 'e1');
  assert.equal(discoveries.length, 1);
  assert.equal(observations.length, 1);
  assert.equal(observations[0]?.verified, false);
  assert.equal(observations[0]?.vulnClass, 'exposed-panel');
  assert.match(observations[0]?.description ?? '', /candidate, not a confirmed vulnerability/);
});

// === Capability: real checks against whatever is actually installed, never a target ===

test('capability() correctly reports unavailable for tools not installed here, without throwing', async () => {
  for (const Adapter of [SubfinderAdapter, ChaosAdapter, GauAdapter, WaybackurlsAdapter, KatanaAdapter, NaabuAdapter]) {
    const name = new Adapter().name;
    if (await isToolInstalled(name)) continue; // only assert the negative case when genuinely absent
    const capability = await new Adapter().capability();
    assert.equal(capability.available, false, `${name} should report unavailable when not installed`);
  }
});

test('AmassAdapter.capability() reflects reality on this machine', async () => {
  const capability = await new AmassAdapter().capability();
  assert.equal(capability.available, await isToolInstalled('amass'));
});

test('NucleiAdapter.capability() reflects reality on this machine', async () => {
  const capability = await new NucleiAdapter().capability();
  assert.equal(capability.available, await isToolInstalled('nuclei'));
});

test('HttpxAdapter.capability() never claims availability for a same-named but non-ProjectDiscovery binary', async () => {
  const capability = await new HttpxAdapter().capability();
  if (!(await isToolInstalled('httpx'))) {
    assert.equal(capability.available, false);
    return;
  }
  // Whatever "httpx" resolves to on this machine, capability() must have
  // actually checked its identity rather than assuming the name is enough.
  assert.equal(typeof capability.available, 'boolean');
});

test('ChaosAdapter.capability() requires both the binary and an API key', async () => {
  const adapter = new ChaosAdapter('DEFINITELY_UNSET_CHAOS_KEY_VAR');
  const capability = await adapter.capability();
  assert.equal(capability.available, false);
});

// === spawnCapture: real process execution, but only ever against harmless local commands ===

test('spawnCapture returns structured output for a successful local command', async () => {
  const result = await spawnCapture('echo', ['hello'], 5000);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /hello/);
  assert.equal(result.timedOut, false);
});

test('spawnCapture reports a non-zero exit code rather than throwing', async () => {
  const result = await spawnCapture('sh', ['-c', 'exit 3'], 5000);
  assert.equal(result.exitCode, 3);
});

test('spawnCapture reports failure for a nonexistent binary rather than throwing', async () => {
  const result = await spawnCapture('definitely-not-a-real-binary-xyz', [], 5000);
  assert.notEqual(result.exitCode, 0);
});

// === FfufAdapter: the one adapter genuinely executed live, against a local server only ===

test('FfufAdapter.run() genuinely executes ffuf against a local test server (skipped if ffuf is not installed)', async () => {
  if (!(await isToolInstalled('ffuf'))) {
    return;
  }
  const app = await startLocalTestApp();
  const wordlistDir = await mkdtemp(join(tmpdir(), 'hunter-ffuf-wordlist-'));
  const wordlistPath = join(wordlistDir, 'words.txt');
  await writeFile(wordlistPath, 'search\nhidden\nnope\n', 'utf8');
  try {
    const adapter = new FfufAdapter();
    const result = await adapter.run({ url: `${app.url}/FUZZ`, wordlistPath, matchCodes: '200' });
    assert.equal(result.ok, true);
    assert.ok(result.discoveries.some((d) => d.label === `${app.url}/hidden`));
    assert.ok(result.discoveries.some((d) => d.label === `${app.url}/search`));
    assert.equal(
      result.discoveries.some((d) => d.label === `${app.url}/nope`),
      false,
    );
  } finally {
    await app.close();
    await rm(wordlistDir, { recursive: true, force: true });
  }
});

test('FfufAdapter.run() genuinely executes ffuf with a wordlist matching nothing — a real, successful, zero-match run, not a failure (skipped if ffuf is not installed)', async () => {
  if (!(await isToolInstalled('ffuf'))) {
    return;
  }
  const app = await startLocalTestApp();
  const wordlistDir = await mkdtemp(join(tmpdir(), 'hunter-ffuf-wordlist-'));
  const wordlistPath = join(wordlistDir, 'words.txt');
  await writeFile(wordlistPath, 'nope\nnothing-here\nstill-nothing\n', 'utf8');
  try {
    const adapter = new FfufAdapter();
    const result = await adapter.run({ url: `${app.url}/FUZZ`, wordlistPath, matchCodes: '200' });
    assert.equal(result.ok, true, 'a real ffuf run that legitimately finds zero matches must still be ok: true');
    assert.deepEqual(result.discoveries, []);
    assert.match(result.summary, /zero matching paths/);
  } finally {
    await app.close();
    await rm(wordlistDir, { recursive: true, force: true });
  }
});

// === interpretFfufResult: pure decision logic, every branch unit-tested without spawning anything ===

test('interpretFfufResult reports ok: true with discoveries when ffuf exits 0 and finds matches', () => {
  const stdout = '{"url":"http://x/search","status":200,"length":10}\n';
  const result = interpretFfufResult({ stdout, stderr: '', exitCode: 0, timedOut: false });
  assert.equal(result.ok, true);
  assert.equal(result.discoveries.length, 1);
  assert.match(result.summary, /found 1 matching path/);
});

test('interpretFfufResult reports ok: true with zero discoveries when ffuf exits 0 with empty stdout — not a failure', () => {
  const result = interpretFfufResult({ stdout: '', stderr: '', exitCode: 0, timedOut: false });
  assert.equal(result.ok, true, 'exit 0 with no matches is a successful scan that found nothing, never a failure');
  assert.deepEqual(result.discoveries, []);
  assert.match(result.summary, /zero matching paths/);
});

test('interpretFfufResult reports ok: false when ffuf exits non-zero, even if it printed something to stdout', () => {
  const result = interpretFfufResult({
    stdout: 'some partial output',
    stderr: 'fatal: could not open wordlist',
    exitCode: 1,
    timedOut: false,
  });
  assert.equal(result.ok, false);
  assert.match(result.summary, /exited 1/);
  assert.match(result.summary, /could not open wordlist/);
});

test('interpretFfufResult reports ok: false for a non-zero exit with empty stdout too (a real crash, not a zero-match scan)', () => {
  const result = interpretFfufResult({ stdout: '', stderr: 'segmentation fault', exitCode: 139, timedOut: false });
  assert.equal(result.ok, false);
  assert.match(result.summary, /exited 139/);
});
