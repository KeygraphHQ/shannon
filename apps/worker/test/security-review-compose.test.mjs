import assert from 'node:assert/strict';
import test from 'node:test';

const { analyzeCompose } = await import(
  process.env.SECURITY_REVIEW_COMPOSE_MODULE ?? '../dist/security-review/compose.js'
);

const service = (declaration) => ({ services: { app: declaration } });
const observations = (result) => result.issues.map(({ ruleId, classification, applicability, pointer }) => (
  { ruleId, classification, applicability, pointer }
));

// Expected semantics come from Compose services/interpolation docs and compose-go
// v2.9.1 loader/interpolate.go, not from the analyzer's normalization helpers.
for (const value of [true, 'true', 'TRUE', 'yes', 'On']) {
  test(`privileged declaration recognizes Compose boolean ${JSON.stringify(value)}`, () => {
    assert.deepEqual(observations(analyzeCompose(service({ privileged: value }))), [{
      ruleId: 'compose/privileged', classification: 'configuration-risk',
      applicability: 'declared', pointer: '/services/app/privileged',
    }]);
  });
}

test('omitted and explicit false values never become unsafe defaults', () => {
  for (const declaration of [{}, { privileged: false }, { privileged: 'false' }, { privileged: 'OFF' }, {
    network_mode: 'bridge', pid: 'private', cap_add: ['NET_ADMIN'], cap_drop: ['ALL'],
    security_opt: ['apparmor=docker-default', 'label=role:unconfined', 'no-new-privileges'],
  }]) {
    const result = analyzeCompose(service(declaration));
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.diagnostics, []);
  }
});

test('host namespace fields each retain their own evidence', () => {
  assert.deepEqual(observations(analyzeCompose(service({ network_mode: 'host', pid: 'host' }))), [
    { ruleId: 'compose/host-namespace', classification: 'configuration-risk', applicability: 'declared', pointer: '/services/app/network_mode' },
    { ruleId: 'compose/host-namespace', classification: 'configuration-risk', applicability: 'declared', pointer: '/services/app/pid' },
  ]);
});

test('both documented security_opt separators recognize the two supported profiles', () => {
  const result = analyzeCompose(service({ security_opt: [
    'seccomp=unconfined', 'seccomp:unconfined', 'apparmor=unconfined', 'apparmor:unconfined',
  ] }));
  assert.deepEqual(result.issues.map(({ ruleId, pointer }) => [ruleId, pointer]), [
    ['compose/unconfined-profile', '/services/app/security_opt/0'],
    ['compose/unconfined-profile', '/services/app/security_opt/1'],
    ['compose/unconfined-profile', '/services/app/security_opt/2'],
    ['compose/unconfined-profile', '/services/app/security_opt/3'],
  ]);
});

test('capabilities follow Docker case normalization and the valid CAP_SYS_ADMIN alias', () => {
  const result = analyzeCompose(service({ cap_add: ['ALL', 'SYS_ADMIN', 'CAP_SYS_ADMIN', 'sys_admin', 'all'] }));
  assert.deepEqual(result.issues.map(({ ruleId, pointer }) => [ruleId, pointer]), [
    ['compose/expanded-capabilities', '/services/app/cap_add/0'],
    ['compose/expanded-capabilities', '/services/app/cap_add/1'],
    ['compose/expanded-capabilities', '/services/app/cap_add/2'],
    ['compose/expanded-capabilities', '/services/app/cap_add/3'],
    ['compose/expanded-capabilities', '/services/app/cap_add/4'],
  ]);
});

test('invalid capability names are unknown without granting substring matches', () => {
  const result = analyzeCompose(service({ cap_add: ['CAP_ALL', 'SYS_ADMIN_EXTRA', ' ALL', 1] }));
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.diagnostics.map(({ pointer }) => pointer), [
    '/services/app/cap_add/0', '/services/app/cap_add/1', '/services/app/cap_add/2', '/services/app/cap_add/3',
  ]);
});

test('interpolation abstains even when defaults contain risky literals', () => {
  const result = analyzeCompose(service({
    privileged: '${PRIVILEGED:-true}', network_mode: '$NETWORK', pid: '${PID:-host}',
    security_opt: ['seccomp=${PROFILE:-unconfined}'], cap_add: ['${CAP:-SYS_ADMIN}'],
  }));
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.diagnostics.map(({ code, pointer }) => [code, pointer]), [
    ['compose/unresolved-interpolation', '/services/app/cap_add/0'],
    ['compose/unresolved-interpolation', '/services/app/network_mode'],
    ['compose/unresolved-interpolation', '/services/app/pid'],
    ['compose/unresolved-interpolation', '/services/app/privileged'],
    ['compose/unresolved-interpolation', '/services/app/security_opt/0'],
  ]);
});

test('interpolation in other active values is incomplete while escaped dollars remain literal', () => {
  const result = analyzeCompose(service({ image: 'example:${TAG}', command: ['echo', '$$HOME', '$-'], privileged: true }));
  assert.equal(result.issues.length, 1);
  assert.deepEqual(result.diagnostics.map(({ code, pointer }) => [code, pointer]), [
    ['compose/unresolved-interpolation', '/services/app/image'],
  ]);
});

test('composition and delegated service lifecycle stay unknown with partial observations retained', () => {
  const result = analyzeCompose({ include: ['must-not-read.yml'], services: {
    app: { extends: { file: 'must-not-read.yml', service: 'base' }, privileged: true },
    other: { provider: { type: 'must-not-execute' } },
  } });
  assert.equal(result.issues.length, 1);
  assert.deepEqual(result.diagnostics.map(({ code, pointer }) => [code, pointer]), [
    ['compose/unsupported-composition', '/include'],
    ['compose/unsupported-composition', '/services/app/extends'],
    ['compose/unsupported-composition', '/services/other/provider'],
  ]);
});

test('local namespace references remain declarations while external references stay unknown', () => {
  const result = analyzeCompose({ services: {
    app: { network_mode: 'service:base', pid: 'container:external' }, base: { network_mode: 'host' },
  } });
  assert.deepEqual(result.issues.map(({ pointer }) => pointer), ['/services/base/network_mode']);
  assert.deepEqual(result.diagnostics.map(({ code, pointer }) => [code, pointer]), [
    ['compose/unresolved-service-reference', '/services/app/pid'],
  ]);
});

test('missing local namespace references do not silently pass', () => {
  const result = analyzeCompose(service({ network_mode: 'service:missing', pid: 'service:missing' }));
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.diagnostics.map(({ code, pointer }) => [code, pointer]), [
    ['compose/unresolved-service-reference', '/services/app/network_mode'],
    ['compose/unresolved-service-reference', '/services/app/pid'],
  ]);
});

test('profile activation and non-Linux applicability never remove explicit declarations', () => {
  const result = analyzeCompose(service({ profiles: ['debug'], platform: 'windows/amd64', privileged: true, cap_add: ['SYS_ADMIN'] }));
  assert.equal(result.issues.length, 2);
  assert.deepEqual(result.diagnostics.map(({ code, pointer }) => [code, pointer]), [
    ['compose/platform-context', '/services/app/platform'],
  ]);
  assert.ok(result.issues.every(({ applicability, message, remediation }) => applicability === 'declared' && message.length > 0 && remediation.length > 0));
});

test('invalid checked shapes and unknown schema never yield a clean result', () => {
  for (const document of [null, [], {}, { services: [] }, service(null), service({ privileged: 1 }),
    service({ security_opt: { seccomp: 'unconfined' } }), service({ cap_add: 'ALL' }),
    service({ network_mode: true }), service({ pid: [] }), service({ privilegedd: true }),
    { service: { app: { privileged: true } } }, service({ profiles: 'debug' }), service({ platform: {} })]) {
    const result = analyzeCompose(document);
    assert.deepEqual(result.issues, []);
    assert.ok(result.diagnostics.length > 0, JSON.stringify(document));
  }
});

test('unknown security options and malformed supported option syntax are incomplete', () => {
  for (const option of ['seccomp', 'apparmor=', 'seccomp =unconfined', 'SECCOMP=unconfined', 'future=unconfined', 1]) {
    const result = analyzeCompose(service({ security_opt: [option] }));
    assert.deepEqual(result.issues, []);
    assert.ok(result.diagnostics.length > 0, String(option));
  }
});

test('source text outside assessed service fields does not invent findings', () => {
  const result = analyzeCompose({
    'x-template': { privileged: true, cap_add: ['SYS_ADMIN'] },
    services: { app: {
      image: 'benign', env_file: 'not-read.env',
      build: { context: '.', privileged: false }, post_start: [{ command: 'true', privileged: false }],
      labels: { privileged: 'true', security_opt: 'seccomp=unconfined', cap_add: 'ALL' },
    } },
  });
  assert.deepEqual(result, { issues: [], diagnostics: [] });
});

test('build and hook privilege contexts have explicit unsupported coverage at their own pointers', () => {
  const result = analyzeCompose(service({
    build: { context: '.', privileged: true }, post_start: [{ command: 'true', privileged: true }],
  }));
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.diagnostics.map(({ code, pointer, ruleIds }) => ({ code, pointer, ruleIds })), [
    { code: 'compose/unsupported-context', pointer: '/services/app/build/privileged', ruleIds: ['compose/privileged'] },
    { code: 'compose/unsupported-context', pointer: '/services/app/post_start/0/privileged', ruleIds: ['compose/privileged'] },
  ]);
});

test('evidence uses RFC 6901 escaping and diagnostics do not disclose source values', () => {
  const secret = 'SENTINEL_PRIVATE_VALUE';
  const document = { services: { 'app~/name': { privileged: true, cap_add: [secret] } } };
  const before = JSON.stringify(document);
  const result = analyzeCompose(document);
  assert.equal(result.issues[0].pointer, '/services/app~0~1name/privileged');
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(JSON.stringify(document), before);
  assert.deepEqual(analyzeCompose(document), result);
});
