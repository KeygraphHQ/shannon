import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  canTransition,
  createFinding,
  isTerminal,
  listFindings,
  loadFinding,
  saveFinding,
  transitionFinding,
  withEvidence,
} from './lifecycle.js';

function finding() {
  return createFinding({
    engagementId: 'e1',
    title: 'Reflected XSS',
    vulnClass: 'xss',
    assetRef: 'https://app.example.com/search',
    confidence: 0.8,
    observationIds: ['obs-1'],
    reason: 'selected as next-best investigation from an open hypothesis',
  });
}

test('new findings start in the candidate state with an initial transition log entry', () => {
  const f = finding();
  assert.equal(f.status, 'candidate');
  assert.equal(f.transitionLog.length, 1);
  assert.equal(f.transitionLog[0]?.status, 'candidate');
});

test('valid forward transitions are allowed and require a reason', () => {
  let f = finding();
  const toInvestigated = transitionFinding(f, 'investigated', 'ingested a Shannon observation for this asset');
  assert.equal(toInvestigated.ok, true);
  if (toInvestigated.ok) f = toInvestigated.value;

  const toReproduced = transitionFinding(f, 'reproduced', 'Shannon exploitation phase flagged this as verified');
  assert.equal(toReproduced.ok, true);
  if (toReproduced.ok) f = toReproduced.value;

  const toIndependentlyValidated = transitionFinding(
    f,
    'independently_validated',
    'corroborated by a second, independent observation',
  );
  assert.equal(toIndependentlyValidated.ok, true);
  if (toIndependentlyValidated.ok) f = toIndependentlyValidated.value;
  assert.equal(f.transitionLog.length, 4);
});

test('rejects a transition with an empty reason', () => {
  const result = transitionFinding(finding(), 'investigated', '   ');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /non-empty reason/);
  }
});

test('cannot skip straight from candidate to report_ready', () => {
  const result = transitionFinding(finding(), 'report_ready', 'trying to skip validation');
  assert.equal(result.ok, false);
});

test('terminal states have no outgoing transitions', () => {
  assert.equal(canTransition('reported', 'candidate'), false);
  assert.equal(isTerminal('reported'), true);
  assert.equal(isTerminal('duplicate'), true);
  assert.equal(isTerminal('rejected'), true);
  assert.equal(isTerminal('candidate'), false);
});

test('withEvidence de-duplicates evidence ids', () => {
  let f = finding();
  f = withEvidence(f, ['ev-1', 'ev-2']);
  f = withEvidence(f, ['ev-2']);
  assert.deepEqual(f.evidenceIds, ['ev-1', 'ev-2']);
});

test('saveFinding then loadFinding round-trips', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-finding-test-'));
  try {
    const f = finding();
    await saveFinding(dir, f);
    const loaded = await loadFinding(dir, f.engagementId, f.id);
    assert.equal(loaded.ok, true);
    if (loaded.ok) {
      assert.equal(loaded.value.id, f.id);
      assert.equal(loaded.value.status, 'candidate');
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('listFindings returns an empty array when none exist, and all saved findings otherwise', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-finding-list-test-'));
  try {
    assert.deepEqual(await listFindings(dir, 'e1'), []);

    const a = finding();
    const b = finding();
    await saveFinding(dir, a);
    await saveFinding(dir, b);

    const all = await listFindings(dir, 'e1');
    assert.equal(all.length, 2);
    assert.deepEqual(all.map((f) => f.id).sort(), [a.id, b.id].sort());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
