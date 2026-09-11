/**
 * Bulk scope tagging for recon discoveries.
 *
 * Every host/asset the world model learns about gets a `scopeStatus` label
 * so the controller can see at a glance what it may act on — but this is
 * purely informational. It is never a substitute for
 * `scope/validator.ts:validateTarget`, which is the only function allowed
 * to gate an actual action. Discovery does not equal authorization.
 */

import { classifyHostScope } from '../scope/matching.js';
import type { Observation, ProgramScope, RawDiscovery, ScopeStatus, WorldModelNodeKind } from '../types.js';

function hostOf(label: string): string {
  try {
    return new URL(label).hostname;
  } catch {
    return label;
  }
}

/** Only host/asset kinds carry a meaningful independent scope status; anything else is "unknown" until tied to a host via an edge. */
export function classifyDiscoveryScope(program: ProgramScope, kind: WorldModelNodeKind, label: string): ScopeStatus {
  if (kind !== 'host' && kind !== 'asset') {
    return 'unknown';
  }
  return classifyHostScope(program.assets, hostOf(label));
}

/**
 * Like `classifyDiscoveryScope`, but for a raw discovery that may carry an
 * `attributes.host` hint (e.g. an endpoint or application discovered by an
 * active-recon source, which is not itself a host/asset node but belongs to
 * one) — such a discovery inherits its host's scope status instead of
 * defaulting to "unknown".
 */
export function classifyRawDiscoveryScope(program: ProgramScope, discovery: RawDiscovery): ScopeStatus {
  const direct = classifyDiscoveryScope(program, discovery.kind, discovery.label);
  if (direct !== 'unknown') {
    return direct;
  }
  const hostHint = discovery.attributes.host;
  if (typeof hostHint === 'string') {
    return classifyHostScope(program.assets, hostHint);
  }
  return 'unknown';
}

/**
 * The scope firewall for observations: no observation whose asset resolves
 * to an out-of-scope host may ever reach hypothesis generation or the
 * action queue, regardless of which recon layer produced it.
 */
export function filterInScopeObservations(
  program: ProgramScope,
  observations: readonly Observation[],
): readonly Observation[] {
  return observations.filter((o) => classifyHostScope(program.assets, hostOf(o.assetRef)) !== 'out-of-scope');
}
