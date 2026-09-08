import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AccessValidationError,
  accessValidationResolvedDigest,
  accessValidationSelectionDigest,
  assertResolvedAccessValidationScope,
  createAccessValidationSelection,
  parseResolvedAccessValidation,
  resolveAccessValidationSelection,
} from '../dist/blackbox-observation/access-validation.js';

const SOURCE_MANIFEST = [
  {
    source: 'traffic',
    file: 'traffic_inventory.json',
    availability: 'available',
    sha256: '1'.repeat(64),
    bytes: 120,
  },
  {
    source: 'blackboard',
    file: 'blackbox_blackboard.json',
    availability: 'available',
    sha256: '2'.repeat(64),
    bytes: 240,
  },
  {
    source: 'raw',
    file: 'ex_aaaaaaaaaaaaaaaaaaaaaaaa.json',
    exchangeId: 'ex_aaaaaaaaaaaaaaaaaaaaaaaa',
    availability: 'available',
    sha256: '3'.repeat(64),
    bytes: 360,
  },
  {
    source: 'raw',
    file: 'ex_bbbbbbbbbbbbbbbbbbbbbbbb.json',
    exchangeId: 'ex_bbbbbbbbbbbbbbbbbbbbbbbb',
    availability: 'available',
    sha256: '4'.repeat(64),
    bytes: 480,
  },
];

function identity(key, exchangeId) {
  return {
    identityKey: key,
    state: 'observed',
    records: 1,
    usableResponses: 1,
    unavailableResponses: 0,
    associatedRawRequests: 1,
    usableRawResponses: 1,
    unavailableRawResponses: 0,
    statusValues: [200],
    fullResponseFingerprints: [`sha256:${key.at(-1).repeat(64)}`],
    variable: false,
    sources: [
      { source: 'blackboard', pointer: `/exchanges/${key.endsWith('victim') ? 0 : 1}` },
      { source: 'raw', pointer: '', exchangeId },
    ],
  };
}

function result(overrides = {}) {
  const victim = identity('named:victim', 'ex_aaaaaaaaaaaaaaaaaaaaaaaa');
  const attacker = identity('named:attacker', 'ex_bbbbbbbbbbbbbbbbbbbbbbbb');
  const comparison = {
    comparisonId: 'comparison-000002',
    groupId: 'group-0001',
    identityKeys: ['named:attacker', 'named:victim'],
    basis: 'exact-saved-target-body',
    evidenceStrength: 'exact-saved-target-body-with-response-evidence',
    requestClass: 'request-class-0001',
    eligibility: 'eligible',
    completeness: 'complete',
    statusRelation: 'same',
    fingerprintRelation: 'different',
    bodyRelation: 'different',
    contentTypeRelation: 'same',
    identityValues: [attacker, victim],
    signals: ['recorded-response-difference'],
    unknowns: ['recorded-owner-authenticity-unassessed'],
    recordedOwnerContext: [
      {
        resourceId: 'resource-victim-memo',
        recordedOwnerIdentity: 'victim',
        linkedExchangeIds: ['ex_aaaaaaaaaaaaaaaaaaaaaaaa'],
        sources: [
          { source: 'blackboard', pointer: '/resources/0' },
          { source: 'blackboard', pointer: '/exchanges/0' },
        ],
      },
    ],
    sources: [...attacker.sources, ...victim.sources, { source: 'blackboard', pointer: '/resources/0' }],
    ...overrides,
  };
  return {
    schemaVersion: 1,
    kind: 'offline-blackbox-cross-identity-triage',
    status: 'completed',
    limits: {
      maxNativeBytes: 1,
      maxRawBytes: 1,
      maxTotalBytes: 1,
      maxDepth: 1,
      maxNodes: 1,
      maxExchanges: 1,
      maxRoutes: 1,
      maxIdentities: 2,
      maxTransitions: 1,
      maxRecords: 1,
      maxRawFiles: 2,
      maxOutputBytes: 1_000_000,
      timeoutMs: 1_000,
      maxComparisons: 2,
      maxSourcesPerComparison: 20,
    },
    sources: SOURCE_MANIFEST,
    scope: {
      basis: 'supplied-saved-records',
      authorization: 'not-assessed',
      sessionValidity: 'not-assessed',
      expectedPolicy: 'unknown',
      semanticEquivalence: 'not-established',
      applicationCoverage: 'unknown',
    },
    counts: {
      groups: 1,
      comparisons: 1,
      recordedComparisons: 0,
      strongComparisons: 1,
      insufficientComparisons: 0,
    },
    identities: [
      {
        key: 'named:attacker',
        kind: 'named',
        name: 'attacker',
        role: 'member',
        authenticated: true,
        sources: [{ source: 'blackboard', pointer: '/identities/0' }],
      },
      {
        key: 'named:victim',
        kind: 'named',
        name: 'victim',
        role: 'member',
        authenticated: true,
        sources: [{ source: 'blackboard', pointer: '/identities/1' }],
      },
    ],
    groups: [
      {
        groupId: 'group-0001',
        routeSignature: 'route_memo_get',
        method: 'GET',
        origin: 'https://target.example',
        path: '/api/memos/fixture-id',
        identityCells: [attacker, victim],
        sources: [...attacker.sources, ...victim.sources],
      },
    ],
    comparisons: [comparison],
    diagnostics: [],
  };
}

test('creates and resolves one owner-oriented strong GET selection', () => {
  const comparison = result();
  const selection = createAccessValidationSelection(comparison, 'comparison-000002');

  assert.deepEqual(Object.keys(selection).sort(), [
    'attackerIdentityKey',
    'comparisonId',
    'comparisonSha256',
    'kind',
    'schemaVersion',
    'sourceManifestSha256',
    'victimIdentityKey',
  ]);
  assert.match(selection.comparisonSha256, /^[a-f0-9]{64}$/);
  assert.match(selection.sourceManifestSha256, /^[a-f0-9]{64}$/);
  const resolved = resolveAccessValidationSelection(selection, comparison);
  assert.match(accessValidationSelectionDigest(resolved), /^[a-f0-9]{64}$/);
  const { selectionDigest: _selectionDigest, ...resolvedPayload } = resolved;
  assert.equal(accessValidationResolvedDigest(resolvedPayload), resolved.selectionDigest);

  assert.deepEqual(resolved, {
    schemaVersion: 1,
    kind: 'blackbox-cross-identity-validation',
    comparisonSha256: selection.comparisonSha256,
    sourceManifestSha256: selection.sourceManifestSha256,
    selectionDigest: accessValidationSelectionDigest(resolved),
    comparisonId: 'comparison-000002',
    routeSignature: 'route_memo_get',
    method: 'GET',
    origin: 'https://target.example',
    routePathPrefix: '/api/memos',
    requestClass: 'request-class-0001',
    recordedRole: 'member',
    victimIdentity: 'victim',
    attackerIdentity: 'attacker',
  });
});

test('rejects report, corpus, and oriented-identity drift', () => {
  const comparison = result();
  const selection = createAccessValidationSelection(comparison, 'comparison-000002');

  for (const mutation of [
    { ...selection, comparisonSha256: 'f'.repeat(64) },
    { ...selection, sourceManifestSha256: 'e'.repeat(64) },
    { ...selection, victimIdentityKey: 'named:attacker', attackerIdentityKey: 'named:victim' },
  ]) {
    assert.throws(() => resolveAccessValidationSelection(mutation, comparison), AccessValidationError);
  }
});

test('strictly parses one raw-free selector with only a bounded route prefix', () => {
  const comparison = result();
  const selection = createAccessValidationSelection(comparison, 'comparison-000002');
  const resolved = resolveAccessValidationSelection(selection, comparison);

  assert.deepEqual(parseResolvedAccessValidation(resolved), resolved);
  assert.throws(() => parseResolvedAccessValidation({ ...resolved, bundlePath: 'private' }), AccessValidationError);
  assert.throws(
    () => parseResolvedAccessValidation({ ...resolved, selectionDigest: resolved.selectionDigest.toUpperCase() }),
    AccessValidationError,
  );
  assert.throws(
    () => parseResolvedAccessValidation({ ...resolved, routeSignature: 'route_transport_drift' }),
    AccessValidationError,
  );
  assert.throws(() => {
    const { recordedRole: _removed, ...missingRole } = resolved;
    parseResolvedAccessValidation(missingRole);
  }, AccessValidationError);
});

test('rejects target, identity, and current-role drift before live use', () => {
  const comparison = result();
  const selection = createAccessValidationSelection(comparison, 'comparison-000002');
  const resolved = resolveAccessValidationSelection(selection, comparison);
  const identities = [
    { name: 'victim', role: 'member' },
    { name: 'attacker', role: 'member' },
  ];

  assert.deepEqual(assertResolvedAccessValidationScope(resolved, 'https://target.example', identities), resolved);
  assert.throws(
    () => assertResolvedAccessValidationScope(resolved, 'https://other.example', identities),
    AccessValidationError,
  );
  assert.throws(
    () => assertResolvedAccessValidationScope(resolved, 'https://target.example', identities.slice(0, 1)),
    AccessValidationError,
  );
  assert.throws(
    () =>
      assertResolvedAccessValidationScope(resolved, 'https://target.example', [
        identities[0],
        { name: 'attacker', role: 'administrator' },
      ]),
    AccessValidationError,
  );
});

test('rejects passive, incomplete, unsafe, shared, and ambiguously owned selections', () => {
  for (const overrides of [
    { basis: 'recorded-route-metadata', requestClass: null },
    { completeness: 'partial' },
    { evidenceStrength: 'exact-saved-target-body-request-only' },
    { signals: ['insufficient-evidence'] },
    { unknowns: ['raw-response-unavailable', 'recorded-owner-authenticity-unassessed'] },
    { unknowns: ['shared-raw-source', 'recorded-owner-authenticity-unassessed'] },
    {
      recordedOwnerContext: [
        {
          resourceId: 'resource-one',
          recordedOwnerIdentity: 'victim',
          linkedExchangeIds: ['ex_aaaaaaaaaaaaaaaaaaaaaaaa'],
          sources: [{ source: 'blackboard', pointer: '/resources/0' }],
        },
        {
          resourceId: 'resource-two',
          recordedOwnerIdentity: 'attacker',
          linkedExchangeIds: ['ex_bbbbbbbbbbbbbbbbbbbbbbbb'],
          sources: [{ source: 'blackboard', pointer: '/resources/1' }],
        },
      ],
    },
    {
      recordedOwnerContext: [
        {
          resourceId: 'resource-one',
          recordedOwnerIdentity: 'victim',
          linkedExchangeIds: ['ex_aaaaaaaaaaaaaaaaaaaaaaaa'],
          sources: [{ source: 'blackboard', pointer: '/resources/0' }],
        },
        {
          resourceId: 'resource-two',
          recordedOwnerIdentity: 'victim',
          linkedExchangeIds: ['ex_aaaaaaaaaaaaaaaaaaaaaaaa'],
          sources: [{ source: 'blackboard', pointer: '/resources/1' }],
        },
      ],
    },
  ]) {
    assert.throws(() => createAccessValidationSelection(result(overrides), 'comparison-000002'), AccessValidationError);
  }

  const unsafe = result();
  unsafe.groups[0].method = 'POST';
  assert.throws(() => createAccessValidationSelection(unsafe, 'comparison-000002'), AccessValidationError);

  const partial = result();
  partial.status = 'partial';
  assert.throws(() => createAccessValidationSelection(partial, 'comparison-000002'), AccessValidationError);

  const partialRaw = result();
  const partialRawValues = partialRaw.comparisons[0].identityValues[0];
  partialRawValues.records = 2;
  partialRawValues.usableResponses = 2;
  partialRawValues.usableRawResponses = 2;
  assert.throws(() => createAccessValidationSelection(partialRaw, 'comparison-000002'), AccessValidationError);

  const duplicateIdentity = result();
  duplicateIdentity.identities.push({ ...duplicateIdentity.identities[0] });
  assert.throws(() => createAccessValidationSelection(duplicateIdentity, 'comparison-000002'), AccessValidationError);
});
