// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto';
import type { HttpHeader, ParsedHttpRequest, ParsedHttpResponse } from '../blackbox/http-message.js';
import { parseHttpRequest, parseHttpResponse } from '../blackbox/http-message.js';
import type {
  ObservationDiagnostic,
  ObservationLimits,
  ObservedExchange,
  RawObservation,
  RawRecordInput,
  SourceRef,
} from './types.js';

// Native saved-data literals. Importing the live Burp client is deliberately unnecessary.
const NO_REQUEST = '<no request>';
const NO_RESPONSE = '<no response>';
const TRUNCATION = '... (truncated)';
const NATIVE_ID = /^ex_[a-f0-9]{24}$/;
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

interface SavedRaw {
  readonly request: string;
  readonly response: string;
  readonly notes: string;
  readonly occurrence: number;
}
export interface AssociatedRawEvidence {
  readonly exchangeId: string;
  readonly occurrenceKey: string;
  readonly sharedOccurrence: boolean;
  readonly request: { readonly method: string; readonly target: string; readonly body: string };
  readonly response: {
    readonly status: number;
    readonly headers: readonly HttpHeader[];
    readonly body: string;
  } | null;
  readonly sources: readonly SourceRef[];
}
interface RawAnalysis {
  readonly exchanges: readonly ObservedExchange[];
  readonly diagnostics: readonly ObservationDiagnostic[];
  readonly evidence: readonly AssociatedRawEvidence[];
}
const MESSAGES = {
  'raw-missing': 'An optional associated raw file is unavailable in the supplied raw evidence.',
  'raw-invalid': 'Supplied raw evidence does not have a usable native saved-record representation.',
  'raw-unassociated': 'A supplied raw entry does not identify a supported selected exchange.',
  'raw-record-conflict': 'Multiple supplied raw entries disagree for the same exchange identifier.',
  'raw-association-unavailable': 'Saved identity or capture metadata is insufficient to assess raw-record association.',
  'raw-association-mismatch': 'The supplied raw record does not match the native identifier of its recorded exchange.',
  'raw-response-conflict': 'Associated raw response evidence contradicts saved normalized response metadata.',
  'shared-raw-source':
    'Distinct exchanges reference the same saved raw history occurrence; independent attribution is uncertain.',
  'input-limit': 'Saved raw evidence exceeds the enforced input limit.',
} as const;

function references(values: readonly SourceRef[]): readonly SourceRef[] {
  return [...new Map(values.map((value) => [JSON.stringify(value), value])).entries()]
    .sort(([left], [right]) => compare(left, right))
    .map(([, value]) => value);
}
function validRaw(value: unknown): value is SavedRaw {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 4 &&
    typeof record.request === 'string' &&
    typeof record.response === 'string' &&
    typeof record.notes === 'string' &&
    typeof record.occurrence === 'number' &&
    Number.isSafeInteger(record.occurrence) &&
    record.occurrence > 0
  );
}
function parsedRequest(raw: SavedRaw): ParsedHttpRequest | null {
  if (!raw.request || raw.request === NO_REQUEST || raw.request.endsWith(TRUNCATION)) return null;
  try {
    return parseHttpRequest(raw.request);
  } catch {
    return null;
  }
}
function signature(record: RawRecordInput): string {
  if (record.availability !== 'available' || !validRaw(record.document)) return record.availability;
  const raw = record.document;
  return JSON.stringify([record.availability, raw.request, raw.response, raw.notes, raw.occurrence]);
}
function analysis(
  exchanges: readonly ObservedExchange[],
  diagnostics: readonly ObservationDiagnostic[],
  evidence: readonly AssociatedRawEvidence[],
): RawAnalysis {
  const result = { exchanges, diagnostics } as RawAnalysis;
  Object.defineProperty(result, 'evidence', { value: evidence, enumerable: false });
  return result;
}
function limited(): RawAnalysis {
  return analysis([], [{ code: 'input-limit', message: MESSAGES['input-limit'], sources: [] }], []);
}

/** Associate explicitly supplied native records without exposing or executing any message content. */
export function associateRaw(
  exchanges: readonly ObservedExchange[],
  records: readonly RawRecordInput[] | undefined,
  requested: boolean,
  limits: ObservationLimits,
): RawAnalysis {
  if (!requested) {
    return analysis(
      exchanges.map((exchange) => ({
        ...exchange,
        raw: { availability: 'not-supplied', association: 'not-assessed', response: 'unknown', sources: [] },
      })),
      [],
      [],
    );
  }
  const selectedIds = new Set(exchanges.map((exchange) => exchange.exchangeId));
  if (
    selectedIds.size > limits.maxRawFiles ||
    new Set(records?.map((record) => record.exchangeId)).size > limits.maxRawFiles
  )
    return limited();
  const diagnostics: ObservationDiagnostic[] = [];
  const diagnose = (code: keyof typeof MESSAGES, sources: readonly SourceRef[]): void => {
    diagnostics.push({ code, message: MESSAGES[code], sources: references(sources) });
  };
  const byId = new Map<string, RawRecordInput[]>();
  for (const record of records ?? []) {
    try {
      const serialized = JSON.stringify(record.document);
      if (serialized !== undefined && Buffer.byteLength(serialized) > limits.maxRawBytes) return limited();
    } catch {
      // The pure helper receives JSON data. Non-JSON payloads remain invalid and never produce exception text.
      diagnose('raw-invalid', []);
      continue;
    }
    if (
      typeof record.exchangeId !== 'string' ||
      !NATIVE_ID.test(record.exchangeId) ||
      !selectedIds.has(record.exchangeId)
    ) {
      diagnose('raw-unassociated', []);
      continue;
    }
    const entries = byId.get(record.exchangeId) ?? [];
    entries.push(record);
    byId.set(record.exchangeId, entries);
  }
  const shared = new Map<string, { exchangeId: string; sources: readonly SourceRef[] }[]>();
  const associatedEvidence: AssociatedRawEvidence[] = [];
  const observed = exchanges.map((exchange): ObservedExchange => {
    const source: SourceRef = { source: 'raw', pointer: '', exchangeId: exchange.exchangeId };
    const sourceRefs = [source];
    const evidenceRefs = [...exchange.sources, source];
    const entries = byId.get(exchange.exchangeId) ?? [];
    const entry = entries[0];
    const evidence = (raw: RawObservation): ObservedExchange => ({ ...exchange, raw });
    if (new Set(entries.map(signature)).size > 1) {
      diagnose('raw-record-conflict', evidenceRefs);
      return evidence({
        availability: 'invalid',
        association: 'not-assessed',
        response: 'unknown',
        sources: sourceRefs,
      });
    }
    if (!entry || entry.availability === 'missing') {
      diagnose('raw-missing', evidenceRefs);
      return evidence({
        availability: 'missing',
        association: 'not-assessed',
        response: 'unknown',
        sources: sourceRefs,
      });
    }
    if (entry.availability !== 'available' || !validRaw(entry.document)) {
      diagnose('raw-invalid', evidenceRefs);
      return evidence({
        availability: 'invalid',
        association: 'not-assessed',
        response: 'unknown',
        sources: sourceRefs,
      });
    }
    const raw = entry.document;
    const request = parsedRequest(raw);
    if (!request) {
      diagnose('raw-invalid', evidenceRefs);
      return evidence({
        availability: 'invalid',
        association: 'not-assessed',
        response: 'unknown',
        sources: sourceRefs,
      });
    }
    if (exchange.recordedIdentity === null || exchange.captureSequence === null) {
      diagnose('raw-association-unavailable', evidenceRefs);
      return evidence({
        availability: 'available',
        association: 'not-assessed',
        response: 'unknown',
        sources: sourceRefs,
      });
    }
    const historyHash = sha256(`${raw.request}\0${raw.response}`);
    const expectedId = `ex_${sha256(`${exchange.provenance.taskId}\0${exchange.recordedIdentity}\0${exchange.captureSequence}\0${historyHash}`).slice(0, 24)}`;
    if (expectedId !== exchange.exchangeId) {
      diagnose('raw-association-mismatch', evidenceRefs);
      return evidence({ availability: 'available', association: 'mismatch', response: 'unknown', sources: sourceRefs });
    }
    const occurrenceKey = `${historyHash}:${raw.occurrence}`;
    const occurrence = shared.get(occurrenceKey) ?? [];
    occurrence.push({ exchangeId: exchange.exchangeId, sources: evidenceRefs });
    shared.set(occurrenceKey, occurrence);
    const absent = raw.response.length === 0 || raw.response === NO_RESPONSE;
    const truncated = !absent && raw.response.endsWith(TRUNCATION);
    let response: RawObservation['response'] = absent ? 'absent' : truncated ? 'truncated' : 'malformed';
    let status = 0;
    let parsedResponse: ParsedHttpResponse | null = null;
    if (!absent && !truncated) {
      try {
        parsedResponse = parseHttpResponse(raw.response);
        status = parsedResponse.status;
        if (status >= 100 && status <= 599) response = 'usable';
      } catch {
        // A malformed present response keeps its own byte fingerprint, matching the native projection.
      }
    }
    const fingerprint = `sha256:${sha256(absent || truncated ? NO_RESPONSE : raw.response)}`;
    if (
      (exchange.responseFingerprint !== null && exchange.responseFingerprint !== fingerprint) ||
      (exchange.responseStatus !== null && exchange.responseStatus !== status)
    ) {
      diagnose('raw-response-conflict', evidenceRefs);
      response = 'conflicting';
    }
    associatedEvidence.push({
      exchangeId: exchange.exchangeId,
      occurrenceKey,
      sharedOccurrence: false,
      request: { method: request.method, target: request.target, body: request.body },
      response:
        response === 'usable' && parsedResponse
          ? { status: parsedResponse.status, headers: parsedResponse.headers, body: parsedResponse.body }
          : null,
      sources: references(evidenceRefs),
    });
    return evidence({ availability: 'available', association: 'matched', response, sources: sourceRefs });
  });
  const sharedOccurrenceKeys = new Set<string>();
  for (const [occurrenceKey, occurrence] of shared) {
    if (new Set(occurrence.map((value) => value.exchangeId)).size > 1) {
      sharedOccurrenceKeys.add(occurrenceKey);
      diagnose(
        'shared-raw-source',
        occurrence.flatMap((value) => value.sources),
      );
    }
  }
  const stableDiagnostics = [
    ...new Map(diagnostics.map((diagnostic) => [JSON.stringify(diagnostic), diagnostic])).values(),
  ].sort(
    (left, right) =>
      compare(left.code, right.code) || compare(JSON.stringify(left.sources), JSON.stringify(right.sources)),
  );
  return analysis(
    observed,
    stableDiagnostics,
    associatedEvidence
      .map((value) => ({ ...value, sharedOccurrence: sharedOccurrenceKeys.has(value.occurrenceKey) }))
      .sort((left, right) => compare(left.exchangeId, right.exchangeId)),
  );
}
