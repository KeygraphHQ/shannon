// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { createHash } from 'node:crypto';
import path from 'node:path';
import type { EvidenceProvenance, NormalizedExchange } from '../types/blackbox.js';
import { atomicWrite, ensureDirectory } from '../utils/file-io.js';
import type { HistorySnapshot, RawHistoryRecord, TrafficCaptureInput } from './burp-client.js';
import { BURP_NO_REQUEST, BURP_NO_RESPONSE, BURP_TRUNCATION_MARKER } from './burp-client.js';
import { getHeaderValues, parseHttpRequest, parseHttpResponse } from './http-message.js';
import { assertRequestInScope, requestMatchesScope } from './scope-guard.js';

const REDACTED_NAME = '<redacted>';
const MAX_BODY_SHAPE_LENGTH = 512;

export interface TrafficNormalizationInput extends TrafficCaptureInput {
  readonly provenance: EvidenceProvenance;
  readonly captureSequenceOffset?: number;
}

export interface RawExchangeNormalizationInput {
  readonly targetOrigin: string;
  readonly rules: TrafficCaptureInput['rules'];
  readonly identity: TrafficCaptureInput['identity'];
  readonly raw: RawHistoryRecord;
  readonly captureSequence: number;
  readonly configuredSecrets: readonly string[];
  readonly provenance: EvidenceProvenance;
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function historyHash(raw: Pick<RawHistoryRecord, 'request' | 'response'>): string {
  return sha256(`${raw.request}\0${raw.response}`);
}

export function diffHistory(before: HistorySnapshot, after: HistorySnapshot): readonly RawHistoryRecord[] {
  const seen = new Map<string, number>();
  const delta: RawHistoryRecord[] = [];

  for (const raw of after.orderedRecords) {
    const hash = historyHash(raw);
    const occurrence = (seen.get(hash) ?? 0) + 1;
    seen.set(hash, occurrence);
    if (occurrence > (before.occurrenceCounts[hash] ?? 0)) {
      delta.push({ ...raw, occurrence });
    }
  }

  return delta;
}

function firstHeader(
  headers: readonly { readonly name: string; readonly value: string }[],
  name: string,
): string | null {
  return getHeaderValues(headers, name)[0] ?? null;
}

function mediaType(value: string | null, configuredSecrets: readonly string[]): string | null {
  if (!value || containsConfiguredSecret(value, configuredSecrets)) return null;
  const candidate = value.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return /^[!#$%&'*+\-.^_`|~0-9a-z]+\/[!#$%&'*+\-.^_`|~0-9a-z]+$/.test(candidate) ? candidate : null;
}

function isSensitiveName(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const sensitiveSubstring = [
    'authorization',
    'cookie',
    'csrf',
    'xsrf',
    'password',
    'passwd',
    'secret',
    'session',
    'token',
    'jwt',
    'apikey',
    'privatekey',
  ].some((marker) => normalized.includes(marker));
  return sensitiveSubstring || ['pass', 'state', 'nonce', 'key'].includes(normalized);
}

function containsConfiguredSecret(value: string, configuredSecrets: readonly string[]): boolean {
  return configuredSecrets.some((secret) => secret.length > 0 && value.includes(secret));
}

function isObjectIdentifier(value: string): boolean {
  return (
    /^\d+$/.test(value) ||
    /^[0-9a-f]{24}$/i.test(value) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function isLikelySecretValue(value: string): boolean {
  if (/^[A-Za-z0-9_-]{9,}\.[A-Za-z0-9_-]{9,}\.[A-Za-z0-9_-]{9,}$/.test(value)) return true;
  return value.length >= 32 && /^[A-Za-z0-9._~-]+$/.test(value) && !isObjectIdentifier(value);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizedPath(
  pathname: string,
  configuredSecrets: readonly string[],
): { readonly path: string; readonly objectReferences: readonly string[] } {
  const references = new Set<string>();
  const segments = pathname.split('/');
  const normalized = segments.map((segment, index) => {
    if (segment === '') return segment;
    const decoded = safeDecode(segment);
    const previous = index > 0 ? safeDecode(segments[index - 1] ?? '') : '';
    if (
      isSensitiveName(previous) ||
      containsConfiguredSecret(decoded, configuredSecrets) ||
      containsConfiguredSecret(segment, configuredSecrets) ||
      isLikelySecretValue(decoded)
    ) {
      return '{redacted}';
    }
    if (isObjectIdentifier(decoded)) {
      references.add(decoded);
      return '{id}';
    }
    return segment;
  });
  return { path: normalized.join('/') || '/', objectReferences: [...references] };
}

function safeFieldName(name: string, configuredSecrets: readonly string[]): string {
  return isSensitiveName(name) || containsConfiguredSecret(name, configuredSecrets) ? REDACTED_NAME : name;
}

function jsonShape(value: unknown, configuredSecrets: readonly string[], depth = 0): string {
  if (depth >= 6) return 'nested';
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    const shapes = [
      ...new Set(value.slice(0, 8).map((entry) => jsonShape(entry, configuredSecrets, depth + 1))),
    ].sort();
    return `[${shapes.join('|')}]`;
  }
  switch (typeof value) {
    case 'boolean':
    case 'number':
    case 'string':
      return typeof value;
    case 'object': {
      const entries = Object.entries(value as Record<string, unknown>)
        .map(([key, entry]) => {
          const safeKey = safeFieldName(key, configuredSecrets);
          return `${safeKey}:${safeKey === REDACTED_NAME ? 'redacted' : jsonShape(entry, configuredSecrets, depth + 1)}`;
        })
        .sort();
      return `{${entries.join(',')}}`;
    }
    default:
      return 'unknown';
  }
}

function boundShape(shape: string): string {
  if (shape.length <= MAX_BODY_SHAPE_LENGTH) return shape;
  return `${shape.slice(0, MAX_BODY_SHAPE_LENGTH - 21)}...#${sha256(shape).slice(0, 16)}`;
}

function describeBody(body: string, contentType: string | null, configuredSecrets: readonly string[]): string {
  if (body.length === 0) return 'none';
  if (contentType?.includes('json') || /^[\t\r\n ]*[[{]/.test(body)) {
    try {
      return boundShape(`json:${jsonShape(JSON.parse(body), configuredSecrets)}`);
    } catch {
      return 'json:malformed';
    }
  }
  if (contentType === 'application/x-www-form-urlencoded') {
    const keys = [
      ...new Set([...new URLSearchParams(body).keys()].map((key) => safeFieldName(key, configuredSecrets))),
    ].sort();
    return boundShape(`form:${keys.join(',')}`);
  }
  if (contentType?.startsWith('multipart/')) return 'multipart';
  const bucket = body.length <= 32 ? '1-32' : body.length <= 256 ? '33-256' : '257+';
  return `text:${bucket}`;
}

function isReferenceField(name: string): boolean {
  return /(^|[-_])(id|ids|uuid|key|slug|number)($|[-_])/i.test(name) || /(?:Id|ID)$/.test(name);
}

function addCandidate(candidates: Set<string>, value: unknown, configuredSecrets: readonly string[]): void {
  if (typeof value !== 'string' && typeof value !== 'number') return;
  const candidate = String(value).trim();
  if (
    candidate.length === 0 ||
    candidate.length > 128 ||
    containsConfiguredSecret(candidate, configuredSecrets) ||
    isLikelySecretValue(candidate)
  ) {
    return;
  }
  candidates.add(candidate);
}

function collectJsonCandidates(
  value: unknown,
  configuredSecrets: readonly string[],
  candidates: Set<string>,
  depth = 0,
): void {
  if (depth >= 6 || value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 32)) collectJsonCandidates(entry, configuredSecrets, candidates, depth + 1);
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const sensitive = isSensitiveName(key) || containsConfiguredSecret(key, configuredSecrets);
    if (!sensitive && isReferenceField(key)) {
      if (Array.isArray(entry)) {
        for (const item of entry.slice(0, 32)) addCandidate(candidates, item, configuredSecrets);
      } else {
        addCandidate(candidates, entry, configuredSecrets);
      }
    }
    if (!sensitive) collectJsonCandidates(entry, configuredSecrets, candidates, depth + 1);
  }
}

function collectBodyCandidates(
  body: string,
  contentType: string | null,
  configuredSecrets: readonly string[],
  candidates: Set<string>,
): void {
  if (body.length === 0) return;
  if (contentType?.includes('json') || /^[\t\r\n ]*[[{]/.test(body)) {
    try {
      collectJsonCandidates(JSON.parse(body), configuredSecrets, candidates);
    } catch {
      return;
    }
  } else if (contentType === 'application/x-www-form-urlencoded') {
    for (const [key, value] of new URLSearchParams(body)) {
      if (safeFieldName(key, configuredSecrets) !== REDACTED_NAME && isReferenceField(key)) {
        addCandidate(candidates, value, configuredSecrets);
      }
    }
  }
}

function collapseKey(exchange: NormalizedExchange): string {
  return JSON.stringify({
    identity: exchange.identity,
    captureSequence: exchange.captureSequence,
    method: exchange.method,
    origin: exchange.origin,
    path: exchange.path,
    queryKeys: exchange.queryKeys,
    bodyShape: exchange.bodyShape,
    requestContentType: exchange.requestContentType,
    responseStatus: exchange.responseStatus,
    responseContentType: exchange.responseContentType,
    responseFingerprint: exchange.responseFingerprint,
    candidateObjectReferences: exchange.candidateObjectReferences,
  });
}

export function collapseExchanges(exchanges: readonly NormalizedExchange[]): readonly NormalizedExchange[] {
  const collapsed = new Map<string, NormalizedExchange>();
  for (const exchange of exchanges) {
    const key = collapseKey(exchange);
    if (!collapsed.has(key)) collapsed.set(key, exchange);
  }
  return [...collapsed.values()];
}

export function normalizeRawExchange(input: RawExchangeNormalizationInput): NormalizedExchange | null {
  if (!Number.isInteger(input.captureSequence) || input.captureSequence < 1) {
    throw new Error('Capture sequence must be a positive integer');
  }
  if (input.raw.request === BURP_NO_REQUEST || input.raw.request.endsWith(BURP_TRUNCATION_MARKER)) return null;

  const request = parseHttpRequest(input.raw.request);
  if (!requestMatchesScope(request, input.targetOrigin, input.rules)) return null;
  const target = assertRequestInScope(request, input.targetOrigin, input.rules);
  const requestContentType = mediaType(firstHeader(request.headers, 'content-type'), input.configuredSecrets);
  const pathResult = normalizedPath(target.path, input.configuredSecrets);
  const queryKeys = [
    ...new Set([...target.query.keys()].map((key) => safeFieldName(key, input.configuredSecrets))),
  ].sort();
  const bodyShape = describeBody(request.body, requestContentType, input.configuredSecrets);
  const candidates = new Set(pathResult.objectReferences);
  for (const [key, value] of target.query) {
    if (safeFieldName(key, input.configuredSecrets) !== REDACTED_NAME && isReferenceField(key)) {
      addCandidate(candidates, value, input.configuredSecrets);
    }
  }
  collectBodyCandidates(request.body, requestContentType, input.configuredSecrets, candidates);

  const responseUnavailable =
    input.raw.response.length === 0 ||
    input.raw.response === BURP_NO_RESPONSE ||
    input.raw.response.endsWith(BURP_TRUNCATION_MARKER);
  const response = responseUnavailable ? null : parseHttpResponse(input.raw.response);
  const responseContentType = response
    ? mediaType(firstHeader(response.headers, 'content-type'), input.configuredSecrets)
    : null;
  const rawHash = historyHash(input.raw);
  const exchangeId = `ex_${sha256(
    `${input.provenance.taskId}\0${input.identity}\0${input.captureSequence}\0${rawHash}`,
  ).slice(0, 24)}`;
  const origin = target.origin;
  const routeSignature = `route_${sha256(
    `${request.method}\0${origin}\0${pathResult.path}\0${queryKeys.join(',')}\0${bodyShape}`,
  ).slice(0, 24)}`;

  return {
    exchangeId,
    routeSignature,
    identity: input.identity,
    captureSequence: input.captureSequence,
    method: request.method,
    origin,
    path: pathResult.path,
    queryKeys,
    bodyShape,
    requestContentType,
    responseStatus: response?.status ?? 0,
    responseContentType,
    responseFingerprint: `sha256:${sha256(responseUnavailable ? BURP_NO_RESPONSE : input.raw.response)}`,
    candidateObjectReferences: [...candidates].sort(),
    rawRecordRef: `raw:${exchangeId}`,
    provenance: structuredClone(input.provenance),
  };
}

export async function normalizeCapturedTraffic(
  input: TrafficNormalizationInput,
): Promise<readonly NormalizedExchange[]> {
  const captureSequenceOffset = input.captureSequenceOffset ?? 0;
  if (!Number.isSafeInteger(captureSequenceOffset) || captureSequenceOffset < 0) {
    throw new Error('Capture sequence offset must be a non-negative safe integer');
  }
  const delta = diffHistory(input.before, input.after);
  const normalized: NormalizedExchange[] = [];
  let directoryReady = false;
  for (const raw of delta) {
    const exchange = normalizeRawExchange({
      targetOrigin: input.targetOrigin,
      rules: input.rules,
      identity: input.identity,
      raw,
      captureSequence: captureSequenceOffset + normalized.length + 1,
      configuredSecrets: input.configuredSecrets,
      provenance: input.provenance,
    });
    if (!exchange) continue;
    if (!directoryReady) {
      await ensureDirectory(input.rawDirectory);
      directoryReady = true;
    }
    await atomicWrite(path.join(input.rawDirectory, `${exchange.exchangeId}.json`), raw);
    normalized.push(exchange);
  }

  return collapseExchanges(normalized);
}
