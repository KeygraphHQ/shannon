import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { renderBlackboxArtifacts } from '../dist/blackbox/artifacts.js';
import { checkReportBundle, exportReportBundle } from '../dist/reporting/bundle.js';
import { validatePrivateBundle } from '../dist/reporting/private-bundle.js';

const BOARD = 'blackbox_blackboard.json';
const INVENTORY = 'traffic_inventory.json';
const FINDINGS = 'blackbox_authz_findings.json';
const MARKDOWN = 'blackbox_authz_evidence.md';
const SECRET = 'private-value-never-in-diagnostics';
const provenance = { actor: 'blackbox-recon', taskId: 'ephemeral-unpersisted-task', baseRevision: 1 };

function exchange(exchangeId, identity, captureSequence) {
  return {
    exchangeId, routeSignature: 'GET /records/:id', identity, captureSequence, method: 'GET',
    origin: 'https://synthetic.example', path: '/records/1', queryKeys: [], bodyShape: 'none',
    requestContentType: null, responseStatus: 200, responseContentType: 'application/json',
    responseFingerprint: 'sha256:synthetic', candidateObjectReferences: ['1'], rawRecordRef: 'omitted.json',
    provenance,
  };
}

function fixture(withMetadata = false, seedPrivate = false) {
  const replaySequence = {
    actionId: 'action', steps: [{ stepId: 'step', sourceExchangeId: 'baseline', actor: 'attacker',
      mutations: [{ type: 'set_query', name: 'record', value: '1' },
        { type: 'set_json_pointer', pointer: '/record', value: { nested: true } }] }],
    proofCondition: { type: 'body_contains', marker: 'private marker' },
  };
  const observation = {
    condition: replaySequence.proofCondition, passed: true, baselineExchangeId: 'baseline', baselinePassed: true,
    controlExchangeIds: ['baseline'], controlPassed: false, observedMarkerDigest: 'recorded digest',
    observedTransitionId: 'transition', verificationExchangeId: 'verification-exchange',
  };
  const snapshot = {
    schemaVersion: 1, revision: 9, targetOrigin: 'https://synthetic.example',
    identities: [{ name: 'victim', role: 'user', authenticated: true, stateRef: 'private-state' },
      { name: 'attacker', role: 'user', authenticated: true, stateRef: 'private-state-2' }],
    exchanges: [exchange('baseline', 'victim', 1), exchange('attack', 'attacker', 2),
      exchange('verification-exchange', 'attacker', 3)],
    resources: [{ resourceId: 'resource', resourceType: 'record', objectReferences: ['1'], ownerIdentity: 'victim',
      visibility: 'private', evidence: [{ kind: 'exchange', id: 'baseline' }], provenance }],
    transitions: [{ transitionId: 'transition', identity: 'victim', fromState: 'before', toState: 'after',
      triggerExchangeId: 'baseline', captureSequence: 1, resourceId: 'resource', provenance }],
    hypotheses: [{ hypothesisId: 'hypothesis', kind: 'horizontal', summary: 'saved hypothesis', preconditions: ['account'],
      attackerCapability: 'user', evidence: [{ kind: 'resource', id: 'resource' }, { kind: 'transition', id: 'transition' }],
      priority: 'high', status: 'verified', provenance }],
    actions: [{ actionId: 'action', hypothesisId: 'hypothesis', sequence: replaySequence, status: 'completed',
      exchangeIds: ['attack'], observation, provenance }],
    candidateProofs: [{ candidateId: 'candidate', hypothesisId: 'hypothesis', victimIdentity: 'victim',
      attackerIdentity: 'attacker', victimResourceId: 'resource', baselineExchangeId: 'baseline', actionId: 'action',
      verificationSourceExchangeId: 'baseline', demonstratedAction: 'read record', concreteEffect: 'private disclosure',
      affectedParty: 'users', preconditions: ['account'], provenance }],
    verifications: [{ verificationId: 'verification', candidateId: 'candidate', freshStateRefs: [
      { identity: 'victim', stateRef: 'private-fresh-state' }, { identity: 'attacker', stateRef: 'private-fresh-state-2' }],
      replayActionIds: ['ephemeral-unpersisted-action'], replayExchangeIds: ['verification-exchange'], observation,
      failureReason: null, verdict: 'verified', demonstratedAction: 'read record', concreteEffect: 'private disclosure',
      affectedParty: 'users' }],
    tasks: [{ taskId: 'task', kind: 'action', objective: 'recorded task', evidence: [
      { kind: 'action', id: 'action' }, { kind: 'proof', id: 'candidate' }], identityLease: 'attacker',
      hypothesisId: 'hypothesis', status: 'completed', replayPlan: replaySequence }],
    rejectedTasks: [{ task: { taskId: 'task', kind: 'action', objective: 'invalid proposal',
      evidence: [{ kind: 'exchange', id: 'intentionally-missing' }], identityLease: 'missing-identity',
      hypothesisId: 'missing-hypothesis', status: 'rejected' }, reason: 'invalid references' }],
    runStatus: 'running',
  };
  const findings = [{ findingId: 'finding', hypothesisId: 'hypothesis', victimIdentity: 'victim',
    attackerIdentity: 'attacker', baselineExchangeId: 'baseline', attackExchangeIds: ['attack'],
    verificationExchangeIds: ['verification-exchange'], replaySequence, demonstratedAction: 'read record',
    concreteEffect: 'private disclosure', affectedParty: 'users', impactStatement: 'recorded private disclosure',
    preconditions: ['account'], verifierResultId: 'verification' }];
  const metadata = {
    schemaVersion: 1, runId: 'run-recorded', historyComplete: false, currentAttemptId: 'repair', resultAttemptId: 'original',
    attempts: [{ attemptId: 'original', workflowId: 'workflow-recorded', resumedFromAttemptId: null,
      startedAt: '2026-01-01T00:00:00.000Z', endedAt: '2026-01-01T00:01:00.000Z',
      code: { revision: 'a'.repeat(40), dirty: true, sha256: 'b'.repeat(64) }, configuredModel: 'recorded-model',
      termination: { code: 'completed', source: 'workflow' } },
    { attemptId: 'repair', workflowId: 'workflow-repair', resumedFromAttemptId: 'original',
      startedAt: '2025-12-31T23:00:00.000Z', endedAt: null,
      code: { revision: null, dirty: null, sha256: null }, configuredModel: null, termination: null }],
  };
  const privateFields = new Set(['exchangeId', 'identity', 'hypothesisId', 'resourceId', 'ownerIdentity',
    'transitionId', 'triggerExchangeId', 'actionId', 'sourceExchangeId', 'stepId', 'victimIdentity',
    'attackerIdentity', 'victimResourceId', 'baselineExchangeId', 'verificationSourceExchangeId', 'candidateId',
    'verificationId', 'taskId', 'identityLease', 'findingId', 'verifierResultId', 'attemptId', 'workflowId',
    'resumedFromAttemptId', 'runId', 'currentAttemptId', 'resultAttemptId', 'id', 'exchangeIds', 'attackExchangeIds',
    'verificationExchangeIds', 'controlExchangeIds', 'replayActionIds', 'replayExchangeIds', 'observedTransitionId',
    'verificationExchangeId', 'summary', 'objective', 'demonstratedAction', 'concreteEffect', 'impactStatement',
    'marker', 'configuredModel', 'preconditions', 'reason']);
  function seed(value, key = '') {
    if (!seedPrivate) return value;
    if (Array.isArray(value)) return value.map((item) => seed(item, key));
    if (value !== null && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([field, item]) => [field, seed(item, field)]));
    if (typeof value === 'string' && (privateFields.has(key) ||
      ((key === 'name' || key === 'actor') && ['victim', 'attacker'].includes(value))))
      return `${SECRET}:${value}`;
    return value;
  }
  return renderBlackboxArtifacts({ snapshot: seed(snapshot), findings: seed(findings), status: 'complete', failure: null,
    ...(withMetadata ? { runMetadata: seed(metadata) } : {}) });
}

function change(files, name, edit) {
  const value = JSON.parse(files[name]);
  edit(value);
  return { ...files, [name]: JSON.stringify(value) };
}

function assertIssue(files, code) {
  const result = validatePrivateBundle(files);
  assert.equal(result.data, undefined);
  assert.ok(result.issues.some((issue) => issue.code === code), JSON.stringify(result.issues));
  assert.equal(JSON.stringify(result.issues).includes(SECRET), false);
  return result;
}

test('validates a coherent current export with complete reference coverage and no mutations', () => {
  const files = fixture(true);
  const original = structuredClone(files);
  const result = validatePrivateBundle(files);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.data.findings.map((item) => item.findingId), ['finding']);
  assert.deepEqual(files, original);
});

test('accepts arbitrary inventory order and CRLF report bytes without modifying them', () => {
  let files = change(fixture(), INVENTORY, (values) => values.reverse());
  files = { ...files, [MARKDOWN]: files[MARKDOWN].replaceAll('\n', '\r\n') };
  const result = validatePrivateBundle(files);
  assert.deepEqual(result.issues, []);
  assert.equal(result.data.markdown, files[MARKDOWN]);
});

test('legacy reports may omit the run summary and metadata', () => {
  const files = fixture();
  const start = files[MARKDOWN].indexOf('## Run summary');
  const end = files[MARKDOWN].indexOf('## finding');
  files[MARKDOWN] = files[MARKDOWN].slice(0, start) + files[MARKDOWN].slice(end);
  assert.deepEqual(validatePrivateBundle(files).issues, []);
});

test('unknown private extension keys are inert and do not become reference checks', () => {
  const files = change(fixture(), BOARD, (board) => {
    board[SECRET] = { secret: SECRET };
    board.actions[0].identity = SECRET;
    board.actions[0].evidence = SECRET;
  });
  assert.deepEqual(validatePrivateBundle(files).issues, []);
});

test('missing companions and malformed JSON return safe diagnostics', () => {
  for (const name of [BOARD, INVENTORY, FINDINGS, MARKDOWN]) {
    const files = fixture();
    delete files[name];
    assertIssue(files, 'missing_artifact');
  }
  for (const name of [BOARD, INVENTORY, FINDINGS])
    assertIssue({ ...fixture(), [name]: `{${SECRET}` }, 'invalid_json');
});

test('malformed top-level and nested source structures return issues without throwing', () => {
  const edits = [
    (board) => { board.schemaVersion = 2; },
    (board) => { board.exchanges[0].identity = null; },
    (board) => { board.identities[0].authenticated = 'true'; },
    (board) => { board.resources[0].visibility = SECRET; },
    (board) => { board.hypotheses[0].evidence = [null]; },
    (board) => { board.transitions[0].captureSequence = -1; },
    (board) => { board.actions[0].sequence.steps[0].mutations = [{ type: SECRET }]; },
    (board) => { board.actions[0].sequence.proofCondition = { type: 'json_pointer_equals', pointer: '/x' }; },
    (board) => { board.actions[0].observation.passed = 1; },
    (board) => { board.candidateProofs[0].preconditions = [false]; },
    (board) => { board.verifications[0].freshStateRefs[0].fresh = false; },
    (board) => { delete board.verifications[0].concreteEffect; },
    (board) => { board.tasks[0].replayPlan.steps = {}; },
    (board) => { board.rejectedTasks[0].reason = null; },
  ];
  for (const edit of edits) assertIssue(change(fixture(), BOARD, edit), 'invalid_shape');
  for (const name of [BOARD, INVENTORY, FINDINGS])
    for (const value of [null, 1, SECRET, {}])
      assertIssue({ ...fixture(), [name]: JSON.stringify(value) }, 'invalid_shape');
});

test('detects duplicate authoritative IDs in every collection and duplicate replay step IDs', () => {
  for (const name of ['identities', 'exchanges', 'resources', 'transitions', 'hypotheses',
    'actions', 'candidateProofs', 'verifications', 'tasks'])
    assertIssue(change(fixture(), BOARD, (board) => board[name].push(board[name][0])), 'duplicate_id');
  assertIssue(change(fixture(), INVENTORY, (items) => items.push(items[0])), 'duplicate_id');
  assertIssue(change(fixture(), FINDINGS, (items) => items.push(items[0])), 'duplicate_id');
  assertIssue(change(fixture(), BOARD, (board) => {
    board.actions[0].sequence.steps.push(board.actions[0].sequence.steps[0]);
  }), 'duplicate_id');
});

test('detects mixed inventory data and mismatched origins', () => {
  assertIssue(change(fixture(), INVENTORY, (items) => { items[0].path = '/other'; }), 'inventory_mismatch');
  assertIssue(change(fixture(), INVENTORY, (items) => { items.pop(); }), 'inventory_mismatch');
  assertIssue(change(fixture(), BOARD, (board) => { board.exchanges[0].origin = 'https://other.example'; }), 'origin_mismatch');
});

test('detects dangling identities, evidence, entity links, replay steps and observations', () => {
  const edits = [
    (board) => { board.exchanges[0].identity = SECRET; },
    (board) => { board.resources[0].ownerIdentity = SECRET; },
    (board) => { board.resources[0].evidence[0].id = SECRET; },
    (board) => { board.transitions[0].triggerExchangeId = SECRET; },
    (board) => { board.transitions[0].resourceId = SECRET; },
    (board) => { board.actions[0].hypothesisId = SECRET; },
    (board) => { board.actions[0].sequence.steps[0].sourceExchangeId = SECRET; },
    (board) => { board.actions[0].sequence.steps[0].actor = SECRET; },
    (board) => { board.actions[0].sequence.proofCondition = { type: 'persistent_state',
      verificationSourceExchangeId: SECRET, marker: SECRET }; },
    (board) => { board.actions[0].exchangeIds = [SECRET]; },
    (board) => { board.actions[0].observation.controlExchangeIds = [SECRET]; },
    (board) => { board.actions[0].observation.observedTransitionId = SECRET; },
    (board) => { board.candidateProofs[0].victimIdentity = SECRET; },
    (board) => { board.candidateProofs[0].victimResourceId = SECRET; },
    (board) => { board.candidateProofs[0].actionId = SECRET; },
    (board) => { board.verifications[0].candidateId = SECRET; },
    (board) => { board.verifications[0].freshStateRefs[0].identity = SECRET; },
    (board) => { board.verifications[0].replayExchangeIds = [SECRET]; },
    (board) => { board.tasks[0].identityLease = SECRET; },
  ];
  for (const edit of edits) assertIssue(change(fixture(), BOARD, edit), 'dangling_reference');
  assertIssue(change(fixture(), FINDINGS, (items) => { items[0].verifierResultId = SECRET; }), 'dangling_reference');
});

test('checks finding agreement with verifier, candidate and recorded action', () => {
  for (const edit of [
    (items) => { items[0].concreteEffect = SECRET; },
    (items) => { items[0].victimIdentity = 'attacker'; },
    (items) => { items[0].preconditions = []; },
    (items) => { items[0].attackExchangeIds = ['baseline']; },
    (items) => { items[0].verificationExchangeIds = ['baseline']; },
    (items) => { items[0].replaySequence.proofCondition.marker = SECRET; },
  ]) assertIssue(change(fixture(), FINDINGS, edit), 'finding_mismatch');
  assertIssue(change(fixture(), BOARD, (board) => { board.verifications[0].verdict = 'blocked'; }), 'finding_mismatch');
  assertIssue(change(fixture(), BOARD, (board) => { board.actions[0].sequence.actionId = SECRET; }), 'reference_mismatch');
});

test('allows invalid rejected proposals and ephemeral provenance task and verifier action IDs', () => {
  const files = change(fixture(), BOARD, (board) => {
    board.rejectedTasks.push(board.rejectedTasks[0]);
    board.actions[0].provenance.taskId = SECRET;
    board.verifications[0].replayActionIds = [SECRET];
  });
  // The canonical summary includes the updated rejected count.
  files[MARKDOWN] = files[MARKDOWN].replace('| Rejected proposal records | 1 |', '| Rejected proposal records | 2 |');
  assert.deepEqual(validatePrivateBundle(files).issues, []);
});

test('validates provenance formats, ending pairs, lineage, result attribution and status', () => {
  const edits = [
    (metadata) => { metadata.schemaVersion = 2; },
    (metadata) => { metadata.attempts[0].code.sha256 = SECRET; },
    (metadata) => { metadata.attempts[0].code.revision = SECRET; },
    (metadata) => { metadata.attempts[0].startedAt = SECRET; },
    (metadata) => { metadata.attempts[0].termination.source = SECRET; },
    (metadata) => { metadata.attempts[0].endedAt = null; },
    (metadata) => { metadata.attempts[1].resumedFromAttemptId = SECRET; },
    (metadata) => { metadata.attempts[0].resumedFromAttemptId = 'repair'; },
    (metadata) => { metadata.attempts[1].resumedFromAttemptId = null; },
    (metadata) => { metadata.currentAttemptId = 'original'; },
    (metadata) => { metadata.resultAttemptId = SECRET; },
    (metadata) => { metadata.resultAttemptId = 'repair'; },
    (metadata) => { metadata.attempts[0].termination.code = 'limit_reached'; },
    (metadata) => { metadata.attempts[0].termination.source = 'worker'; },
  ];
  for (const edit of edits) assertIssue(change(fixture(true), BOARD, (board) => edit(board.runMetadata)), 'invalid_provenance');
  assertIssue(change(fixture(true), BOARD, (board) => { board.runMetadata.attempts.push(board.runMetadata.attempts[0]); }), 'duplicate_id');
});

test('checks Markdown status, findings, counts and encoded execution provenance', () => {
  const files = fixture(true);
  for (const [before, after] of [
    ['Status: complete', 'Status: incomplete'],
    ['## finding\n', '## wrong-finding\n'],
    ['Verifier result: verification', 'Verifier result: missing'],
    ['| Reportable findings | 1 |', '| Reportable findings | 0 |'],
    ['| Run ID | run-recorded |', '| Run ID | other-run |'],
    ['| Result attempt | original |', '| Result attempt | repair |'],
  ]) assertIssue({ ...files, [MARKDOWN]: files[MARKDOWN].replace(before, after) }, 'markdown_mismatch');
  assertIssue(change(files, BOARD, (board) => { delete board.runMetadata; }), 'markdown_mismatch');
});

test('malformed findings and Markdown diagnostics never include private input or hostile keys', () => {
  assertIssue(change(fixture(), FINDINGS, (items) => { items[0].replaySequence = { [SECRET]: SECRET }; }), 'invalid_shape');
  assertIssue({ ...fixture(), [MARKDOWN]: SECRET }, 'markdown_mismatch');
});

test('a rich private graph composes with sanitized export, manifest validation and byte-preserving source reads', async () => {
  let files = fixture(true, true);
  files = change(files, BOARD, (board) => {
    board[SECRET] = { [SECRET]: SECRET };
    for (const item of board.exchanges) item[SECRET] = { secret: SECRET };
  });
  files = change(files, INVENTORY, (items) => {
    for (const item of items) item[SECRET] = { secret: SECRET };
  });
  assert.deepEqual(validatePrivateBundle(files).issues, []);
  const temp = await mkdtemp(path.join(tmpdir(), 'report-validation-'));
  try {
    const source = path.join(temp, 'source');
    const destination = path.join(temp, 'share');
    await mkdir(source);
    for (const [name, contents] of Object.entries(files))
      await writeFile(path.join(source, name), contents);
    const exported = await exportReportBundle(source, destination, 'sanitized');
    assert.equal(exported.valid, true);
    assert.equal(exported.integrity, 'matched');
    assert.equal(exported.profile, 'sanitized');
    const checked = await checkReportBundle(destination);
    assert.equal(checked.valid, true);
    assert.equal(checked.integrity, 'matched');
    const outputNames = await readdir(destination);
    assert.deepEqual(outputNames.sort(), ['bundle-manifest.json', 'report.json', 'report.md']);
    for (const name of outputNames) {
      const contents = await readFile(path.join(destination, name), 'utf8');
      for (const privateValue of [SECRET, 'recorded-model', 'run-recorded', 'workflow-recorded', 'workflow-repair',
        'a'.repeat(40), 'b'.repeat(64), 'private marker', 'recorded private disclosure', 'private-fresh-state'])
        assert.equal(contents.includes(privateValue), false, `${name} included seeded private content`);
    }
    for (const [name, contents] of Object.entries(files))
      assert.deepEqual(await readFile(path.join(source, name)), Buffer.from(contents));
  } finally {
    // This exact mkdtemp child is owned by the test, never a user-provided path.
    assert.equal(path.dirname(path.resolve(temp)), path.resolve(tmpdir()));
    assert.ok(path.basename(temp).startsWith('report-validation-'));
    await rm(temp, { recursive: true, force: true });
  }
});
