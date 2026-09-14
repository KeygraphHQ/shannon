import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ProgramScope } from '../types.js';
import { isTechniqueAllowed } from './roe.js';

function program(disallowedTechniques: readonly string[]): ProgramScope {
  return {
    programId: 'acme',
    programName: 'Acme Corp',
    platform: 'hackerone',
    authorizationConfirmed: true,
    assets: [],
    rulesOfEngagement: [],
    disallowedTechniques,
    rateLimitPerMinute: 60,
  };
}

test('a program with no disallowed techniques allows every action kind', () => {
  const result = isTechniqueAllowed(program([]), 'active-recon');
  assert.equal(result.allowed, true);
});

test('an exact action-kind rule blocks that action kind', () => {
  const result = isTechniqueAllowed(program(['active-recon']), 'active-recon');
  assert.equal(result.allowed, false);
  assert.equal(result.matchedRule, 'active-recon');
});

test('a known alias phrase blocks the action kind it maps to', () => {
  const result = isTechniqueAllowed(program(['denial of service']), 'active-recon');
  assert.equal(result.allowed, false);
});

test('a tool-specific rule blocks only that tool, not the whole action kind', () => {
  const blockedTool = isTechniqueAllowed(program(['ffuf']), 'active-recon', 'ffuf');
  assert.equal(blockedTool.allowed, false);

  const otherTool = isTechniqueAllowed(program(['ffuf']), 'active-recon', 'httpx');
  assert.equal(otherTool.allowed, true);
});

test('an unrelated rule never blocks an action it does not name', () => {
  const result = isTechniqueAllowed(program(['social engineering']), 'js-intelligence');
  assert.equal(result.allowed, true);
});

test('shannon is blocked by an "exploitation" rule', () => {
  const result = isTechniqueAllowed(program(['exploitation']), 'shannon');
  assert.equal(result.allowed, false);
});

test('a short rule does not fuzzy-match unrelated candidates via substring containment', () => {
  // "js" is 2 characters — below the 4-char fuzzy-match floor — so it must
  // only ever match by exact equality, never swallow "js-intelligence".
  const result = isTechniqueAllowed(program(['js']), 'js-intelligence');
  assert.equal(result.allowed, true);
});

test('matching is case-insensitive and trims whitespace', () => {
  const result = isTechniqueAllowed(program(['  ACTIVE-RECON  ']), 'active-recon');
  assert.equal(result.allowed, false);
});
