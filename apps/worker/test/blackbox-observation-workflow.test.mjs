import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const moduleUrl = process.env.BLACKBOX_OBSERVATION_WORKFLOW_MODULE
  ? pathToFileURL(process.env.BLACKBOX_OBSERVATION_WORKFLOW_MODULE).href
  : new URL('../dist/blackbox-observation/workflow.js', import.meta.url).href;
const { reconstructWorkflows } = await import(moduleUrl);
const renderModuleUrl = process.env.BLACKBOX_OBSERVATION_RENDER_MODULE
  ? pathToFileURL(process.env.BLACKBOX_OBSERVATION_RENDER_MODULE).href
  : new URL('../dist/blackbox-observation/render.js', import.meta.url).href;
const { renderObservationMarkdown } = await import(renderModuleUrl);

const ref = (pointer, source = 'blackboard') => ({ source, pointer });
const identity = (name, kind = 'named') => ({
  key: kind === 'named' ? `named:${name}` : kind,
  kind,
  name: kind === 'named' ? name : null,
  role: null,
  authenticated: null,
  sources: [ref(`/identities/${name}`)],
});
const exchange = (exchangeId, identityKey, captureSequence) => ({
  exchangeId,
  identityKey,
  captureSequence,
  sources: [ref(`/exchanges/${exchangeId}`)],
});
const transition = (transitionId, overrides = {}) => ({
  transitionId,
  identityKey: 'named:alice',
  recordedIdentity: 'alice',
  fromState: 'draft',
  toState: 'submitted',
  triggerExchangeId: 'a1',
  captureSequence: 1,
  resourceId: 'order1',
  sources: [ref(`/transitions/${transitionId}`)],
  ...overrides,
});
const input = (overrides = {}) => ({
  identities: [identity('alice'), identity('bob')],
  exchanges: [exchange('a1', 'named:alice', 1), exchange('b1', 'named:bob', 1)],
  resources: [{ resourceId: 'order1', sources: [ref('/resources/0')] }],
  transitions: [],
  ...overrides,
});

test('workflow sequences remain per identity, preserve ties, internal gaps and unsupported order', () => {
  const result = reconstructWorkflows(input({
    exchanges: [
      exchange('b9', 'named:bob', 9), exchange('a4', 'named:alice', 4),
      exchange('a1z', 'named:alice', 1), exchange('a?', 'named:alice', null),
      exchange('a1a', 'named:alice', 1), exchange('b1', 'named:bob', 1),
    ],
  }));
  const alice = result.workflows.find((workflow) => workflow.identityKey === 'named:alice');
  const bob = result.workflows.find((workflow) => workflow.identityKey === 'named:bob');
  assert.deepEqual(alice.sequenceGroups.map(({ captureSequence, exchangeIds, tied }) => ({ captureSequence, exchangeIds, tied })), [
    { captureSequence: 1, exchangeIds: ['a1a', 'a1z'], tied: true },
    { captureSequence: 4, exchangeIds: ['a4'], tied: false },
    { captureSequence: null, exchangeIds: ['a?'], tied: false },
  ]);
  assert.deepEqual(alice.gaps, [{ after: 1, before: 4 }]);
  assert.deepEqual(bob.gaps, [{ after: 1, before: 9 }]);
  assert.ok(alice.uncertainties.includes('tied-capture-sequence'));
  assert.ok(alice.uncertainties.includes('unknown-capture-sequence'));
  assert.equal(alice.transitionAvailability, 'unavailable');
  assert.equal(result.hasReferenceProblems, false);
  assert.deepEqual(result.workflows.flatMap((workflow) => workflow.transitions), []);
});

test('recorded transitions retain states and links as recorded associations', () => {
  const result = reconstructWorkflows(input({ transitions: [transition('t1')] }));
  const workflow = result.workflows.find((entry) => entry.identityKey === 'named:alice');
  assert.equal(workflow.transitionAvailability, 'recorded');
  assert.equal(result.hasReferenceProblems, false);
  assert.deepEqual(workflow.transitions[0], {
    transitionId: 't1', recordedIdentity: 'alice', fromState: 'draft', toState: 'submitted',
    captureSequence: 1, recordState: 'consistent',
    trigger: { exchangeId: 'a1', state: 'linked', sources: [ref('/exchanges/a1')] },
    resource: { resourceId: 'order1', state: 'linked', sources: [ref('/resources/0')] },
    sequenceRelation: 'same-recorded-sequence',
    sources: [ref('/transitions/t1')],
  });
});

test('dangling, conflicted, cross-identity and unattributed links never become linked workflow evidence', () => {
  const result = reconstructWorkflows(input({
    identities: [identity('alice'), identity('bob'), identity('', 'unattributed')],
    exchanges: [...input().exchanges, exchange('unknown1', 'unattributed', 3)],
    transitions: [
      transition('missing', { triggerExchangeId: 'absent', resourceId: 'absent' }),
      transition('conflicted', { triggerExchangeId: 'conflict', resourceId: 'conflict' }),
      transition('wrong-user', { triggerExchangeId: 'b1', resourceId: null }),
      transition('unknown', { identityKey: 'unattributed', recordedIdentity: 'unconfigured', triggerExchangeId: 'unknown1', resourceId: null }),
      transition('order-mismatch', { captureSequence: 5 }),
    ],
    conflictedExchangeIds: ['conflict'], conflictedResourceIds: ['conflict'], conflictedTransitionIds: ['conflicted'],
  }));
  const transitions = new Map(result.workflows.flatMap((workflow) => workflow.transitions).map((entry) => [entry.transitionId, entry]));
  assert.equal(transitions.get('missing').trigger.state, 'missing');
  assert.equal(transitions.get('missing').resource.state, 'missing');
  assert.equal(transitions.get('conflicted').trigger.state, 'conflicted');
  assert.equal(transitions.get('conflicted').resource.state, 'conflicted');
  assert.equal(transitions.get('conflicted').recordState, 'conflicted');
  assert.equal(transitions.get('wrong-user').trigger.state, 'identity-conflict');
  assert.equal(transitions.get('wrong-user').resource.state, 'not-declared');
  assert.equal(transitions.get('unknown').trigger.state, 'unattributed');
  assert.equal(transitions.get('order-mismatch').sequenceRelation, 'different-recorded-sequence');
  assert.equal(result.hasReferenceProblems, true);
});

test('workflow output is deterministic and duplicate source references do not inflate its sequences', () => {
  const duplicate = exchange('a1', 'named:alice', 1);
  const original = input({ exchanges: [...input().exchanges, duplicate], transitions: [transition('t2'), transition('t1')] });
  const reversed = {
    ...original, identities: [...original.identities].reverse(), exchanges: [...original.exchanges].reverse(),
    resources: [...original.resources].reverse(), transitions: [...original.transitions].reverse(),
  };
  assert.deepEqual(reconstructWorkflows(original), reconstructWorkflows(reversed));
  const alice = reconstructWorkflows(original).workflows.find((workflow) => workflow.identityKey === 'named:alice');
  assert.deepEqual(alice.sequenceGroups[0].exchangeIds, ['a1']);
  assert.equal(alice.sequenceGroups[0].tied, false);
  assert.ok(alice.uncertainties.includes('tied-transition-sequence'));
});

test('unattributed labels retain their records without manufacturing a shared counter sequence', () => {
  const result = reconstructWorkflows(input({
    identities: [identity('', 'unattributed')],
    exchanges: [
      { ...exchange('unknown9', 'unattributed', 9), recordedIdentity: 'unconfigured-first' },
      { ...exchange('unknown1', 'unattributed', 1), recordedIdentity: 'unconfigured-second' },
      { ...exchange('unknown-other1', 'unattributed', 1), recordedIdentity: null },
    ],
    transitions: [
      transition('t-a', { identityKey: 'unattributed', recordedIdentity: 'unconfigured-first', captureSequence: 9, triggerExchangeId: 'unknown9' }),
      transition('t-z', { identityKey: 'unattributed', recordedIdentity: 'unconfigured-second', captureSequence: 1, triggerExchangeId: 'unknown1' }),
    ],
  }));
  const workflow = result.workflows[0];
  assert.deepEqual(workflow.sequenceGroups.map(({ captureSequence, exchangeIds, tied }) => ({ captureSequence, exchangeIds, tied })), [
    { captureSequence: null, exchangeIds: ['unknown-other1', 'unknown1', 'unknown9'], tied: false },
  ]);
  assert.deepEqual(workflow.gaps, []);
  assert.ok(workflow.uncertainties.includes('unknown-capture-sequence'));
  assert.ok(!workflow.uncertainties.includes('tied-capture-sequence'));
  assert.deepEqual(workflow.transitions.map(({ transitionId, captureSequence, sequenceRelation }) => ({ transitionId, captureSequence, sequenceRelation })), [
    { transitionId: 't-a', captureSequence: 9, sequenceRelation: 'unknown' },
    { transitionId: 't-z', captureSequence: 1, sequenceRelation: 'unknown' },
  ]);
});

test('Markdown exposes supported evidence and keeps private metadata inert without copying unknown payloads', () => {
  const dangerous = '名字`|\n<img src=x>\u202e';
  const metadataIdentity = identity(dangerous);
  const workflow = reconstructWorkflows(input({
    identities: [metadataIdentity],
    exchanges: [exchange('ex1', metadataIdentity.key, 1)],
    transitions: [transition('t1', { identityKey: metadataIdentity.key, fromState: dangerous, triggerExchangeId: 'ex1' })],
  }));
  const result = {
    status: 'completed',
    recorded: {
      runStatus: 'incomplete', failureRecorded: true,
      termination: { state: 'unavailable', code: null, source: null, sources: [] },
      findings: { availability: 'known', count: 0, sources: [ref('', 'findings')] },
      hypotheses: [], candidates: [], verifications: [], tasks: [], rejectedTasks: [],
    },
    counts: { exchanges: 1, routes: 0, identities: 1, duplicates: 0, conflicts: 0, rejectedRecords: 0 },
    sources: [], inputs: { rawRequested: false }, identities: [metadataIdentity], routes: [],
    exchanges: [{ ...exchange('ex1', metadataIdentity.key, 1), responseStatus: 200,
      normalizedResponse: 'usable', raw: { availability: 'not-supplied', association: 'not-assessed', response: 'unknown', sources: [] },
      request: 'NEVER_RENDER_HTTP', notes: 'NEVER_RENDER_NOTES', body: 'NEVER_RENDER_BODY',
    }],
    workflows: workflow.workflows,
    reasons: [{ code: 'known-empty', message: 'Zero findings were recorded.', sources: [ref('', 'findings')] }],
    diagnostics: [],
    extra: 'NEVER_RENDER_UNKNOWN',
  };
  const markdown = renderObservationMarkdown(result);
  assert.match(markdown, /Recorded findings: ` 0 `/);
  assert.match(markdown, /Recorded HTTP status/);
  assert.match(markdown, /` 200 `/);
  assert.match(markdown, /blackbox_blackboard\.json#\/transitions\/t1/);
  assert.match(markdown, /名字\\u0060\\u007c\\u000a<img src=x>\\u202e/);
  assert.doesNotMatch(markdown, /NEVER_RENDER_|\n<img|\u202e/);
  assert.match(markdown, /association, not independently verified state changes or causality/);
  assert.match(markdown, /application-wide coverage remain unassessed/);
  const unavailable = renderObservationMarkdown({
    ...result, recorded: { ...result.recorded, findings: { availability: 'unavailable', count: null, sources: [] } },
  });
  assert.match(unavailable, /Recorded finding count: unavailable/);
  assert.doesNotMatch(unavailable, /Recorded findings: ` 0 `/);
});
