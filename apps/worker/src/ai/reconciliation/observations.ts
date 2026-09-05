/** Utilities shared by task formation and materialization observation intake. */

import { ArtifactIntegrityError } from './artifact-store.js';
import type { ReconciliationObservation } from './contracts.js';

/** Concatenate producer and supplemental observations while enforcing one global producer-ID set. */
export function combineObservations(
  producer: readonly ReconciliationObservation[],
  supplemental: readonly ReconciliationObservation[],
): ReconciliationObservation[] {
  const combined = [...producer, ...supplemental];
  const seen = new Set<string>();
  for (const observation of combined) {
    if (seen.has(observation.producer_id)) {
      throw new ArtifactIntegrityError('Reconciliation observations contain a duplicate producer identifier');
    }
    seen.add(observation.producer_id);
  }
  return combined;
}
