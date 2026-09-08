import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { compareSnapshots } from '../dist/security-review/comparison.js';
import { sealSnapshot, validateSnapshot } from '../dist/security-review/snapshot.js';
import { CONVENTIONAL_NAMES, EXCLUDED_DIRECTORIES, REPOSITORY_LIMITS } from '../dist/security-review/repository-types.js';
import { DEFAULT_LIMITS, RULES } from '../dist/security-review/types.js';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
    : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
const rawSeal = ({ id: _id, ...body }) => ({ ...body, id: digest(canonical(body)) });
const observation = (path, identity = digest('request'), pointer = '/services/app/privileged', ruleId = 'compose/privileged') => ({
  identity,
  issue: { ruleId, classification: 'configuration-risk', applicability: 'declared',
    message: 'Fixed declaration observation.', remediation: 'Review the explicit setting.', evidence: { file: path, pointer } },
});
function file(path, observations = [], { partialRule, failed = false, sha256 } = {}) {
  const diagnostics = failed ? [{ code: 'read_failed', pointer: '', ruleIds: RULES.compose, message: 'The input could not be read.' }]
    : partialRule ? [{ code: 'unknown_value', pointer: '', ruleIds: [partialRule], message: 'The declaration is incomplete.' }] : [];
  return {
    path, format: 'compose', sha256: failed ? null : sha256 ?? digest(JSON.stringify(observations.map((entry) => entry.identity))),
    bytes: failed ? null : 10, observations,
    result: { schemaVersion: 1, kind: 'offline-security-review', format: 'compose',
      status: failed ? 'failed' : partialRule ? 'partial' : 'completed', source: { file: path }, limits: DEFAULT_LIMITS,
      scope: { basis: 'local-declarations', deployedState: 'not-assessed', rules: RULES.compose.map((ruleId) => ({
        ruleId, state: failed ? 'unknown' : partialRule === ruleId ? 'partial' : 'assessed',
      })) }, issues: observations.map((entry) => entry.issue), diagnostics },
  };
}
function snapshot(files = [], changes = {}) {
  const body = { schemaVersion: 1, kind: 'offline-repository-review',
    status: files.some((entry) => entry.result.status !== 'completed') ? 'partial' : 'completed',
    reviewer: { name: 'local-openapi-compose', semanticsVersion: 1, digest: digest('reviewer') },
    policy: { conventionalNames: CONVENTIONAL_NAMES, excludedDirectories: EXCLUDED_DIRECTORIES, includes: [], excludes: [] },
    limits: REPOSITORY_LIMITS,
    discovery: { state: 'complete', entriesVisited: files.length, selectedBytes: files.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0), ignoredFiles: 0, skipped: [] },
    files, diagnostics: [], ...changes };
  return sealSnapshot(body);
}
const states = (result) => result.changes.map((change) => change.state).sort();

test('snapshot IDs use canonical object ordering and validated snapshots preserve source data', () => {
  const value = snapshot([file('compose.yml', [observation('compose.yml')])]);
  assert.equal(value.id, rawSeal(value).id);
  // Reorder only envelope fields without dropping nested properties.
  const body = Object.fromEntries(Object.entries(value).reverse().filter(([key]) => key !== 'id'));
  assert.equal(sealSnapshot(body).id, value.id);
  assert.throws(() => sealSnapshot(body, Date.now() - 1), /^Error: Invalid repository snapshot\.$/);
  assert.deepEqual(validateSnapshot(value), value);
});

test('snapshot validation rejects forged IDs, unknown schema, unsafe paths, duplicate files and inconsistent counters', () => {
  const good = snapshot([file('compose.yml')]);
  const variants = [
    { ...good, id: digest('forged') }, rawSeal({ ...good, unknown: true }),
    rawSeal({ ...good, files: [good.files[0], good.files[0]] }),
    rawSeal({ ...good, discovery: { ...good.discovery, selectedBytes: 0 } }),
    rawSeal({ ...good, status: 'partial' }),
  ];
  for (const path of ['../compose.yml', '/compose.yml', 'dir\\compose.yml', 'C:compose.yml', 'CON.yml', 'dir./compose.yml']) {
    variants.push(rawSeal({ ...good, files: [file(path)] }));
  }
  for (const variant of variants) assert.throws(() => validateSnapshot(variant), /^Error: Invalid repository snapshot\.$/);
});

test('snapshot validation requires exact issue/observation correspondence, correct formats, fingerprints and rule coverage', () => {
  const good = snapshot([file('compose.yml', [observation('compose.yml')])]);
  const edits = [
    (f) => { f.observations = []; },
    (f) => { f.observations[0].issue.evidence.file = 'other.yml'; },
    (f) => { f.result.scope.rules.pop(); },
    (f) => { f.result.scope.rules[0].state = 'unknown'; },
    (f) => { f.sha256 = null; },
    (f) => { f.observations[0].identity = 'not-a-digest'; },
    (f) => { f.format = 'openapi'; },
  ];
  for (const edit of edits) {
    const changed = structuredClone(good);
    edit(changed.files[0]);
    assert.throws(() => validateSnapshot(rawSeal(changed)), /^Error: Invalid repository snapshot\.$/);
  }
});

test('snapshot validation bounds hostile graph shape and never invokes getters', () => {
  let invoked = false;
  const getter = Object.defineProperty({}, 'kind', { enumerable: true, get() { invoked = true; throw new Error('PRIVATE'); } });
  assert.throws(() => validateSnapshot(getter), /^Error: Invalid repository snapshot\.$/);
  assert.equal(invoked, false);
  const proxy = new Proxy({}, { getPrototypeOf() { invoked = true; throw new Error('PRIVATE'); } });
  assert.throws(() => validateSnapshot(proxy), /^Error: Invalid repository snapshot\.$/);
  assert.equal(invoked, false);
  const cyclic = {}; cyclic.child = cyclic;
  assert.throws(() => validateSnapshot(cyclic), /^Error: Invalid repository snapshot\.$/);
  let nested = {}; for (let index = 0; index < 100; index++) nested = { child: nested };
  assert.throws(() => validateSnapshot(nested), /^Error: Invalid repository snapshot\.$/);
  assert.throws(() => validateSnapshot({ private: 'x'.repeat(16 * 1024 * 1024 + 1) }), /^Error: Invalid repository snapshot\.$/);
});

test('skipped discovery gaps cannot claim complete inventory while intentional exclusions can', () => {
  const complete = snapshot();
  for (const reason of ['linked-path', 'unreadable-entry', 'timeout', 'unknown-reason']) {
    const forged = rawSeal({ ...complete, discovery: { ...complete.discovery, skipped: [{ path: '', reason }] } });
    assert.throws(() => validateSnapshot(forged), /^Error: Invalid repository snapshot\.$/);
  }
  const excluded = snapshot([], { discovery: { ...complete.discovery, entriesVisited: 1,
    skipped: [{ path: 'node_modules', reason: 'excluded-directory' }] } });
  assert.equal(excluded.status, 'completed');
  const missing = rawSeal({ ...complete, policy: { ...complete.policy,
    includes: [{ path: 'missing.conf', format: 'compose' }] } });
  assert.throws(() => validateSnapshot(missing), /^Error: Invalid repository snapshot\.$/);
});

test('comparison classifies ordinary new, unchanged and removed declarations with current evidence', () => {
  const old = observation('compose.yml', digest('old'));
  const kept = observation('compose.yml', digest('kept'), '/services/kept/cap_add/1', 'compose/expanded-capabilities');
  const current = observation('compose.yml', digest('kept'), '/services/kept/cap_add/0', 'compose/expanded-capabilities');
  const added = observation('compose.yml', digest('new'), '/services/new/privileged');
  const result = compareSnapshots(snapshot([file('compose.yml', [old, kept])]), snapshot([file('compose.yml', [current, added])]));
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.counts, { new: 1, unchanged: 1, removed: 1, unknown: 0 });
  assert.equal(result.changes.find((change) => change.state === 'unchanged').after.issue.evidence.pointer, current.issue.evidence.pointer);
});

test('complete compatible inventory permits new files while deleted files retain unknown old observations', () => {
  const added = snapshot([file('new/compose.yml', [observation('new/compose.yml')])]);
  const introduced = compareSnapshots(snapshot(), added);
  assert.deepEqual(states(introduced), ['new']);
  assert.equal(introduced.status, 'completed');
  const deleted = compareSnapshots(added, snapshot());
  assert.deepEqual(states(deleted), ['unknown']);
  assert.equal(deleted.status, 'partial');
});

test('equivalent list reorderings retain identities and candidate pointers', () => {
  const one = observation('compose.yml', digest('one'), '/services/app/cap_add/0', 'compose/expanded-capabilities');
  const two = observation('compose.yml', digest('two'), '/services/app/cap_add/1', 'compose/expanded-capabilities');
  const later = [{ ...two, issue: { ...two.issue, evidence: { file: 'compose.yml', pointer: '/services/app/cap_add/0' } } },
    { ...one, issue: { ...one.issue, evidence: { file: 'compose.yml', pointer: '/services/app/cap_add/1' } } }];
  const result = compareSnapshots(snapshot([file('compose.yml', [one, two])]), snapshot([file('compose.yml', later)]));
  assert.deepEqual(result.counts, { new: 0, unchanged: 2, removed: 0, unknown: 0 });
  assert.equal(result.status, 'completed');
});

test('per-rule coverage preserves supported changes despite unrelated incomplete file or rule', () => {
  const baseline = snapshot([file('compose.yml', [], { partialRule: 'compose/unconfined-profile' }), file('other/compose.yml', [], { failed: true })]);
  const candidate = snapshot([file('compose.yml', [observation('compose.yml')]), file('other/compose.yml', [], { failed: true })]);
  const result = compareSnapshots(baseline, candidate);
  assert.deepEqual(states(result), ['new']);
  assert.equal(result.status, 'partial');
  assert.ok(result.diagnostics.length > 0);
});

test('incomplete counterparts cannot establish new or removed declarations', () => {
  const known = snapshot([file('compose.yml', [observation('compose.yml')])]);
  const failed = snapshot([file('compose.yml', [], { failed: true })]);
  for (const [before, after] of [[failed, known], [known, failed]]) {
    const result = compareSnapshots(before, after);
    assert.deepEqual(states(result), ['unknown']);
    assert.equal(result.status, 'partial');
  }
  const incomplete = snapshot([], { status: 'partial', discovery: { state: 'incomplete', entriesVisited: 0, selectedBytes: 0, ignoredFiles: 0, skipped: [] } });
  assert.deepEqual(states(compareSnapshots(incomplete, known)), ['unknown']);
});

test('null and duplicated identities stay unknown without manufacturing counterpart changes', () => {
  const known = snapshot([file('compose.yml', [observation('compose.yml')])]);
  const ambiguous = snapshot([file('compose.yml', [observation('compose.yml', null)])]);
  assert.deepEqual(states(compareSnapshots(known, ambiguous)), ['unknown', 'unknown']);
  const duplicate = snapshot([file('compose.yml', [observation('compose.yml'), observation('compose.yml', digest('request'), '/services/other/privileged')])]);
  assert.deepEqual(states(compareSnapshots(known, duplicate)), ['unknown', 'unknown', 'unknown']);
});

test('identical-content moves are separate unknown observations on both sides', () => {
  const content = digest('same bytes');
  const result = compareSnapshots(snapshot([file('old/compose.yml', [observation('old/compose.yml')], { sha256: content })]),
    snapshot([file('new/compose.yml', [observation('new/compose.yml')], { sha256: content })]));
  assert.deepEqual(states(result), ['unknown', 'unknown']);
  assert.ok(result.changes.every((change) => (change.before === null) !== (change.after === null)));
  assert.equal(result.status, 'partial');
});

test('incompatible reviewer or selection policies retain unknown sides, and invalid snapshots fail without changes', () => {
  const baseline = snapshot([file('compose.yml', [observation('compose.yml')])]);
  for (const candidate of [snapshot(baseline.files, { reviewer: { ...baseline.reviewer, digest: digest('different') } }),
    snapshot(baseline.files, { policy: { ...baseline.policy, includes: [{ path: 'compose.yml', format: 'compose' }] } })]) {
    const result = compareSnapshots(baseline, candidate);
    assert.equal(result.compatible, false);
    assert.deepEqual(states(result), ['unknown', 'unknown']);
    assert.equal(result.status, 'partial');
  }
  for (const invalid of [null, {}, { ...baseline, id: 'PRIVATE_VALUE' }]) {
    const result = compareSnapshots(invalid, baseline);
    assert.equal(result.status, 'failed');
    assert.deepEqual(result.changes, []);
    assert.ok(result.diagnostics.length > 0);
    assert.equal(JSON.stringify(result).includes('PRIVATE_VALUE'), false);
  }
});

test('policy list ordering is not a semantic change and comparison does not mutate input', () => {
  const baseline = snapshot([file('compose.yml', [observation('compose.yml')])]);
  const candidate = snapshot(baseline.files, { policy: { ...baseline.policy,
    conventionalNames: [...CONVENTIONAL_NAMES].reverse(), excludedDirectories: [...EXCLUDED_DIRECTORIES].reverse() } });
  const before = JSON.stringify([baseline, candidate]);
  assert.deepEqual(states(compareSnapshots(baseline, candidate)), ['unchanged']);
  assert.equal(JSON.stringify([baseline, candidate]), before);
});
