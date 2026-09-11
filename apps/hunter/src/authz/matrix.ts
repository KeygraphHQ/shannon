/**
 * Authorization reasoning matrix.
 *
 * A generic ACTOR/ROLE x ACTION x OBJECT x APPLICATION-STATE x AUTH-STATE
 * matrix, built as a read-only view over `worldmodel/state-graph.ts`'s
 * observed `WorkflowTransition`s — deliberately not a second persisted
 * store, since every fact this matrix reasons about is already a
 * transition. This module's value-add over `state-graph.ts`'s own
 * same-tuple inconsistency check is matrix-wide reasoning: privilege-order
 * inversions (a *lower*-privileged role allowed where a higher-privileged
 * role was denied, for the same action/object/state) and matrix
 * completeness (which authorized identity x action x object combinations
 * have never actually been compared yet — feed for the experiment
 * designer, never itself a reason to test something out of scope).
 *
 * Only ever reasons over identities/roles the caller already tested; it
 * never performs or implies unauthorized access.
 */

import { randomUUID } from 'node:crypto';
import type { Hypothesis } from '../types.js';
import type { TransitionAuthorizationOutcome, WorkflowTransition } from '../worldmodel/state-graph.js';

export interface AuthorizationMatrixEntry {
  readonly actorRef: string;
  readonly role: string;
  readonly action: string;
  readonly objectRef: string;
  readonly applicationState: string;
  readonly authState: string;
  readonly outcome: TransitionAuthorizationOutcome;
  readonly observedAt: string;
  readonly source: string;
}

/** Only transitions naming a concrete object belong in the authorization matrix — a login/navigation transition with no resource is not an authorization decision over an object. */
export function buildAuthorizationMatrix(
  transitions: readonly WorkflowTransition[],
): readonly AuthorizationMatrixEntry[] {
  const entries: AuthorizationMatrixEntry[] = [];
  for (const t of transitions) {
    if (t.resourceRef === undefined) continue;
    entries.push({
      actorRef: t.actorRef,
      role: t.role,
      action: t.action,
      objectRef: t.resourceRef,
      applicationState: t.fromState,
      authState: t.authState,
      outcome: t.authorizationOutcome,
      observedAt: t.observedAt,
      source: t.source,
    });
  }
  return entries;
}

export interface PrivilegeInversion {
  readonly action: string;
  readonly objectRef: string;
  readonly applicationState: string;
  readonly lowerPrivilegeEntry: AuthorizationMatrixEntry;
  readonly higherPrivilegeEntry: AuthorizationMatrixEntry;
  readonly confidence: number;
}

function matrixKey(entry: Pick<AuthorizationMatrixEntry, 'action' | 'objectRef' | 'applicationState'>): string {
  return `${entry.action}::${entry.objectRef}::${entry.applicationState}`;
}

/**
 * `roleHierarchy` is caller-declared, ascending privilege (e.g.
 * `['anonymous', 'user', 'resource-owner', 'admin']`) — this module never
 * guesses a privilege order. A role missing from the hierarchy is simply
 * excluded from inversion detection, not treated as lowest/highest.
 */
export function findPrivilegeInversions(
  matrix: readonly AuthorizationMatrixEntry[],
  roleHierarchy: readonly string[],
): readonly PrivilegeInversion[] {
  const rank = new Map(roleHierarchy.map((role, index) => [role, index] as const));
  const groups = new Map<string, AuthorizationMatrixEntry[]>();
  for (const entry of matrix) {
    const key = matrixKey(entry);
    const bucket = groups.get(key);
    if (bucket) bucket.push(entry);
    else groups.set(key, [entry]);
  }

  const seenPairs = new Set<string>();
  const inversions: PrivilegeInversion[] = [];
  for (const group of groups.values()) {
    for (const lower of group) {
      const lowerRank = rank.get(lower.role);
      if (lowerRank === undefined || lower.outcome !== 'allowed') continue;
      for (const higher of group) {
        if (lower === higher) continue;
        const higherRank = rank.get(higher.role);
        if (higherRank === undefined || higher.outcome !== 'denied') continue;
        if (lowerRank >= higherRank) continue;
        const pairKey = `${lower.actorRef}->${higher.actorRef}::${matrixKey(lower)}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        inversions.push({
          action: lower.action,
          objectRef: lower.objectRef,
          applicationState: lower.applicationState,
          lowerPrivilegeEntry: lower,
          higherPrivilegeEntry: higher,
          confidence: 0.75,
        });
      }
    }
  }
  return inversions;
}

export interface MatrixGap {
  readonly action: string;
  readonly objectRef: string;
  readonly role: string;
}

/** Every (action, object) combination that has been tested for at least one role, but not for every role in `expectedRoles` — untested cells the experiment designer can propose comparing next. */
export function findMatrixGaps(
  matrix: readonly AuthorizationMatrixEntry[],
  expectedRoles: readonly string[],
): readonly MatrixGap[] {
  const tested = new Set(matrix.map((e) => `${e.action}::${e.objectRef}::${e.role}`));
  const combos = new Map<string, { readonly action: string; readonly objectRef: string }>();
  for (const entry of matrix) {
    combos.set(`${entry.action}::${entry.objectRef}`, { action: entry.action, objectRef: entry.objectRef });
  }
  const gaps: MatrixGap[] = [];
  for (const { action, objectRef } of combos.values()) {
    for (const role of expectedRoles) {
      if (!tested.has(`${action}::${objectRef}::${role}`)) {
        gaps.push({ action, objectRef, role });
      }
    }
  }
  return gaps;
}

export function privilegeInversionsToHypotheses(
  inversions: readonly PrivilegeInversion[],
  engagementId: string,
): readonly Hypothesis[] {
  const now = new Date().toISOString();
  return inversions.map((inversion) => ({
    id: `hyp-${randomUUID()}`,
    engagementId,
    statement: `role "${inversion.lowerPrivilegeEntry.role}" (actor ${inversion.lowerPrivilegeEntry.actorRef}) was allowed to "${inversion.action}" on "${inversion.objectRef}", but the higher-privileged role "${inversion.higherPrivilegeEntry.role}" (actor ${inversion.higherPrivilegeEntry.actorRef}) was denied for the same action/object/state`,
    vulnClass: 'authz',
    assetRef: inversion.objectRef,
    supportingObservationIds: [],
    contradictingObservationIds: [],
    potentialImpact: 'high',
    confidence: inversion.confidence,
    priorityScore: Number((inversion.confidence * 0.8).toFixed(4)),
    informationGain: Number((1 - inversion.confidence).toFixed(4)),
    requiredEvidence: [
      'a repeated comparison with both identities to rule out flakiness',
      'confirmation the two requests targeted the exact same object/state',
    ],
    nextInvestigation: `re-test "${inversion.action}" on "${inversion.objectRef}" with both roles back-to-back`,
    status: 'open',
    createdAt: now,
    updatedAt: now,
  }));
}
