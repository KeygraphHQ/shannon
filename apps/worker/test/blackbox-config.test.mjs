import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import Ajv from 'ajv';

import * as configParser from '../dist/config-parser.js';

const AUTH = [
  'login_type: form',
  'login_url: "https://target.example/login"',
  'credentials:',
  '  username: "user@example.com"',
  '  password: "password"',
  'success_condition:',
  '  type: url_contains',
  '  value: "/dashboard"',
];

function identity(name, role, auth = AUTH) {
  const lines = [`- name: ${name}`, `  role: "${role}"`];
  if (auth) {
    lines.push('  authentication:', ...auth.map((line) => `    ${line}`));
  }
  return lines.join('\n');
}

function blackboxYaml(identities, suffix = '') {
  return [
    'identity_bound_request_fields: []',
    'identities:',
    ...identities.map((entry) => entry.split('\n').map((line) => `  ${line}`).join('\n')),
    suffix,
  ]
    .filter(Boolean)
    .join('\n');
}

const TWO_IDENTITIES = [identity('attacker', 'ordinary user'), identity('victim', 'ordinary user')];

test('blackbox mode parses two unique identities', () => {
  const parsed = configParser.parseConfigYAML(blackboxYaml(TWO_IDENTITIES), 'blackbox');

  assert.deepEqual(
    parsed.identities.map(({ name, role }) => ({ name, role })),
    [
      { name: 'attacker', role: 'ordinary user' },
      { name: 'victim', role: 'ordinary user' },
    ],
  );
});

test('blackbox mode accepts a local-storage key as an authentication success condition', () => {
  const storageAuth = AUTH.map((line) =>
    line === '  type: url_contains' ? '  type: local_storage_key_present' : line === '  value: "/dashboard"' ? '  value: "token"' : line,
  );
  const parsed = configParser.normalizeBlackboxConfig(
    configParser.parseConfigYAML(
      blackboxYaml([identity('attacker', 'ordinary user', storageAuth), identity('victim', 'ordinary user', storageAuth)]),
      'blackbox',
    ),
  );

  assert.deepEqual(parsed.identities[0].authentication.success_condition, {
    type: 'local_storage_key_present',
    value: 'token',
  });
});

test('blackbox mode requires and normalizes exhaustive identity-bound request fields', () => {
  const yaml = blackboxYaml(
    TWO_IDENTITIES,
    [
      'identity_bound_request_fields:',
      '  - location: header',
      '    name: X-User-Context',
      '  - location: query',
      '    name: subject',
      '  - location: form',
      '    name: opaque_session',
      '  - location: json',
      '    pointer: /identity/opaque~1token',
    ].join('\n'),
  ).replace('identity_bound_request_fields: []\n', '');
  const normalized = configParser.normalizeBlackboxConfig(configParser.parseConfigYAML(yaml, 'blackbox'));

  assert.deepEqual(normalized.identityBoundRequestFields, [
    { location: 'header', name: 'x-user-context' },
    { location: 'query', name: 'subject' },
    { location: 'form', name: 'opaque_session' },
    { location: 'json', pointer: '/identity/opaque~1token' },
  ]);

  assert.throws(
    () => configParser.parseConfigYAML(blackboxYaml(TWO_IDENTITIES).replace('identity_bound_request_fields: []\n', ''), 'blackbox'),
    /identity_bound_request_fields|required/i,
  );
});

test('JSON schema requires the identity-bound field contract with identities', async () => {
  const testDir = dirname(fileURLToPath(import.meta.url));
  const schema = JSON.parse(await readFile(join(testDir, '..', 'configs', 'config-schema.json'), 'utf8'));
  const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
  const authentication = {
    login_type: 'form',
    login_url: 'https://target.example/login',
    credentials: { username: 'user@example.com', password: 'password' },
    success_condition: { type: 'url_contains', value: '/dashboard' },
  };
  const candidate = {
    identities: [
      { name: 'attacker', role: 'ordinary user', authentication },
      { name: 'victim', role: 'ordinary user', authentication },
    ],
  };

  assert.equal(validate(candidate), false);
  assert.equal(validate({ ...candidate, identity_bound_request_fields: [] }), true, JSON.stringify(validate.errors));
});

test('identity-bound request field contract rejects duplicates, reserved headers, and invalid selectors', () => {
  const contract = (lines) =>
    blackboxYaml(TWO_IDENTITIES, ['identity_bound_request_fields:', ...lines].join('\n')).replace(
      'identity_bound_request_fields: []\n',
      '',
    );

  for (const lines of [
    ['  - location: header', '    name: X-Subject', '  - location: header', '    name: x-subject'],
    ['  - location: header', '    name: Cookie'],
    ['  - location: header', '    name: Authorization'],
    ['  - location: header', '    name: X-Shannon-Capture'],
    ['  - location: header', '    name: Content-Length'],
    ['  - location: json', '    pointer: identity/token'],
    ['  - location: json', '    pointer: /identity/~2token'],
    ['  - location: json', '    pointer: /identity/__proto__'],
    ['  - location: path', '    name: subject'],
  ]) {
    assert.throws(
      () => configParser.parseConfigYAML(contract(lines), 'blackbox'),
      /duplicate|reserved|unsafe|pointer|location|configuration validation/i,
    );
  }
});

test('blackbox mode accepts two through five identities', () => {
  for (const count of [2, 3, 4, 5]) {
    const identities = Array.from({ length: count }, (_, index) => identity(`user-${index}`, `role ${index}`));
    assert.doesNotThrow(() => configParser.parseConfigYAML(blackboxYaml(identities), 'blackbox'));
  }
});

test('blackbox mode rejects zero, one, and six identities', () => {
  for (const count of [0, 1, 6]) {
    const identities = Array.from({ length: count }, (_, index) => identity(`user-${index}`, `role ${index}`));
    assert.throws(
      () => configParser.parseConfigYAML(blackboxYaml(identities), 'blackbox'),
      /identit|configuration validation/i,
    );
  }
});

test('blackbox mode rejects duplicate and unsafe identity names', () => {
  assert.throws(
    () => configParser.parseConfigYAML(blackboxYaml([identity('same', 'first'), identity('same', 'second')]), 'blackbox'),
    /duplicate|unique/i,
  );

  for (const unsafeName of ['Uppercase', 'two words', '1starts-with-number', 'a'.repeat(33)]) {
    assert.throws(
      () => configParser.parseConfigYAML(blackboxYaml([identity('attacker', 'user'), identity(unsafeName, 'user')]), 'blackbox'),
      /name|pattern|configuration validation/i,
    );
  }
});

test('blackbox mode rejects empty roles and missing authentication', () => {
  assert.throws(
    () => configParser.parseConfigYAML(blackboxYaml([identity('attacker', ''), identity('victim', 'user')]), 'blackbox'),
    /role|configuration validation/i,
  );
  assert.throws(
    () => configParser.parseConfigYAML(blackboxYaml([identity('attacker', 'user', null), identity('victim', 'user')]), 'blackbox'),
    /authentication|configuration validation/i,
  );
});

test('blackbox mode applies authentication security checks to every identity', () => {
  const unsafeAuth = AUTH.map((line) =>
    line === '  username: "user@example.com"' ? '  username: "<script>"' : line,
  );

  assert.throws(
    () =>
      configParser.parseConfigYAML(
        blackboxYaml([identity('attacker', 'user'), identity('victim', 'user', unsafeAuth)]),
        'blackbox',
      ),
    /identities\[1\]\.authentication\.credentials\.username/i,
  );
});

test('blackbox mode rejects whitebox-only and capability-reducing fields', () => {
  assert.throws(
    () => configParser.parseConfigYAML(['authentication:', ...AUTH.map((line) => `  ${line}`)].join('\n'), 'blackbox'),
    /authentication|identit/i,
  );
  assert.throws(
    () =>
      configParser.parseConfigYAML(
        blackboxYaml(TWO_IDENTITIES, 'rules:\n  focus:\n    - type: code_path\n      value: "src/**"'),
        'blackbox',
      ),
    /code_path/i,
  );
  assert.throws(
    () => configParser.parseConfigYAML(blackboxYaml(TWO_IDENTITIES, 'exploit: "false"'), 'blackbox'),
    /exploit/i,
  );
  assert.throws(
    () => configParser.parseConfigYAML(blackboxYaml(TWO_IDENTITIES, 'vuln_classes: [authz, xss]'), 'blackbox'),
    /vulnerability|vuln_classes|authz/i,
  );
});

test('blackbox normalization supplies authz and exploit defaults', () => {
  assert.equal(typeof configParser.normalizeBlackboxConfig, 'function');
  const parsed = configParser.parseConfigYAML(blackboxYaml(TWO_IDENTITIES), 'blackbox');
  const normalized = configParser.normalizeBlackboxConfig(parsed);

  assert.deepEqual(normalized.vulnClasses, ['authz']);
  assert.equal(normalized.exploit, true);
  assert.deepEqual(normalized.rules, {});
  assert.equal(normalized.description, '');
  assert.equal(normalized.rulesOfEngagement, '');
});

test('whitebox mode rejects identities and preserves the existing fixture', async () => {
  assert.throws(() => configParser.parseConfigYAML(blackboxYaml(TWO_IDENTITIES), 'whitebox'), /identit/i);
  assert.throws(
    () =>
      configParser.parseConfigYAML(
        ['identity_bound_request_fields: []', 'authentication:', ...AUTH.map((line) => `  ${line}`)].join('\n'),
        'whitebox',
      ),
    /identity_bound_request_fields|blackbox/i,
  );

  const testDir = dirname(fileURLToPath(import.meta.url));
  const fixturePath = join(testDir, '..', 'configs', 'example-config.yaml');
  const implicit = await configParser.parseConfig(fixturePath);
  const explicit = await configParser.parseConfig(fixturePath, 'whitebox');

  assert.deepEqual(explicit, implicit);
  assert.equal(explicit.authentication.login_type, 'form');
});
