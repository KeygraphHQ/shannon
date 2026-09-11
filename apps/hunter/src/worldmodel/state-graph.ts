/**
 * Application state / workflow graph.
 *
 * Represents the target application as a behavioral state machine —
 * actor/role/auth-state -> action -> resource -> authorization decision ->
 * side effect -> next state — built from *observed* transitions (never
 * assumed). Kept as its own persisted store, parallel to `worldmodel/graph.ts`
 * and `worldmodel/provenance.ts`, for the same reason: a workflow
 * transition carries fields (actor, role, authorization outcome, resource)
 * that a generic structural node/edge never needs.
 *
 * The point is not to draw a diagram: `detectUnexpectedTransitions` and
 * `detectAuthorizationInconsistencies` are what turn this graph into
 * generic behavioral-security hypotheses — never hardcoded to one
 * vulnerability class.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { err, type Hypothesis, ok, type Result } from '../types.js';

export type TransitionAuthorizationOutcome = 'allowed' | 'denied' | 'unknown';

export interface WorkflowTransition {
  readonly id: string;
  readonly engagementId: string;
  readonly actorRef: string;
  readonly role: string;
  readonly authState: string;
  readonly fromState: string;
  readonly action: string;
  readonly resourceRef: string | undefined;
  readonly toState: string;
  readonly authorizationOutcome: TransitionAuthorizationOutcome;
  readonly sideEffect: string | undefined;
  readonly source: string;
  readonly round: number | undefined;
  readonly observedAt: string;
}

export interface NewTransitionInput {
  readonly engagementId: string;
  readonly actorRef: string;
  readonly role: string;
  readonly authState: string;
  readonly fromState: string;
  readonly action: string;
  readonly toState: string;
  readonly authorizationOutcome: TransitionAuthorizationOutcome;
  readonly resourceRef?: string;
  readonly sideEffect?: string;
  readonly source: string;
  readonly round?: number;
}

export function recordTransition(input: NewTransitionInput): WorkflowTransition {
  return {
    id: `transition-${randomUUID()}`,
    engagementId: input.engagementId,
    actorRef: input.actorRef,
    role: input.role,
    authState: input.authState,
    fromState: input.fromState,
    action: input.action,
    resourceRef: input.resourceRef,
    toState: input.toState,
    authorizationOutcome: input.authorizationOutcome,
    sideEffect: input.sideEffect,
    source: input.source,
    round: input.round,
    observedAt: new Date().toISOString(),
  };
}

export function stateGraphFilePath(workspaceDir: string, engagementId: string): string {
  return join(workspaceDir, 'engagements', engagementId, 'state-graph.json');
}

export async function saveStateGraph(
  workspaceDir: string,
  engagementId: string,
  transitions: readonly WorkflowTransition[],
): Promise<void> {
  const filePath = stateGraphFilePath(workspaceDir, engagementId);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(transitions, null, 2)}\n`, 'utf8');
}

export async function loadStateGraph(
  workspaceDir: string,
  engagementId: string,
): Promise<Result<readonly WorkflowTransition[], string>> {
  const filePath = stateGraphFilePath(workspaceDir, engagementId);
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return ok([]);
    }
    return err(`could not read state graph "${filePath}": ${(error as Error).message}`);
  }
  try {
    return ok(JSON.parse(raw) as readonly WorkflowTransition[]);
  } catch (error) {
    return err(`state graph file "${filePath}" is not valid JSON: ${(error as Error).message}`);
  }
}

/** An operator-declared expectation for the workflow — the model against which observed transitions are checked. Entirely optional: with none declared, only cross-actor inconsistency detection runs. */
export interface DeclaredTransition {
  readonly fromState: string;
  readonly action: string;
  readonly toState: string;
  readonly allowedRoles: readonly string[];
}

export interface StateGraphAnomaly {
  readonly kind: 'unexpected-transition' | 'role-state-mismatch' | 'authorization-inconsistency';
  readonly description: string;
  readonly transitions: readonly WorkflowTransition[];
  readonly confidence: number;
}

function declaredMatch(
  declared: readonly DeclaredTransition[],
  fromState: string,
  action: string,
): DeclaredTransition | undefined {
  return declared.find((d) => d.fromState === fromState && d.action === action);
}

/**
 * Flags an observed transition with no declared counterpart at all (an
 * "unexpected transition") separately from one that has a declared
 * counterpart but was performed by a role never listed for it (a
 * "role-state mismatch") — the two are different facts and different
 * hypotheses.
 */
export function detectUnexpectedTransitions(
  transitions: readonly WorkflowTransition[],
  declared: readonly DeclaredTransition[],
): readonly StateGraphAnomaly[] {
  if (declared.length === 0) return [];
  const anomalies: StateGraphAnomaly[] = [];
  for (const transition of transitions) {
    if (transition.authorizationOutcome !== 'allowed') continue;
    const match = declaredMatch(declared, transition.fromState, transition.action);
    if (!match) {
      anomalies.push({
        kind: 'unexpected-transition',
        description: `"${transition.action}" succeeded from state "${transition.fromState}" -> "${transition.toState}", which is not a declared transition`,
        transitions: [transition],
        confidence: 0.6,
      });
      continue;
    }
    if (!match.allowedRoles.includes(transition.role)) {
      anomalies.push({
        kind: 'role-state-mismatch',
        description: `role "${transition.role}" performed "${transition.action}" from "${transition.fromState}", but only [${match.allowedRoles.join(', ')}] are declared allowed`,
        transitions: [transition],
        confidence: 0.75,
      });
    }
  }
  return anomalies;
}

/**
 * Compares observed authorization outcomes for the *same* (action,
 * fromState, resource) across different actors/roles: if one actor was
 * denied and another allowed for what looks like the same action against
 * the same resource from the same state, that inconsistency is itself the
 * signal — no declared model is required for this check, only two
 * observations that should plausibly agree.
 */
export function detectAuthorizationInconsistencies(
  transitions: readonly WorkflowTransition[],
): readonly StateGraphAnomaly[] {
  const groups = new Map<string, WorkflowTransition[]>();
  for (const transition of transitions) {
    if (transition.resourceRef === undefined) continue;
    const key = `${transition.action}::${transition.fromState}::${transition.resourceRef}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(transition);
    else groups.set(key, [transition]);
  }

  const anomalies: StateGraphAnomaly[] = [];
  for (const group of groups.values()) {
    const outcomes = new Set(group.map((t) => t.authorizationOutcome));
    const distinctActors = new Set(group.map((t) => t.actorRef));
    if (outcomes.size > 1 && outcomes.has('allowed') && outcomes.has('denied') && distinctActors.size > 1) {
      anomalies.push({
        kind: 'authorization-inconsistency',
        description: `"${group[0]?.action}" on resource "${group[0]?.resourceRef}" from state "${group[0]?.fromState}" was both allowed and denied across ${distinctActors.size} distinct actor(s)`,
        transitions: group,
        confidence: 0.7,
      });
    }
  }
  return anomalies;
}

export function stateGraphAnomaliesToHypotheses(
  anomalies: readonly StateGraphAnomaly[],
  engagementId: string,
): readonly Hypothesis[] {
  const now = new Date().toISOString();
  return anomalies.map((anomaly) => {
    const vulnClass = anomaly.kind === 'authorization-inconsistency' ? 'authz' : 'workflow-bypass';
    const assetRef = anomaly.transitions[0]?.resourceRef ?? anomaly.transitions[0]?.toState ?? 'unknown-asset';
    return {
      id: `hyp-${randomUUID()}`,
      engagementId,
      statement: anomaly.description,
      vulnClass,
      assetRef,
      supportingObservationIds: [],
      contradictingObservationIds: [],
      potentialImpact: anomaly.confidence >= 0.7 ? 'high' : 'medium',
      confidence: anomaly.confidence,
      priorityScore: Number((anomaly.confidence * 0.7).toFixed(4)),
      informationGain: Number((1 - anomaly.confidence).toFixed(4)),
      requiredEvidence: ['reproduction of the same transition with a second, independent actor/role'],
      nextInvestigation: 'behavioral diff across auth states/roles for the same action and resource',
      status: 'open',
      createdAt: now,
      updatedAt: now,
    } satisfies Hypothesis;
  });
}
