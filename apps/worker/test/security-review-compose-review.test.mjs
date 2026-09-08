import assert from 'node:assert/strict';
import test from 'node:test';

const { analyzeCompose } = await import(
  process.env.SECURITY_REVIEW_COMPOSE_MODULE ?? '../dist/security-review/compose.js'
);

// Independently authored from the goal's declared-configuration scope and Docker's
// primary service/build documentation; the Compose rule author did not write these.
test('independent review: a literal profile does not prevent completing declaration checks', () => {
  // https://docs.docker.com/reference/compose-file/services/#profiles
  const result = analyzeCompose({ services: { debug: { image: 'example', profiles: ['debug'], privileged: true } } });
  assert.deepEqual(result.issues.map(({ ruleId, pointer, applicability }) => ({ ruleId, pointer, applicability })), [
    { ruleId: 'compose/privileged', pointer: '/services/debug/privileged', applicability: 'declared' },
  ]);
  assert.deepEqual(result.diagnostics, []);
});

test('independent review: a valid local service namespace is not an explicit host declaration', () => {
  // https://docs.docker.com/reference/compose-file/services/#network_mode
  const result = analyzeCompose({ services: {
    proxy: { image: 'example' }, worker: { image: 'example', network_mode: 'service:proxy' },
  } });
  assert.deepEqual(result, { issues: [], diagnostics: [] });
});

test('independent review: lifecycle hook privilege requests cannot silently count as checked', () => {
  // https://docs.docker.com/reference/compose-file/services/#post_start
  // https://docs.docker.com/reference/compose-file/services/#pre_stop
  for (const hook of ['post_start', 'pre_stop', 'pre_start']) {
    const pointer = `/services/worker/${hook}/0/privileged`;
    const result = analyzeCompose({ services: { worker: {
      image: 'example', [hook]: [{ command: ['true'], privileged: true }],
    } } });
    assert.ok(
      result.issues.some((issue) => issue.ruleId === 'compose/privileged' && issue.pointer === pointer)
      || result.diagnostics.some((diagnostic) => diagnostic.ruleIds.includes('compose/privileged')),
      'An explicit hook privilege declaration requires either its own observation or explicit unsupported coverage.',
    );
  }
});

test('independent review: build privilege requests cannot silently count as checked', () => {
  // https://docs.docker.com/reference/compose-file/build/#privileged
  const result = analyzeCompose({ services: { worker: { build: { context: '.', privileged: true } } } });
  assert.ok(
    result.issues.some((issue) => issue.ruleId === 'compose/privileged' && issue.pointer === '/services/worker/build/privileged')
    || result.diagnostics.some((diagnostic) => diagnostic.ruleIds.includes('compose/privileged')),
    'An explicit build privilege declaration requires either its own observation or explicit unsupported coverage.',
  );
});

test('independent review: capability drops do not erase explicit additions or turn into additions', () => {
  // https://docs.docker.com/reference/compose-file/services/#cap_add
  // https://docs.docker.com/reference/compose-file/services/#cap_drop
  const result = analyzeCompose({ services: { worker: { cap_add: ['SYS_ADMIN'], cap_drop: ['ALL', 'SYS_ADMIN'] } } });
  assert.deepEqual(result.issues.map(({ ruleId, pointer }) => ({ ruleId, pointer })), [
    { ruleId: 'compose/expanded-capabilities', pointer: '/services/worker/cap_add/0' },
  ]);
  assert.deepEqual(result.diagnostics, []);
});

test('independent review: mixed security option separators follow Docker parsing precedence', () => {
  // Docker Compose v2.39.4 pkg/compose/create.go:parseSecurityOpts first splits
  // at equals and falls back to colon only when no equals separator exists.
  // https://raw.githubusercontent.com/docker/compose/v2.39.4/pkg/compose/create.go
  for (const option of ['apparmor:unconfined=other', 'seccomp:unconfined=other']) {
    const result = analyzeCompose({ services: { worker: { security_opt: [option] } } });
    assert.deepEqual(result.issues, []);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.ruleIds.includes('compose/unconfined-profile')));
  }
});
