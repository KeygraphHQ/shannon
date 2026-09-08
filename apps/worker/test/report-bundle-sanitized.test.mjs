import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSanitizedArtifacts,
  validateSanitizedArtifacts,
} from '../dist/reporting/sanitized-report.js';

const SECRET = 'PRIVATE-SENTINEL-78cbeebd';
const CODE_HASH = 'b83fabc0'.repeat(8);
const REVISION = 'd53faca0'.repeat(5);
const DATE = '2026-08-30T12:34:56.789Z';
const privateText = (name) => `${SECRET}-${name}`;
const id = (name) => privateText(`id-${name}`);
const provenance = () => ({ actor: 'blackbox-action', taskId: id('ephemeral-task'), baseRevision: 1, [privateText('extension-key')]: privateText('extension-value') });
const observation = () => ({ condition: { type: 'body_contains', marker: privateText('proof-marker') }, passed: true, observedMarkerDigest: CODE_HASH, proofSourceRequestDigest: CODE_HASH, proofSentRequestDigest: CODE_HASH, observedTransitionId: id('transition'), verificationExchangeId: id('attack') });
const sequence = () => ({
  actionId: id('action'),
  steps: [{ stepId: id('step'), sourceExchangeId: id('baseline'), actor: id('attacker'), mutations: [
    { type: 'set_header', name: privateText('header'), value: privateText('credential') },
    { type: 'set_path', path: `/${privateText('path')}` },
    { type: 'set_json_pointer', pointer: `/${privateText('pointer')}`, value: { [privateText('body-key')]: privateText('body-value') } },
  ] }],
  proofCondition: { type: 'body_contains', marker: privateText('proof-marker') },
});

function fixture() {
  const exchanges = ['baseline', 'attack'].map((name, index) => ({
    exchangeId: id(name), routeSignature: privateText('route'), identity: id(index === 0 ? 'victim' : 'attacker'),
    captureSequence: index + 1, method: 'GET', origin: `https://${SECRET}.example`, path: `/${privateText('path')}`,
    queryKeys: [privateText('query')], bodyShape: privateText('body-shape'), requestContentType: privateText('request-content-type'),
    responseStatus: 200, responseContentType: privateText('response-content-type'), responseFingerprint: privateText('fingerprint'),
    candidateObjectReferences: [privateText('object-id')], provenance: provenance(),
    [privateText('exchange-key')]: privateText('exchange-extension'),
  }));
  const blackboard = {
    schemaVersion: 1, revision: 30, targetOrigin: `https://${SECRET}.example`, runStatus: 'incomplete', failure: privateText('failure'),
    identities: ['victim', 'attacker'].map((name) => ({ name: id(name), role: privateText('role'), authenticated: true })),
    exchanges,
    resources: [{ resourceId: id('resource'), resourceType: privateText('resource-type'), objectReferences: [privateText('resource-object')], ownerIdentity: id('victim'), visibility: 'private', evidence: [{ kind: 'exchange', id: id('baseline') }], provenance: provenance() }],
    transitions: [{ transitionId: id('transition'), identity: id('victim'), fromState: privateText('state-from'), toState: privateText('state-to'), triggerExchangeId: id('baseline'), captureSequence: 1, resourceId: id('resource'), provenance: provenance() }],
    hypotheses: ['verified', 'open', 'queued', 'tested', 'blocked'].map((status, index) => ({ hypothesisId: id(`hypothesis-${index}`), kind: 'horizontal', status, summary: privateText('hypothesis-summary'), preconditions: [privateText('precondition')], attackerCapability: privateText('capability'), evidence: [{ kind: 'exchange', id: id('baseline') }], priority: 'high', provenance: provenance() })),
    actions: [{ actionId: id('action'), hypothesisId: id('hypothesis-0'), sequence: sequence(), status: 'completed', exchangeIds: [id('attack')], observation: observation(), provenance: provenance() }],
    candidateProofs: [{ candidateId: id('candidate'), hypothesisId: id('hypothesis-0'), victimIdentity: id('victim'), attackerIdentity: id('attacker'), victimResourceId: id('resource'), baselineExchangeId: id('baseline'), actionId: id('action'), verificationSourceExchangeId: id('attack'), demonstratedAction: privateText('candidate-action'), concreteEffect: privateText('candidate-effect'), affectedParty: 'users', preconditions: [privateText('candidate-precondition')], provenance: provenance() }],
    verifications: [{ verificationId: id('verifier'), candidateId: id('candidate'), freshStateRefs: [{ identity: id('attacker'), fresh: true }], replayActionIds: [id('ephemeral-replay-action')], replayExchangeIds: [id('attack')], observation: observation(), failureReason: null, verdict: 'verified', demonstratedAction: privateText('verifier-action'), concreteEffect: privateText('verifier-effect'), affectedParty: 'users' }],
    tasks: ['completed', 'pending', 'running'].map((status, index) => ({ taskId: id(`task-${index}`), kind: 'action', objective: privateText('task-objective'), evidence: [{ kind: 'proof', id: id('candidate') }], identityLease: id('attacker'), hypothesisId: id('hypothesis-0'), status, replayPlan: sequence() })),
    rejectedTasks: [{ task: { taskId: id('rejected'), evidence: [{ kind: 'exchange', id: id('invalid-reference') }], objective: privateText('rejected-objective') }, reason: privateText('rejected-reason') }],
    runMetadata: {
      schemaVersion: 1, runId: id('run'), historyComplete: true, currentAttemptId: id('attempt-z'), resultAttemptId: id('attempt-A'),
      attempts: [
        { attemptId: id('attempt-z'), workflowId: id('workflow-z'), resumedFromAttemptId: id('attempt-A'), startedAt: DATE, endedAt: null, code: { revision: null, dirty: null, sha256: null }, configuredModel: privateText('repair-model'), termination: null },
        { attemptId: id('attempt-A'), workflowId: id('workflow-A'), resumedFromAttemptId: null, startedAt: DATE, endedAt: DATE, code: { revision: REVISION, dirty: false, sha256: CODE_HASH }, configuredModel: privateText('original-model'), termination: { code: 'limit_reached', source: 'workflow' }, [privateText('attempt-extension-key')]: privateText('attempt-extension-value') },
      ],
      [privateText('metadata-extension-key')]: privateText('metadata-extension-value'),
    },
    [privateText('blackboard-extension-key')]: privateText('blackboard-extension-value'),
  };
  const findings = [{ findingId: id('finding'), hypothesisId: id('hypothesis-0'), victimIdentity: id('victim'), attackerIdentity: id('attacker'), baselineExchangeId: id('baseline'), attackExchangeIds: [id('attack')], verificationExchangeIds: [id('attack')], replaySequence: sequence(), demonstratedAction: privateText('finding-action'), concreteEffect: privateText('finding-effect'), affectedParty: 'users', impactStatement: privateText('impact-statement'), preconditions: [privateText('finding-precondition')], verifierResultId: id('verifier'), [privateText('finding-extension-key')]: privateText('finding-extension-value') }];
  return { blackboard, inventory: structuredClone(exchanges), findings, markdown: `# ${privateText('markdown')}\n${privateText('markdown-credential')}` };
}

const canonical = (value) => `${JSON.stringify(value, null, 2)}\n`;
function altered(files, change) {
  const value = JSON.parse(files['report.json']);
  change(value);
  return { ...files, 'report.json': canonical(value) };
}

test('sanitized projection contains no seeded private bytes and preserves the original evidence', () => {
  const source = fixture();
  const before = structuredClone(source);
  const files = buildSanitizedArtifacts(source);
  assert.deepEqual(Object.keys(files).sort(), ['report.json', 'report.md']);
  for (const bytes of Object.values(files)) {
    for (const sensitive of [SECRET, CODE_HASH, REVISION, DATE]) assert.equal(bytes.includes(sensitive), false, 'private bytes leaked');
    assert.doesNotMatch(bytes, /https:\/\/|set_header|body_contains|impactStatement|replaySequence|reverseMapping/);
  }
  assert.deepEqual(source, before);
  assert.deepEqual(validateSanitizedArtifacts(files), []);
  assert.deepEqual(buildSanitizedArtifacts(source), files);
  assert.match(files['report.md'], /Private details are omitted/);
  assert.match(files['report.md'], /coverage is unknown/);
  assert.match(files['report.md'], /do not establish that an application is secure/);
});

test('aliases preserve findings, evidence, identities and result-attempt lineage', () => {
  const report = JSON.parse(buildSanitizedArtifacts(fixture())['report.json']);
  const byKind = (kind) => report.evidence.filter((entry) => entry.kind === kind);
  const finding = report.findings[0];
  const verifier = report.verifications.find((entry) => entry.id === finding.verifier);
  assert.equal(finding.outcome, 'verified');
  assert.equal(verifier.verdict, 'verified');
  assert.equal(verifier.candidate, byKind('proof')[0].id);
  assert.equal(finding.attacker, 'identity-1');
  assert.equal(finding.victim, 'identity-2');
  assert.equal(byKind('resource')[0].identity, finding.victim);
  assert.equal(byKind('resource')[0].references[0], byKind('exchange').find((entry) => entry.identity === finding.victim).id);
  assert.equal(byKind('proof')[0].references.includes(byKind('action')[0].id), true);
  assert.equal(finding.evidence.length, 2);
  assert.deepEqual(report.counts.unresolved, { hypotheses: 4, pendingOrRunningTasks: 2, blockedVerifications: 0 });
  assert.equal(report.counts.observed.trafficRecords, 2);
  assert.equal(report.counts.observed.routeGroups, 1);
  assert.equal(report.counts.observed.routeIdentityPairs, 2);
  assert.equal(report.counts.observed.rejectedProposals, 1);
  assert.equal(report.provenance.resultAttempt, 'attempt-1');
  assert.equal(report.provenance.currentAttempt, 'attempt-2');
  assert.equal(report.provenance.attempts[1].parent, 'attempt-1');
  assert.deepEqual(report.provenance.attempts[0].termination, { reason: 'limit_reached', source: 'workflow' });
  assert.equal(report.provenance.attempts[1].termination, null);
  assert.equal(report.provenance.attempts[0].availability.codeDigest, true);
  assert.equal(report.provenance.attempts[1].availability.codeDigest, false);
  assert.equal(report.provenance.attempts[1].availability.endedAt, false);
});

test('source array ordering does not affect generated aliases or provenance', () => {
  const source = fixture();
  const expected = buildSanitizedArtifacts(source);
  for (const value of Object.values(source.blackboard)) if (Array.isArray(value)) value.reverse();
  source.blackboard.runMetadata.attempts.reverse();
  source.inventory.reverse();
  source.findings.reverse();
  assert.deepEqual(buildSanitizedArtifacts(source), expected);
});

test('legacy provenance remains unavailable and unconfigured anonymous traffic receives an alias', () => {
  const source = fixture();
  delete source.blackboard.runMetadata;
  source.blackboard.exchanges.push({ ...source.blackboard.exchanges[0], exchangeId: id('anonymous-exchange'), identity: 'anonymous' });
  const files = buildSanitizedArtifacts(source);
  const report = JSON.parse(files['report.json']);
  assert.deepEqual(report.provenance, { available: false, run: null, historyComplete: null, currentAttempt: null, resultAttempt: null, attempts: [] });
  assert.equal(report.identities.filter((identity) => !identity.configured).length, 1);
  assert.equal(report.identities.find((identity) => !identity.configured).authenticated, null);
  assert.equal(report.counts.observed.configuredIdentities, 2);
  assert.equal(report.counts.observed.identitiesWithTraffic, 3);
  assert.deepEqual(validateSanitizedArtifacts(files), []);
});

test('private text is never passed through when it occupies an expected enum field', () => {
  const source = fixture();
  source.blackboard.runStatus = privateText('unrecognized-status');
  assert.throws(() => buildSanitizedArtifacts(source), (error) => !error.message.includes(SECRET));
});

test('strict public schema rejects unknown fields, raw strings and inconsistent graph data', async (t) => {
  const files = buildSanitizedArtifacts(fixture());
  const cases = {
    'unknown top-level field': (value) => { value[privateText('key')] = privateText('value'); },
    'unknown nested field': (value) => { value.provenance.attempts[0].availability[privateText('key')] = true; },
    'raw original identity': (value) => { value.identities[0].id = id('attacker'); },
    'unknown lifecycle status': (value) => { value.hypotheses[0].status = privateText('status'); },
    'duplicate alias': (value) => { value.evidence[1].id = value.evidence[0].id; },
    'dangling evidence': (value) => { value.findings[0].evidence = ['evidence-9000']; },
    'dangling identity': (value) => { value.findings[0].victim = 'identity-9000'; },
    'dangling route': (value) => { value.evidence[0].route = 'route-9000'; },
    'duplicate references': (value) => { value.findings[0].evidence.push(value.findings[0].evidence[0]); },
    'non-exchange finding evidence': (value) => { value.findings[0].evidence = [value.evidence.find((entry) => entry.kind === 'proof').id]; },
    'wrong verification candidate kind': (value) => { value.verifications[0].candidate = value.evidence[0].id; },
    'nonverified finding verifier': (value) => { value.verifications[0].verdict = 'blocked'; },
    'finding omits its verifier exchanges': (value) => { value.findings[0].evidence = value.findings[0].evidence.filter((ref) => !value.verifications[0].evidence.includes(ref)); },
    'transition omits its triggering exchange': (value) => { const entry = value.evidence.find((entry) => entry.kind === 'transition'); entry.references = entry.references.filter((ref) => value.evidence.find((entry) => entry.id === ref).kind !== 'exchange'); },
    'transition points to a proof': (value) => { value.evidence.find((entry) => entry.kind === 'transition').references = [value.evidence.find((entry) => entry.kind === 'proof').id]; },
    'action points to a resource': (value) => { value.evidence.find((entry) => entry.kind === 'action').references = [value.evidence.find((entry) => entry.kind === 'resource').id]; },
    'proof omits its source action': (value) => { const entry = value.evidence.find((entry) => entry.kind === 'proof'); entry.references = entry.references.filter((ref) => value.evidence.find((entry) => entry.id === ref).kind !== 'action'); },
    'mismatched traffic count': (value) => { value.counts.observed.trafficRecords += 1; },
    'mismatched rejected count': (value) => { value.counts.observed.rejectedProposals += 1; },
    'mismatched unresolved count': (value) => { value.counts.unresolved.hypotheses = 0; },
    'mismatched identity observation': (value) => { value.identities[0].observed = false; },
    'negative count': (value) => { value.counts.observed.findings = -1; },
    'unsafe count': (value) => { value.counts.observed.findings = Number.MAX_SAFE_INTEGER + 1; },
    'cyclic attempt lineage': (value) => { value.provenance.attempts[0].parent = value.provenance.attempts[1].id; },
    'dangling attempt lineage': (value) => { value.provenance.attempts[0].parent = 'attempt-999'; },
    'dangling result attempt': (value) => { value.provenance.resultAttempt = 'attempt-999'; },
    'multiple lineage roots': (value) => { value.provenance.attempts[1].parent = null; },
    'branching attempt lineage': (value) => { value.provenance.attempts.push({ ...structuredClone(value.provenance.attempts[1]), id: 'attempt-3' }); value.provenance.currentAttempt = 'attempt-3'; },
    'current attempt is not the leaf': (value) => { value.provenance.currentAttempt = 'attempt-1'; },
    'result attribution has no terminal record': (value) => { value.provenance.resultAttempt = 'attempt-2'; },
    'termination has no recorded end': (value) => { value.provenance.attempts[0].availability.endedAt = false; },
    'end has no recorded termination': (value) => { value.provenance.attempts[1].availability.endedAt = true; },
    'result outcome disagrees with run': (value) => { value.provenance.attempts[0].termination.reason = 'completed'; },
    'result outcome has nonworkflow source': (value) => { value.provenance.attempts[0].termination.source = 'worker'; },
    'unavailable provenance with details': (value) => { value.provenance.available = false; },
  };
  for (const [name, change] of Object.entries(cases)) {
    await t.test(name, () => {
      const issues = validateSanitizedArtifacts(altered(files, change));
      assert.equal(issues.length > 0, true);
      assert.equal(JSON.stringify(issues).includes(SECRET), false);
      assert.notEqual(issues[0].code, 'inconsistent_sanitized_markdown', 'invalid JSON must be rejected independently of Markdown');
    });
  }
});

test('verifier exchanges cannot be replaced by unrelated evidence hidden from Markdown', () => {
  const source = fixture();
  const extra = { ...source.blackboard.exchanges[0], exchangeId: id('unrelated-exchange') };
  source.blackboard.exchanges.push(extra);
  source.inventory.push(structuredClone(extra));
  const files = buildSanitizedArtifacts(source);
  const tampered = altered(files, (value) => {
    const unused = value.evidence.find((entry) => entry.kind === 'exchange' && !value.findings[0].evidence.includes(entry.id));
    value.verifications[0].evidence = [unused.id];
  });
  assert.equal(tampered['report.md'], files['report.md']);
  assert.equal(validateSanitizedArtifacts(tampered)[0].code, 'inconsistent_sanitized_summary');
});

test('both companions are required and Markdown must equal the canonical projection', () => {
  const files = buildSanitizedArtifacts(fixture());
  assert.equal(validateSanitizedArtifacts({ 'report.json': files['report.json'] })[0].code, 'missing_artifact');
  assert.equal(validateSanitizedArtifacts({ 'report.md': files['report.md'] })[0].code, 'missing_artifact');
  assert.equal(validateSanitizedArtifacts({ ...files, 'report.json': privateText('malformed-json') })[0].code, 'malformed_json');
  const issues = validateSanitizedArtifacts({ ...files, 'report.md': `${files['report.md']}\n${privateText('markdown-leak')}` });
  assert.equal(issues[0].code, 'inconsistent_sanitized_markdown');
  assert.equal(JSON.stringify(issues).includes(SECRET), false);
});

test('canonical JSON rejects hidden strings in duplicate keys even if parsed values are safe', () => {
  const files = buildSanitizedArtifacts(fixture());
  const duplicate = files['report.json'].replace('"kind": "sanitized-summary",', `"kind": "${privateText('hidden-value')}",\n  "kind": "sanitized-summary",`);
  assert.equal(JSON.parse(duplicate).kind, 'sanitized-summary');
  const issues = validateSanitizedArtifacts({ ...files, 'report.json': duplicate });
  assert.equal(issues[0].code, 'noncanonical_sanitized_json');
  assert.equal(JSON.stringify(issues).includes(SECRET), false);
});

test('empty bundles produce explicit zero observations without inventing provenance', () => {
  const blackboard = { runStatus: 'complete', failure: null, identities: [], exchanges: [], resources: [], transitions: [], hypotheses: [], actions: [], candidateProofs: [], verifications: [], tasks: [], rejectedTasks: [] };
  const files = buildSanitizedArtifacts({ blackboard, inventory: [], findings: [], markdown: privateText('discarded-markdown') });
  const report = JSON.parse(files['report.json']);
  assert.equal(Object.values(report.counts.observed).every((count) => count === 0), true);
  assert.equal(report.provenance.available, false);
  assert.deepEqual(validateSanitizedArtifacts(files), []);
});
