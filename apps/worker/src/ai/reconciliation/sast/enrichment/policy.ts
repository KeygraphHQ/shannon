/** Code-owned SAST observation shaping and producer-ID minting. */

import type { ReconciliationClass } from '../../../../types/reconciliation.js';
import { ArtifactIntegrityError } from '../../artifact-store.js';
import type { ReconciliationObservation, SastSourceLocation } from '../../contracts.js';
import { isProducerId, REF_PREFIX } from '../../refs.js';
import type { ClassifiedFinding, FindingContext } from '../types.js';

export function sourceLocationFromContext(context: FindingContext): SastSourceLocation {
  if ('sinkFile' in context) {
    return {
      file: context.sinkFile,
      line: context.sinkLine,
      column: context.sinkColumn,
      rule_id: context.cwe,
    };
  }
  return { file: context.file, line: context.line, column: context.column, rule_id: context.cwe };
}

// SAST producer IDs occupy a namespace (`PREFIX-SAST-NN`) disjoint from vulnerability-analysis
// producer IDs (`PREFIX-VULN-NN`) even within the same class, so the two sources can never collide
// on identity and `validateProducerIdentity` in publish.ts can tell them apart by construction.
export function mintSastProducerId(vulnerabilityClass: ReconciliationClass, sastId: number): string {
  const producerId = `${REF_PREFIX[vulnerabilityClass]}-SAST-${String(sastId + 1).padStart(2, '0')}`;
  if (!isProducerId(producerId, vulnerabilityClass, 'SAST')) {
    throw new ArtifactIntegrityError('Minted SAST producer identifier is outside its class namespace');
  }
  return producerId;
}

/**
 * Build one SAST-origin observation, always marked `preferred`.
 *
 * This is where the dedupe contract's primacy rule is established for a static-analysis finding: if
 * reconciliation later groups this observation with a pentest observation for the same underlying
 * vulnerability, this one becomes the task's primary record, since it carries an exact source
 * location and rule ID that a pentest finding does not.
 */
export function buildSastObservation(
  producerId: string,
  evidence: Record<string, unknown>,
  finding: ClassifiedFinding,
): ReconciliationObservation {
  return {
    ...evidence,
    producer_id: producerId,
    scan_source: 'sast',
    primary_preference: 'preferred',
    priority: finding.mapping.priority,
    sast_source_location: sourceLocationFromContext(finding.context),
  } as ReconciliationObservation;
}
