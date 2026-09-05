/** Closed per-class submit schema for one SAST enrichment response. */

import type { ReconciliationClass } from '../../../../types/reconciliation.js';
import { QUEUE_ENTRY_FIELD_NAMES } from '../../../queue-schemas.js';

// `ID` is omitted from the filtered class field list because it is prepended manually below instead
// (so it always appears exactly once); `code_locations` is omitted entirely, because that field is a
// structured array the model is never asked to reconstruct. Source location is authoritative code-owned
// data derived straight from validated SARIF (see sourceLocationFromContext in policy.ts), not
// something a free-text model response is trusted to supply.
const OMITTED_MODEL_FIELDS = new Set(['ID', 'code_locations']);

/** Evidence fields the model may return for one class, excluding authoritative source metadata. */
export function sastEnrichmentFieldNames(vulnerabilityClass: ReconciliationClass): readonly string[] {
  return [
    'ID',
    ...QUEUE_ENTRY_FIELD_NAMES[vulnerabilityClass].filter((field) => !OMITTED_MODEL_FIELDS.has(field)),
    '_sastId',
  ];
}

function propertySchema(name: string): Record<string, unknown> {
  if (name === '_sastId') {
    return { type: 'integer', description: 'Copy the input _sastId exactly.' };
  }
  if (name === 'externally_exploitable') return { type: 'boolean' };
  if (name === 'confidence') return { type: 'string', description: 'high | med | low' };
  return { type: 'string' };
}

/**
 * The envelope and each returned object are closed. Required-field and pairing
 * checks remain application-owned so a malformed sibling can be dropped alone.
 */
export function sastEnrichmentToolSchema(vulnerabilityClass: ReconciliationClass): Record<string, unknown> {
  const properties = Object.fromEntries(
    sastEnrichmentFieldNames(vulnerabilityClass).map((field) => [field, propertySchema(field)]),
  );
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      vulnerabilities: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties,
        },
      },
    },
    required: ['vulnerabilities'],
  };
}

export const SAST_ENRICHMENT_TOOL_DESCRIPTION =
  'Return the enriched exploitation-queue vulnerabilities. Call exactly once as your final action.';

export function enrichmentPromptName(vulnerabilityClass: ReconciliationClass): string {
  return `sast-enrichment-${vulnerabilityClass}`;
}
