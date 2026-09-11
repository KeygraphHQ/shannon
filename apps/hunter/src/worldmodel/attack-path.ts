/**
 * Attack-path / chain engine.
 *
 * Builds multi-hop attack chains by treating three already-persisted graphs
 * as one combined, directed graph keyed by label/ref rather than by each
 * graph's own id scheme: `worldmodel/graph.ts`'s structural node/edge
 * graph, `worldmodel/provenance.ts`'s data-flow edges, and
 * `worldmodel/state-graph.ts`'s observed workflow transitions. No new
 * storage is introduced — this module only ever reads the three graphs
 * that already exist and reports paths through them, so a low-severity
 * clue in one graph can be connected to a verified observation in another.
 *
 * Every step carries its own confidence and provenance description; a
 * chain's score is the product of its steps' confidences (a longer chain
 * is never free — each additional inference discounts the whole chain),
 * never a speculative impact multiplier. `findAttackChains` enforces scope
 * by simply never traversing into a ref the caller did not mark in-scope.
 */

import { randomUUID } from 'node:crypto';
import type { WorldModel } from '../types.js';
import type { ProvenanceEdge } from './provenance.js';
import type { WorkflowTransition } from './state-graph.js';

export type ChainStepKind = 'world-model-edge' | 'provenance-edge' | 'state-transition';

export interface ChainStep {
  readonly kind: ChainStepKind;
  readonly from: string;
  readonly to: string;
  readonly description: string;
  readonly confidence: number;
}

export interface AttackChain {
  readonly id: string;
  readonly steps: readonly ChainStep[];
  readonly score: number;
  readonly startRef: string;
  readonly endRef: string;
}

export interface ChainGraphInput {
  readonly worldModel: WorldModel;
  readonly provenanceEdges: readonly ProvenanceEdge[];
  readonly transitions: readonly WorkflowTransition[];
}

function buildAdjacency(input: ChainGraphInput): ReadonlyMap<string, readonly ChainStep[]> {
  const adjacency = new Map<string, ChainStep[]>();
  const push = (from: string, step: ChainStep) => {
    const bucket = adjacency.get(from);
    if (bucket) bucket.push(step);
    else adjacency.set(from, [step]);
  };

  const nodeById = new Map(input.worldModel.nodes.map((n) => [n.id, n] as const));
  for (const edge of input.worldModel.edges) {
    const fromNode = nodeById.get(edge.fromId);
    const toNode = nodeById.get(edge.toId);
    if (!fromNode || !toNode) continue;
    push(fromNode.label, {
      kind: 'world-model-edge',
      from: fromNode.label,
      to: toNode.label,
      description: edge.relation,
      confidence: 0.8,
    });
  }

  for (const edge of input.provenanceEdges) {
    if (edge.verificationState === 'contradicted') continue;
    push(edge.sourceRef, {
      kind: 'provenance-edge',
      from: edge.sourceRef,
      to: edge.sinkRef,
      description: edge.transformation,
      confidence: edge.provenance.confidence,
    });
  }

  for (const transition of input.transitions) {
    if (transition.authorizationOutcome !== 'allowed') continue;
    push(transition.fromState, {
      kind: 'state-transition',
      from: transition.fromState,
      to: transition.toState,
      description: transition.action,
      confidence: 0.7,
    });
  }

  return adjacency;
}

export interface FindAttackChainsOptions {
  readonly maxHops: number;
  readonly isInScope: (ref: string) => boolean;
  readonly isHighValueTarget: (ref: string) => boolean;
}

const DEFAULT_MAX_HOPS = 6;

/**
 * Depth-first search from every candidate start ref to any ref
 * `isHighValueTarget` accepts, never revisiting a ref within one path
 * (cycle-safe) and never stepping into a ref `isInScope` rejects. Chains
 * are deduplicated by their exact (from,to,description) sequence — the
 * same underlying path discovered via two different start refs is reported
 * once.
 */
export function findAttackChains(
  input: ChainGraphInput,
  startRefs: readonly string[],
  options: Partial<FindAttackChainsOptions> = {},
): readonly AttackChain[] {
  const maxHops = options.maxHops ?? DEFAULT_MAX_HOPS;
  const isInScope = options.isInScope ?? (() => true);
  const isHighValueTarget = options.isHighValueTarget ?? (() => false);
  const adjacency = buildAdjacency(input);

  const chains: AttackChain[] = [];
  const seenSignatures = new Set<string>();

  function chainSignature(steps: readonly ChainStep[]): string {
    return steps.map((s) => `${s.from}->${s.to}:${s.description}`).join('|');
  }

  function dfs(current: string, visited: ReadonlySet<string>, path: readonly ChainStep[]): void {
    if (path.length > 0 && isHighValueTarget(current)) {
      const signature = chainSignature(path);
      if (!seenSignatures.has(signature)) {
        seenSignatures.add(signature);
        const score = Number(path.reduce((product, step) => product * step.confidence, 1).toFixed(4));
        chains.push({
          id: `chain-${randomUUID()}`,
          steps: path,
          score,
          startRef: path[0]?.from ?? current,
          endRef: current,
        });
      }
      // A high-value target can still be a waypoint to a further target — keep exploring past it.
    }
    if (path.length >= maxHops) return;
    const next = adjacency.get(current);
    if (!next) return;
    for (const step of next) {
      if (!isInScope(step.to)) continue;
      if (visited.has(step.to)) continue;
      dfs(step.to, new Set([...visited, step.to]), [...path, step]);
    }
  }

  for (const start of startRefs) {
    if (!isInScope(start)) continue;
    dfs(start, new Set([start]), []);
  }

  return [...chains].sort((a, b) => b.score - a.score);
}

/** Chains sharing the same (startRef, endRef) pair, keeping only the highest-scored one — a caller-facing summary once path enumeration is done. */
export function bestChainPerEndpoint(chains: readonly AttackChain[]): readonly AttackChain[] {
  const best = new Map<string, AttackChain>();
  for (const chain of chains) {
    const key = `${chain.startRef}=>${chain.endRef}`;
    const existing = best.get(key);
    if (!existing || chain.score > existing.score) {
      best.set(key, chain);
    }
  }
  return Array.from(best.values()).sort((a, b) => b.score - a.score);
}
