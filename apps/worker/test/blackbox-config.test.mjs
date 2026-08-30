import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

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
  return ['identities:', ...identities.map((entry) => entry.split('\n').map((line) => `  ${line}`).join('\n')), suffix]
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

  const testDir = dirname(fileURLToPath(import.meta.url));
  const fixturePath = join(testDir, '..', 'configs', 'example-config.yaml');
  const implicit = await configParser.parseConfig(fixturePath);
  const explicit = await configParser.parseConfig(fixturePath, 'whitebox');

  assert.deepEqual(explicit, implicit);
  assert.equal(explicit.authentication.login_type, 'form');
});
