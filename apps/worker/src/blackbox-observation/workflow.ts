import type { ObservedExchange, ObservedIdentity, ObservedResource, RecordedTransition, SourceRef } from './types.js';

/** Inputs have already passed the passive observation projection; no engine state is accepted here. */
export interface WorkflowInput {
  readonly identities: readonly ObservedIdentity[];
  readonly exchanges: readonly ObservedExchange[];
  readonly resources: readonly ObservedResource[];
  readonly transitions: readonly RecordedTransition[];
  readonly conflictedExchangeIds?: readonly string[];
  readonly conflictedResourceIds?: readonly string[];
  readonly conflictedTransitionIds?: readonly string[];
}

export interface WorkflowTransitionObservation {
  readonly transitionId: string;
  readonly recordedIdentity: string | null;
  readonly fromState: string;
  readonly toState: string;
  readonly captureSequence: number | null;
  readonly recordState: 'consistent' | 'conflicted';
  readonly trigger: {
    readonly exchangeId: string;
    readonly state: 'linked' | 'missing' | 'conflicted' | 'identity-conflict' | 'unattributed';
    readonly sources: readonly SourceRef[];
  };
  readonly resource: {
    readonly resourceId: string | null;
    readonly state: 'linked' | 'missing' | 'conflicted' | 'not-declared';
    readonly sources: readonly SourceRef[];
  };
  readonly sequenceRelation: 'same-recorded-sequence' | 'different-recorded-sequence' | 'unknown';
  readonly sources: readonly SourceRef[];
}

export type WorkflowUncertainty =
  | 'unattributed-identity'
  | 'tied-capture-sequence'
  | 'tied-transition-sequence'
  | 'unknown-capture-sequence'
  | 'capture-sequence-gap'
  | 'transitions-unavailable'
  | 'no-linked-transitions'
  | 'transition-reference-problem'
  | 'transition-sequence-mismatch';

export interface IdentityWorkflow {
  readonly identityKey: string;
  readonly sequenceGroups: readonly {
    readonly captureSequence: number | null;
    readonly exchangeIds: readonly string[];
    readonly tied: boolean;
    readonly sources: readonly SourceRef[];
  }[];
  /** Gaps describe recorded numbers, never a count of discarded or unobserved requests. */
  readonly gaps: readonly { readonly after: number; readonly before: number }[];
  readonly transitions: readonly WorkflowTransitionObservation[];
  readonly transitionAvailability: 'recorded' | 'unavailable';
  readonly uncertainties: readonly WorkflowUncertainty[];
  readonly sources: readonly SourceRef[];
}

export interface WorkflowAnalysis {
  readonly workflows: readonly IdentityWorkflow[];
  readonly hasReferenceProblems: boolean;
}

const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);
const referenceKey = (reference: SourceRef): string =>
  JSON.stringify([reference.source, reference.pointer, reference.exchangeId ?? null]);

function references(values: readonly SourceRef[]): readonly SourceRef[] {
  return [...new Map(values.map((value) => [referenceKey(value), value])).entries()]
    .sort(([left], [right]) => compare(left, right))
    .map(([, value]) => value);
}

function sequenceOrder(left: number | null, right: number | null): number {
  if (left === null) return right === null ? 0 : 1;
  return right === null ? -1 : left - right;
}

function hasReferenceProblem(transition: WorkflowTransitionObservation): boolean {
  return (
    transition.recordState === 'conflicted' ||
    ['missing', 'conflicted', 'identity-conflict'].includes(transition.trigger.state) ||
    ['missing', 'conflicted'].includes(transition.resource.state) ||
    transition.sequenceRelation === 'different-recorded-sequence'
  );
}

/** Interpret recorded linkage and local counters only; this never infers state-change causality. */
export function reconstructWorkflows(input: WorkflowInput): WorkflowAnalysis {
  const exchanges = new Map(input.exchanges.map((exchange) => [exchange.exchangeId, exchange]));
  const resources = new Map(input.resources.map((resource) => [resource.resourceId, resource]));
  const conflictedExchanges = new Set(input.conflictedExchangeIds);
  const conflictedResources = new Set(input.conflictedResourceIds);
  const conflictedTransitions = new Set(input.conflictedTransitionIds);
  const identityMap = new Map(input.identities.map((identity) => [identity.key, identity]));
  const identityKeys = new Set([
    ...identityMap.keys(),
    ...input.exchanges.map((exchange) => exchange.identityKey),
    ...input.transitions.map((transition) => transition.identityKey),
  ]);
  let hasReferenceProblems = false;

  const workflows = [...identityKeys].sort(compare).map((identityKey): IdentityWorkflow => {
    const uncertainties = new Set<WorkflowUncertainty>();
    const attributed = identityMap.get(identityKey)?.kind !== 'unattributed' && identityMap.has(identityKey);
    if (!attributed) uncertainties.add('unattributed-identity');
    const grouped = new Map<number | null, Map<string, ObservedExchange>>();
    for (const exchange of input.exchanges) {
      if (exchange.identityKey !== identityKey || conflictedExchanges.has(exchange.exchangeId)) continue;
      // Undeclared labels share a bounded bucket, not a shared sequence namespace.
      const captureSequence = attributed ? exchange.captureSequence : null;
      const group = grouped.get(captureSequence) ?? new Map<string, ObservedExchange>();
      group.set(exchange.exchangeId, exchange);
      grouped.set(captureSequence, group);
    }
    const sequenceGroups = [...grouped.entries()]
      .sort(([left], [right]) => sequenceOrder(left, right))
      .map(([captureSequence, group]) => {
        const exchangeIds = [...group.keys()].sort(compare);
        const tied = captureSequence !== null && exchangeIds.length > 1;
        if (tied) uncertainties.add('tied-capture-sequence');
        if (captureSequence === null) uncertainties.add('unknown-capture-sequence');
        return {
          captureSequence,
          exchangeIds,
          tied,
          sources: references([...group.values()].flatMap((exchange) => exchange.sources)),
        };
      });
    const gaps: { after: number; before: number }[] = [];
    let previous: number | null = null;
    for (const group of sequenceGroups) {
      if (group.captureSequence === null) continue;
      if (previous !== null && group.captureSequence - previous > 1) {
        gaps.push({ after: previous, before: group.captureSequence });
        uncertainties.add('capture-sequence-gap');
      }
      previous = group.captureSequence;
    }

    const transitions = input.transitions
      .filter((transition) => transition.identityKey === identityKey)
      .map((transition): WorkflowTransitionObservation => {
        const trigger = exchanges.get(transition.triggerExchangeId);
        const resource = transition.resourceId === null ? undefined : resources.get(transition.resourceId);
        let triggerState: WorkflowTransitionObservation['trigger']['state'];
        if (conflictedExchanges.has(transition.triggerExchangeId)) triggerState = 'conflicted';
        else if (!trigger) triggerState = 'missing';
        else if (!attributed || identityMap.get(trigger.identityKey)?.kind === 'unattributed')
          triggerState = 'unattributed';
        else if (trigger.identityKey !== identityKey) triggerState = 'identity-conflict';
        else triggerState = 'linked';
        let resourceState: WorkflowTransitionObservation['resource']['state'];
        if (transition.resourceId === null) resourceState = 'not-declared';
        else if (conflictedResources.has(transition.resourceId)) resourceState = 'conflicted';
        else resourceState = resource ? 'linked' : 'missing';
        const sequenceRelation =
          triggerState !== 'linked' || trigger?.captureSequence === null || transition.captureSequence === null
            ? 'unknown'
            : trigger?.captureSequence === transition.captureSequence
              ? 'same-recorded-sequence'
              : 'different-recorded-sequence';
        const observation: WorkflowTransitionObservation = {
          transitionId: transition.transitionId,
          recordedIdentity: transition.recordedIdentity,
          fromState: transition.fromState,
          toState: transition.toState,
          captureSequence: transition.captureSequence,
          recordState: conflictedTransitions.has(transition.transitionId) ? 'conflicted' : 'consistent',
          trigger: {
            exchangeId: transition.triggerExchangeId,
            state: triggerState,
            sources: references(trigger?.sources ?? []),
          },
          resource: {
            resourceId: transition.resourceId,
            state: resourceState,
            sources: references(resource?.sources ?? []),
          },
          sequenceRelation,
          sources: references(transition.sources),
        };
        if (hasReferenceProblem(observation)) {
          hasReferenceProblems = true;
          uncertainties.add('transition-reference-problem');
        }
        if (sequenceRelation === 'different-recorded-sequence') uncertainties.add('transition-sequence-mismatch');
        return observation;
      })
      .sort(
        (left, right) =>
          (attributed ? sequenceOrder(left.captureSequence, right.captureSequence) : 0) ||
          compare(left.transitionId, right.transitionId) ||
          compare(JSON.stringify(left), JSON.stringify(right)),
      );
    const transitionSequences = new Set<number>();
    for (const transition of transitions) {
      if (!attributed || transition.captureSequence === null) uncertainties.add('unknown-capture-sequence');
      else {
        if (transitionSequences.has(transition.captureSequence)) uncertainties.add('tied-transition-sequence');
        transitionSequences.add(transition.captureSequence);
      }
    }
    if (transitions.length === 0) uncertainties.add('transitions-unavailable');
    else if (
      !transitions.some(
        (transition) =>
          transition.recordState === 'consistent' &&
          transition.trigger.state === 'linked' &&
          ['linked', 'not-declared'].includes(transition.resource.state),
      )
    ) {
      uncertainties.add('no-linked-transitions');
    }
    return {
      identityKey,
      sequenceGroups,
      gaps,
      transitions,
      transitionAvailability: transitions.length === 0 ? 'unavailable' : 'recorded',
      uncertainties: [...uncertainties].sort(compare),
      sources: references([
        ...(identityMap.get(identityKey)?.sources ?? []),
        ...sequenceGroups.flatMap((group) => group.sources),
        ...transitions.flatMap((transition) => transition.sources),
      ]),
    };
  });
  return { workflows, hasReferenceProblems };
}
