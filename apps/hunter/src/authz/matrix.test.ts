import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type NewTransitionInput, recordTransition, type WorkflowTransition } from '../worldmodel/state-graph.js';
import {
  buildAuthorizationMatrix,
  findMatrixGaps,
  findPrivilegeInversions,
  privilegeInversionsToHypotheses,
} from './matrix.js';

function transition(overrides: Partial<NewTransitionInput> = {}): WorkflowTransition {
  return recordTransition({
    engagementId: 'eng-1',
    actorRef: 'user-a',
    role: 'user',
    authState: 'authenticated-user',
    fromState: 'authenticated',
    action: 'read',
    toState: 'authenticated',
    authorizationOutcome: 'denied',
    resourceRef: 'doc-42',
    source: 'behavioral-diff',
    ...overrides,
  });
}

const ROLE_HIERARCHY = ['anonymous', 'user', 'resource-owner', 'admin'];

test('buildAuthorizationMatrix only includes transitions with a concrete object', () => {
  const withObject = transition();
  const withoutObject = recordTransition({
    engagementId: 'eng-1',
    actorRef: 'user-a',
    role: 'user',
    authState: 'authenticated-user',
    fromState: 'guest',
    action: 'login',
    toState: 'authenticated',
    authorizationOutcome: 'allowed',
    source: 'behavioral-diff',
  });
  const matrix = buildAuthorizationMatrix([withObject, withoutObject]);
  assert.equal(matrix.length, 1);
  assert.equal(matrix[0]?.objectRef, 'doc-42');
});

test('findPrivilegeInversions flags a lower-privilege role allowed where a higher-privilege role was denied', () => {
  const matrix = buildAuthorizationMatrix([
    transition({ actorRef: 'user-a', role: 'anonymous', authorizationOutcome: 'allowed' }),
    transition({ actorRef: 'user-b', role: 'admin', authorizationOutcome: 'denied' }),
  ]);
  const inversions = findPrivilegeInversions(matrix, ROLE_HIERARCHY);
  assert.equal(inversions.length, 1);
  assert.equal(inversions[0]?.lowerPrivilegeEntry.role, 'anonymous');
  assert.equal(inversions[0]?.higherPrivilegeEntry.role, 'admin');
});

test('findPrivilegeInversions does not flag consistent privilege ordering (higher allowed, lower denied)', () => {
  const matrix = buildAuthorizationMatrix([
    transition({ actorRef: 'user-a', role: 'anonymous', authorizationOutcome: 'denied' }),
    transition({ actorRef: 'user-b', role: 'admin', authorizationOutcome: 'allowed' }),
  ]);
  const inversions = findPrivilegeInversions(matrix, ROLE_HIERARCHY);
  assert.equal(inversions.length, 0);
});

test('findPrivilegeInversions ignores roles absent from the declared hierarchy', () => {
  const matrix = buildAuthorizationMatrix([
    transition({ actorRef: 'user-a', role: 'contractor', authorizationOutcome: 'allowed' }),
    transition({ actorRef: 'user-b', role: 'admin', authorizationOutcome: 'denied' }),
  ]);
  const inversions = findPrivilegeInversions(matrix, ROLE_HIERARCHY);
  assert.equal(inversions.length, 0);
});

test('findMatrixGaps reports untested role combinations for a tested action/object pair', () => {
  const matrix = buildAuthorizationMatrix([transition({ role: 'user', authorizationOutcome: 'denied' })]);
  const gaps = findMatrixGaps(matrix, ['user', 'admin', 'anonymous']);
  const roles = gaps.map((g) => g.role).sort();
  assert.deepEqual(roles, ['admin', 'anonymous']);
});

test('findMatrixGaps reports nothing once every expected role has been tested', () => {
  const matrix = buildAuthorizationMatrix([
    transition({ actorRef: 'a', role: 'user', authorizationOutcome: 'denied' }),
    transition({ actorRef: 'b', role: 'admin', authorizationOutcome: 'allowed' }),
  ]);
  const gaps = findMatrixGaps(matrix, ['user', 'admin']);
  assert.equal(gaps.length, 0);
});

test('privilegeInversionsToHypotheses produces a high-impact authz hypothesis', () => {
  const matrix = buildAuthorizationMatrix([
    transition({ actorRef: 'user-a', role: 'anonymous', authorizationOutcome: 'allowed' }),
    transition({ actorRef: 'user-b', role: 'admin', authorizationOutcome: 'denied' }),
  ]);
  const inversions = findPrivilegeInversions(matrix, ROLE_HIERARCHY);
  const hypotheses = privilegeInversionsToHypotheses(inversions, 'eng-1');
  assert.equal(hypotheses.length, 1);
  assert.equal(hypotheses[0]?.vulnClass, 'authz');
  assert.equal(hypotheses[0]?.potentialImpact, 'high');
  assert.equal(hypotheses[0]?.assetRef, 'doc-42');
});
