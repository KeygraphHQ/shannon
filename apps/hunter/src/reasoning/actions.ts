/**
 * Next-best-action engine.
 *
 * Turns open hypotheses into a concrete investigation queue, and picks the
 * single action expected to teach the controller the most, adjusted for
 * cost — not a fixed scanner order. `buildActionQueue` skips any
 * (kind, target) pair already present in `completedActionKeys`, which is
 * how the loop avoids repeating completed work across rounds.
 */

import { randomUUID } from 'node:crypto';
import type { ActionKind, HuntAction, Hypothesis } from '../types.js';

// An endpoint referenced only in client-side JS is, itself, a page/asset worth
// collecting JS from directly — it may ship its own bundle and source map —
// so this routes to 'js-intelligence' (the same JsCollectorAdapter the
// bootstrap phase already uses, see tools/live-adapters.ts), not
// 'active-recon'. This is what makes 'js-intelligence' reachable from the
// round-loop's hypothesis-driven action queue at all: no other vulnClass
// maps to it.
const ACTION_KIND_BY_VULN_CLASS: Readonly<Record<string, ActionKind>> = {
  xss: 'shannon',
  authz: 'behavioral-diff',
  idor: 'behavioral-diff',
  ssrf: 'active-recon',
  'js-intel-endpoint-discovery': 'js-intelligence',
  'js-intel-secret-exposure': 'manual-review',
  'js-intel-internal-reference': 'manual-review',
  'js-intel-feature-flags': 'manual-review',
  'behavioral-note': 'manual-review',
};

const COST_BY_KIND: Readonly<Record<ActionKind, number>> = {
  'passive-recon': 0.1,
  'active-recon': 0.3,
  'js-intelligence': 0.2,
  'behavioral-diff': 0.35,
  shannon: 0.6,
  'manual-review': 0.05,
};

export function actionKindFor(hypothesis: Hypothesis): ActionKind {
  return ACTION_KIND_BY_VULN_CLASS[hypothesis.vulnClass.toLowerCase()] ?? 'shannon';
}

export function actionKey(kind: ActionKind, targetRef: string): string {
  return `${kind}::${targetRef}`;
}

/** Builds one candidate action per still-open hypothesis, skipping already-completed (kind, target) pairs. */
export function buildActionQueue(
  hypotheses: readonly Hypothesis[],
  engagementId: string,
  completedActionKeys: ReadonlySet<string>,
): readonly HuntAction[] {
  const now = new Date().toISOString();
  const actionable = hypotheses.filter((h) => h.status === 'open' || h.status === 'investigating');
  const actions: HuntAction[] = [];

  for (const hypothesis of actionable) {
    const kind = actionKindFor(hypothesis);
    const key = actionKey(kind, hypothesis.assetRef);
    if (completedActionKeys.has(key)) {
      continue;
    }
    actions.push({
      id: `action-${randomUUID()}`,
      engagementId,
      kind,
      targetRef: hypothesis.assetRef,
      hypothesisId: hypothesis.id,
      rationale: hypothesis.nextInvestigation,
      expectedInformationGain: hypothesis.informationGain,
      cost: COST_BY_KIND[kind],
      status: 'queued',
      createdAt: now,
      completedAt: undefined,
      resultSummary: undefined,
    });
  }
  return actions;
}

/** Picks the queued action with the best expected-information-gain-to-cost trade-off. */
export function selectNextBestAction(queue: readonly HuntAction[]): HuntAction | undefined {
  const queued = queue.filter((a) => a.status === 'queued');
  if (queued.length === 0) {
    return undefined;
  }
  return [...queued].sort((a, b) => {
    const scoreA = a.expectedInformationGain - a.cost * 0.5;
    const scoreB = b.expectedInformationGain - b.cost * 0.5;
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }
    return a.createdAt.localeCompare(b.createdAt);
  })[0];
}

export function markActionDone(action: HuntAction, resultSummary: string): HuntAction {
  return { ...action, status: 'done', completedAt: new Date().toISOString(), resultSummary };
}

export function markActionSkipped(action: HuntAction, resultSummary: string): HuntAction {
  return { ...action, status: 'skipped', completedAt: new Date().toISOString(), resultSummary };
}

/** For a genuine execution error (a tool ran and failed), distinct from "skipped" (nothing to run, or deliberately not attempted). */
export function markActionFailed(action: HuntAction, resultSummary: string): HuntAction {
  return { ...action, status: 'failed', completedAt: new Date().toISOString(), resultSummary };
}
