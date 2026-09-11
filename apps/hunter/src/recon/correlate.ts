/**
 * Cross-source correlation.
 *
 * Multiple independent sources reporting the same asset is itself a useful
 * signal — a subdomain seen by both certificate-transparency logs and
 * subfinder is more likely real and worth investigating further than one
 * seen by only one. `correlateDiscoveries` groups raw, per-source
 * discoveries into one record per (kind, label), combining confidence with
 * a simple independent-evidence formula (probabilistic OR) rather than
 * just taking the max.
 */

import type { RawDiscovery, WorldModelNodeKind } from '../types.js';

export interface CorrelatedDiscovery {
  readonly kind: WorldModelNodeKind;
  readonly label: string;
  readonly sources: readonly string[];
  readonly confidence: number;
  readonly attributes: Readonly<Record<string, unknown>>;
}

function correlationKey(kind: WorldModelNodeKind, label: string): string {
  return `${kind}::${label.trim().toLowerCase()}`;
}

/** Combines independent per-source confidences: 1 - (1-c1)(1-c2)... */
function combineConfidence(confidences: readonly number[]): number {
  const combined = 1 - confidences.reduce((acc, c) => acc * (1 - Math.min(1, Math.max(0, c))), 1);
  return Number(combined.toFixed(4));
}

export function correlateDiscoveries(discoveries: readonly RawDiscovery[]): readonly CorrelatedDiscovery[] {
  const groups = new Map<string, RawDiscovery[]>();
  for (const discovery of discoveries) {
    const key = correlationKey(discovery.kind, discovery.label);
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(discovery);
    } else {
      groups.set(key, [discovery]);
    }
  }

  return Array.from(groups.values()).map((group) => {
    const first = group[0];
    if (!first) throw new Error('unreachable: correlation group is never empty');
    const sources = Array.from(new Set(group.map((d) => d.source)));
    const attributes: Record<string, unknown> = {};
    for (const d of group) {
      Object.assign(attributes, d.attributes);
    }
    return {
      kind: first.kind,
      label: first.label,
      sources,
      confidence: combineConfidence(group.map((d) => d.confidence)),
      attributes,
    };
  });
}

/** Assets/hosts corroborated by more than one independent source. */
export function crossSourceCorrelated(discoveries: readonly CorrelatedDiscovery[]): readonly CorrelatedDiscovery[] {
  return discoveries.filter((d) => d.sources.length > 1);
}
