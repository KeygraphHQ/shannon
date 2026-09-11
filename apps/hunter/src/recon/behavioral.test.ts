import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareAuthStates } from './behavioral.js';

test('flags identical anonymous/privileged responses as a candidate authz observation', () => {
  const observations = compareAuthStates('e1', 'https://app.example.com', '/admin/settings', {
    anonymous: { status: 200, bodySnippet: 'settings-payload' },
    'privileged-user': { status: 200, bodySnippet: 'settings-payload' },
  });
  assert.ok(observations.some((o) => o.vulnClass === 'authz'));
});

test('flags identical different-user/resource-owner responses as a candidate idor observation', () => {
  const observations = compareAuthStates('e1', 'https://app.example.com', '/account/42/profile', {
    'different-user': { status: 200, bodySnippet: 'account-42-payload' },
    'resource-owner': { status: 200, bodySnippet: 'account-42-payload' },
  });
  assert.ok(observations.some((o) => o.vulnClass === 'idor'));
});

test('does not flag anything when states behave differently as expected', () => {
  const observations = compareAuthStates('e1', 'https://app.example.com', '/admin/settings', {
    anonymous: { status: 401, bodySnippet: 'unauthorized' },
    'privileged-user': { status: 200, bodySnippet: 'settings-payload' },
  });
  assert.equal(
    observations.some((o) => o.vulnClass === 'authz'),
    false,
  );
});

test('does not flag anything when only one state was observed', () => {
  const observations = compareAuthStates('e1', 'https://app.example.com', '/public', {
    anonymous: { status: 200, bodySnippet: 'public-payload' },
  });
  assert.equal(observations.length, 0);
});

test('notes when all tested states behave identically, without over-claiming a vulnerability', () => {
  const observations = compareAuthStates('e1', 'https://app.example.com', '/public', {
    anonymous: { status: 200, bodySnippet: 'public-payload' },
    'authenticated-user': { status: 200, bodySnippet: 'different-payload-but-same-status' },
  });
  const note = observations.find((o) => o.vulnClass === 'behavioral-note');
  assert.ok(note);
  assert.equal(note?.severityHint, 'informational');
});
