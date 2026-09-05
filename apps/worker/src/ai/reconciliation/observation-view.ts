/** Positive observation projection used at the task-formation model boundary. */

import type { ReconciliationClass } from '../../types/reconciliation.js';
import { QUEUE_ENTRY_FIELD_NAMES } from '../queue-schemas.js';
import type { ReconciliationObservation } from './contracts.js';
import type { ObservationView } from './stage-contracts.js';

const BOOLEAN_EVIDENCE_KEY = 'externally_exploitable';
const PRODUCER_ID_REDACTION = '[redacted]';

function redactString(value: string, producerIds: readonly string[]): string {
  let redacted = value;
  for (const producerId of producerIds) {
    if (redacted.includes(producerId)) {
      redacted = redacted.split(producerId).join(PRODUCER_ID_REDACTION);
    }
  }
  return redacted;
}

/** Redact producer-ID tokens from arbitrary free text. */
export function redactProducerIds(value: string, producerIds: Iterable<string>): string {
  const sorted = [...new Set(producerIds)].filter((id) => id.length > 0).sort((a, b) => b.length - a.length);
  return redactString(value, sorted);
}

function redactDeep(value: unknown, producerIds: readonly string[]): unknown {
  if (typeof value === 'string') return redactString(value, producerIds);
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, producerIds));
  if (value !== null && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = redactDeep(item, producerIds);
    }
    return output;
  }
  return value;
}

// Rebuilds the location from scratch rather than passing the stored value through, so a malformed
// or tampered `sast_source_location` on the underlying observation cannot cross into the model view
// unnoticed; anything that fails this shape check (including a `rule_id` that isn't a real CWE
// identifier) is silently dropped from the view rather than surfaced as-is.
function rebuildSastSourceLocation(value: unknown): ObservationView['sast_source_location'] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const location = value as Record<string, unknown>;
  if (
    typeof location.file === 'string' &&
    location.file.length > 0 &&
    Number.isSafeInteger(location.line) &&
    (location.line as number) > 0 &&
    Number.isSafeInteger(location.column) &&
    (location.column as number) > 0 &&
    typeof location.rule_id === 'string' &&
    /^CWE-[1-9][0-9]*$/.test(location.rule_id)
  ) {
    return {
      file: location.file,
      line: location.line as number,
      column: location.column as number,
      rule_id: location.rule_id,
    };
  }
  return undefined;
}

/** Return producer IDs still present in a fully serialized model context. */
export function findLeakedProducerIds(modelContext: string, producerIds: Iterable<string>): string[] {
  const leaked: string[] = [];
  for (const producerId of new Set(producerIds)) {
    if (producerId.length > 0 && modelContext.includes(producerId)) leaked.push(producerId);
  }
  return leaked;
}

/**
 * Rebuild one model-visible observation from declared primitive evidence only.
 * Internal keys and non-primitive evidence never cross this boundary.
 */
export function toObservationView(
  observation: ReconciliationObservation,
  vulnerabilityClass: ReconciliationClass,
  producerIds: Iterable<string>,
): ObservationView {
  const source = observation as unknown as Record<string, unknown>;
  const view: Record<string, unknown> = {};

  for (const key of QUEUE_ENTRY_FIELD_NAMES[vulnerabilityClass]) {
    if (key === 'ID') continue;
    const value = source[key];
    if (key === BOOLEAN_EVIDENCE_KEY) {
      if (typeof value === 'boolean') view[key] = value;
      continue;
    }
    if (typeof value === 'string') view[key] = value;
  }

  if (source.scan_source === 'vulnerability_analysis' || source.scan_source === 'sast') {
    view.scan_source = source.scan_source;
  }
  if (source.priority === 'P1' || source.priority === 'P2' || source.priority === 'P3') {
    view.priority = source.priority;
  }
  const location = rebuildSastSourceLocation(source.sast_source_location);
  if (location !== undefined) view.sast_source_location = location;

  const sortedIds = [...new Set(producerIds)].filter((id) => id.length > 0).sort((a, b) => b.length - a.length);
  return redactDeep(view, sortedIds) as ObservationView;
}
