import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ProgramScope } from '../types.js';
import { validateTarget } from './validator.js';

function program(overrides: Partial<ProgramScope> = {}): ProgramScope {
  return {
    programId: 'example',
    programName: 'Example Program',
    platform: 'hackerone',
    authorizationConfirmed: true,
    assets: [
      {
        identifier: '*.example.com',
        type: 'wildcard-domain',
        instruction: 'in-scope',
        tier: 'standard',
        bountyEligible: true,
        requiresAuthentication: false,
      },
      {
        identifier: 'admin.example.com',
        type: 'domain',
        instruction: 'out-of-scope',
        tier: 'standard',
        bountyEligible: true,
        requiresAuthentication: false,
      },
    ],
    rulesOfEngagement: ['No automated denial-of-service testing.'],
    disallowedTechniques: ['dos', 'social-engineering'],
    rateLimitPerMinute: 60,
    ...overrides,
  };
}

test('rejects when authorization is not confirmed', () => {
  const result = validateTarget({
    program: program({ authorizationConfirmed: false }),
    url: 'https://app.example.com',
    repoPath: '/repo',
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /authorization confirmed/);
  }
});

test('accepts a URL matching a wildcard in-scope asset', () => {
  const result = validateTarget({
    program: program(),
    url: 'https://app.example.com/login',
    repoPath: '/repo/app',
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.matchedAsset.identifier, '*.example.com');
  }
});

test('rejects a URL matching an out-of-scope asset even if a wildcard would also match', () => {
  const result = validateTarget({
    program: program(),
    url: 'https://admin.example.com/',
    repoPath: '/repo/app',
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /out-of-scope/);
  }
});

test('rejects a URL with no matching in-scope asset', () => {
  const result = validateTarget({
    program: program(),
    url: 'https://not-in-scope.other.com/',
    repoPath: '/repo/app',
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /does not match any in-scope asset/);
  }
});

test('rejects a non-http(s) URL', () => {
  const result = validateTarget({ program: program(), url: 'ftp://app.example.com', repoPath: '/repo/app' });
  assert.equal(result.ok, false);
});

test('rejects a repo path that is itself a URL', () => {
  const result = validateTarget({
    program: program(),
    url: 'https://app.example.com',
    repoPath: 'https://github.com/example/app',
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /local filesystem path/);
  }
});

test('exact domain assets do not match subdomains', () => {
  const result = validateTarget({
    program: program({
      assets: [
        {
          identifier: 'app.example.com',
          type: 'domain',
          instruction: 'in-scope',
          tier: 'standard',
          bountyEligible: true,
          requiresAuthentication: false,
        },
      ],
    }),
    url: 'https://other.app.example.com',
    repoPath: '/repo/app',
  });
  assert.equal(result.ok, false);
});
