import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { analyzeObservation } from '../dist/blackbox-observation/index.js';

async function rich() {
  const directory = new URL('./fixtures/blackbox-observation/sets/rich/', import.meta.url);
  const json = async name => JSON.parse(await readFile(new URL(name, directory), 'utf8'));
  return { traffic: await json('traffic_inventory.json'), blackboard: await json('blackbox_blackboard.json'),
    findings: await json('blackbox_authz_findings.json') };
}

test('independent core review: provenance and source references cannot carry extra private payload fields', async () => {
  const input = await rich();
  for (const value of [...input.traffic, ...input.blackboard.exchanges]) {
    value.provenance.notes = 'PRIVATE_PROVENANCE_SENTINEL';
    value.provenance.headers = { Authorization: 'PRIVATE_HEADER_SENTINEL' };
  }
  const result = analyzeObservation(input);
  assert.equal(result.status, 'completed');
  assert.equal(result.counts.exchanges, 4);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_PROVENANCE_SENTINEL|PRIVATE_HEADER_SENTINEL/);
  const diagnostic = analyzeObservation({ ...input, findings: undefined,
    inputDiagnostics: [{ code: 'read-failed', source: { source: 'findings', pointer: '', notes: 'PRIVATE_SOURCE_SENTINEL' } }] });
  assert.equal(diagnostic.status, 'partial');
  assert.doesNotMatch(JSON.stringify(diagnostic), /PRIVATE_SOURCE_SENTINEL/);
});

test('independent core review: one conflicted exchange ID shared by both exports counts once', async () => {
  const input = await rich();
  const conflict = { ...input.traffic[0], responseStatus: 503 };
  input.traffic.push(structuredClone(conflict));
  input.blackboard.exchanges.push(structuredClone(conflict));
  const result = analyzeObservation(input);
  assert.equal(result.status, 'partial');
  assert.equal(result.counts.conflicts, 1);
  assert.equal(result.counts.exchanges, 3);
  assert.ok(!result.exchanges.some(exchange => exchange.exchangeId === conflict.exchangeId));
});

test('independent core review: unsupported native exchange IDs are isolated before raw filename selection', async () => {
  const input = await rich();
  const previous = input.traffic[0].exchangeId;
  for (const record of [...input.traffic, ...input.blackboard.exchanges]) {
    if (record.exchangeId === previous) record.exchangeId = '../PRIVATE_PATH_SENTINEL';
  }
  const result = analyzeObservation(input);
  assert.equal(result.status, 'partial');
  assert.ok(!result.exchanges.some(exchange => exchange.exchangeId === '../PRIVATE_PATH_SENTINEL'));
});
