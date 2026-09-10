import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  appendEvidence,
  buildRedactedHttpExchange,
  contentHash,
  createEvidenceEntry,
  listEvidence,
  listEvidenceForFinding,
  redactHeaders,
} from './store.js';

async function withTempWorkspace<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-evidence-test-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('listEvidence returns an empty list when no evidence has been collected yet', async () => {
  await withTempWorkspace(async (dir) => {
    const result = await listEvidence(dir, 'e1');
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.value, []);
    }
  });
});

test('appended evidence is append-only and round-trips', async () => {
  await withTempWorkspace(async (dir) => {
    const first = createEvidenceEntry({
      engagementId: 'e1',
      findingId: 'f1',
      source: 'fixture',
      description: 'first observation',
    });
    const second = createEvidenceEntry({
      engagementId: 'e1',
      findingId: 'f1',
      source: 'fixture',
      description: 'second observation',
    });
    await appendEvidence(dir, first);
    await appendEvidence(dir, second);

    const result = await listEvidence(dir, 'e1');
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.length, 2);
      assert.equal(result.value[0]?.description, 'first observation');
      assert.equal(result.value[1]?.description, 'second observation');
    }
  });
});

test('listEvidenceForFinding filters by finding id', async () => {
  await withTempWorkspace(async (dir) => {
    await appendEvidence(
      dir,
      createEvidenceEntry({ engagementId: 'e1', findingId: 'f1', source: 'fixture', description: 'for f1' }),
    );
    await appendEvidence(
      dir,
      createEvidenceEntry({ engagementId: 'e1', findingId: 'f2', source: 'fixture', description: 'for f2' }),
    );

    const result = await listEvidenceForFinding(dir, 'e1', 'f1');
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.length, 1);
      assert.equal(result.value[0]?.description, 'for f1');
    }
  });
});

test('redactHeaders replaces credential-bearing header values, leaves others untouched', () => {
  const redacted = redactHeaders({
    Authorization: 'Bearer super-secret-token',
    Cookie: 'session=abc123',
    'Content-Type': 'application/json',
  });
  assert.equal(redacted.Authorization, '[redacted]');
  assert.equal(redacted.Cookie, '[redacted]');
  assert.equal(redacted['Content-Type'], 'application/json');
});

test('redactHeaders is case-insensitive on header names', () => {
  const redacted = redactHeaders({ AUTHORIZATION: 'Bearer x', 'set-cookie': 'a=b' });
  assert.equal(redacted.AUTHORIZATION, '[redacted]');
  assert.equal(redacted['set-cookie'], '[redacted]');
});

test('buildRedactedHttpExchange redacts headers and truncates a long body excerpt', () => {
  const exchange = buildRedactedHttpExchange({
    method: 'GET',
    url: 'http://127.0.0.1:1/internal',
    statusCode: 200,
    requestHeaders: { Authorization: 'Bearer x', Accept: 'application/json' },
    responseHeaders: { 'Set-Cookie': 'session=x' },
    bodyExcerpt: 'x'.repeat(5000),
  });
  assert.equal(exchange.requestHeaders.Authorization, '[redacted]');
  assert.equal(exchange.requestHeaders.Accept, 'application/json');
  assert.equal(exchange.responseHeaders['Set-Cookie'], '[redacted]');
  assert.equal(exchange.bodyExcerpt?.length, 2000);
});

test('contentHash is deterministic and differs for different content', () => {
  assert.equal(contentHash('hello'), contentHash('hello'));
  assert.notEqual(contentHash('hello'), contentHash('world'));
});

test('createEvidenceEntry attaches an httpExchange and contentHash when provided, and defaults to undefined otherwise', () => {
  const plain = createEvidenceEntry({ engagementId: 'e1', findingId: 'f1', source: 'fixture', description: 'x' });
  assert.equal(plain.redacted, true);
  assert.equal(plain.httpExchange, undefined);
  assert.equal(plain.contentHash, undefined);

  const withHttp = createEvidenceEntry({
    engagementId: 'e1',
    findingId: 'f1',
    source: 'active-recon',
    description: 'probed endpoint',
    httpExchange: buildRedactedHttpExchange({ method: 'GET', url: 'http://127.0.0.1:1/x', statusCode: 200 }),
    contentForHash: 'response body',
  });
  assert.equal(withHttp.httpExchange?.url, 'http://127.0.0.1:1/x');
  assert.equal(withHttp.contentHash, contentHash('response body'));
});
