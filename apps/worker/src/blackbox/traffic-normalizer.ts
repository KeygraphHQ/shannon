// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { createHash } from 'node:crypto';
import path from 'node:path';
import type { EvidenceProvenance, NormalizedExchange } from '../types/blackbox.js';
import type { IdentityBoundRequestField } from '../types/config.js';
import { atomicWrite, ensureDirectory } from '../utils/file-io.js';
import type { HistorySnapshot, RawHistoryRecord, TrafficCaptureInput } from './burp-client.js';
import { BURP_NO_REQUEST, BURP_NO_RESPONSE, BURP_TRUNCATION_MARKER } from './burp-client.js';
import type { ParsedHttpRequest, ParsedHttpResponse } from './http-message.js';
import { getHeaderValues, HttpMessageParseError, parseHttpRequest, parseHttpResponse } from './http-message.js';
import { assertRequestInScope, requestMatchesScope } from './scope-guard.js';

const REDACTED_NAME = '<redacted>';
const MAX_BODY_SHAPE_LENGTH = 512;
export const SHANNON_CAPTURE_HEADER = 'X-Shannon-Capture';

export interface TrafficNormalizationInput extends TrafficCaptureInput {
  readonly provenance: EvidenceProvenance;
  readonly captureToken: string;
  readonly identityBoundRequestFields: readonly IdentityBoundRequestField[];
  readonly captureSequenceOffset?: number;
  readonly routeSignature?: string;
}

export interface RawExchangeNormalizationInput {
  readonly targetOrigin: string;
  readonly rules: TrafficCaptureInput['rules'];
  readonly identity: TrafficCaptureInput['identity'];
  readonly raw: RawHistoryRecord;
  readonly captureSequence: number;
  readonly configuredSecrets: readonly string[];
  readonly identityBoundRequestFields: readonly IdentityBoundRequestField[];
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

function validateCaptureToken(captureToken: string): void {
  if (captureToken.length < 16 || captureToken.length > 256 || !/^[\x21-\x7e]+$/.test(captureToken)) {
    throw new Error('Capture token must be a bounded printable header value');
  }
}

function redactCaptureToken(value: string, captureToken: string): string {
  const replacementCharacter = /^x+$/i.test(captureToken) ? 'y' : 'x';
  return value.split(captureToken).join(replacementCharacter.repeat(captureToken.length));
}

export function filterCapturedTrafficByToken(
  records: readonly RawHistoryRecord[],
  captureToken: string,
): readonly RawHistoryRecord[] {
  validateCaptureToken(captureToken);
  const captureHeader = SHANNON_CAPTURE_HEADER.toLowerCase();
  return records.flatMap((raw): readonly RawHistoryRecord[] => {
    let request: ReturnType<typeof parseHttpRequest>;
    try {
      request = parseHttpRequest(raw.request);
    } catch {
      return [];
    }
    const values = getHeaderValues(request.headers, captureHeader);
    if (values.length !== 1 || values[0] !== captureToken) return [];
    const lineEnding = raw.request.includes('\r\n') ? '\r\n' : '\n';
    const sanitizedRequest = [
      `${request.method} ${request.target} HTTP/${request.version}`,
      ...request.headers
        .filter(({ name }) => name.toLowerCase() !== captureHeader)
        .map(({ name, value }) => `${name}: ${value}`),
      '',
      request.body,
    ].join(lineEnding);
    return [
      {
        ...raw,
        request: redactCaptureToken(sanitizedRequest, captureToken),
        response: redactCaptureToken(raw.response, captureToken),
        notes: redactCaptureToken(raw.notes, captureToken),
      },
    ];
  });
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

export function isSensitiveRequestFieldName(name: string): boolean {
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
    'authenticity',
  ].some((marker) => normalized.includes(marker));
  return sensitiveSubstring || ['pass', 'state', 'nonce', 'key'].includes(normalized);
}

export function isImplicitIdentityBoundRequestFieldName(name: string): boolean {
  const parts = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const compact = parts.join('');
  if (parts.some((part) => ['authorization', 'authenticity', 'csrf', 'xsrf', 'jwt'].includes(part))) {
    return true;
  }
  if (/(?:csrf|xsrf|jwt)/.test(compact)) return true;
  const workflowToken =
    parts.includes('token') &&
    parts.some((part) =>
      ['page', 'pagination', 'cursor', 'continuation', 'next', 'reset', 'invite', 'recovery'].includes(part),
    );
  if (workflowToken) return false;
  if (parts.includes('password') || parts.includes('passwd')) {
    return !parts.some((part) => ['new', 'confirm', 'confirmation'].includes(part));
  }
  if (
    parts.includes('token') &&
    (parts.length === 1 ||
      parts.some((part) =>
        ['access', 'auth', 'bearer', 'id', 'refresh', 'session', 'api', 'oauth', 'oauth2', 'sso', 'security'].includes(
          part,
        ),
      ))
  ) {
    return true;
  }
  if (parts.includes('secret')) {
    return !parts.some((part) => ['new', 'reset', 'invite', 'recovery'].includes(part));
  }
  if (parts.includes('credential') || parts.includes('bearer')) return true;
  if (parts.includes('cookie')) {
    return !parts.some((part) => ['consent', 'preference', 'preferences'].includes(part));
  }
  if (parts.includes('api') && parts.includes('key')) return true;
  if (parts.includes('private') && parts.includes('key')) return true;
  if (parts.includes('auth') || parts.includes('authentication')) return true;
  if (parts.includes('session')) {
    return parts.length === 1 || parts.some((part) => ['id', 'key', 'token', 'jwt', 'state'].includes(part));
  }
  return compact === 'pass' || /^(?:phpsessid|(?:php|j)?sessionid)$/.test(compact);
}

export function isImplicitAuthenticationRequestFieldName(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/(?:csrf|xsrf|authenticity|password|passwd)/.test(normalized) || normalized === 'pass') return false;
  return isImplicitIdentityBoundRequestFieldName(name);
}

export function isSynchronizationRequestFieldName(name: string): boolean {
  return /(?:csrf|xsrf|authenticity)/.test(name.toLowerCase().replace(/[^a-z0-9]/g, ''));
}

function containsConfiguredSecret(value: string, configuredSecrets: readonly string[]): boolean {
  return configuredSecrets.some((secret) => secret.length > 0 && value.includes(secret));
}

interface IdentityBoundSelectors {
  readonly headerNames: ReadonlySet<string>;
  readonly queryNames: ReadonlySet<string>;
  readonly formNames: ReadonlySet<string>;
  readonly jsonPaths: readonly (readonly string[])[];
}

function identityBoundSelectors(fields: readonly IdentityBoundRequestField[]): IdentityBoundSelectors {
  return {
    headerNames: new Set(
      fields
        .filter((field) => field.location === 'header')
        .map((field) => (field as { name: string }).name.toLowerCase()),
    ),
    queryNames: new Set(
      fields.filter((field) => field.location === 'query').map((field) => (field as { name: string }).name),
    ),
    formNames: new Set(
      fields.filter((field) => field.location === 'form').map((field) => (field as { name: string }).name),
    ),
    jsonPaths: fields
      .filter((field): field is Extract<IdentityBoundRequestField, { location: 'json' }> => field.location === 'json')
      .map(({ pointer }) =>
        pointer
          .slice(1)
          .split('/')
          .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~')),
      ),
  };
}

function addBoundValue(values: Set<string>, value: unknown): void {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const normalized = String(value);
    if (normalized.length > 0) values.add(normalized);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const entry of value) addBoundValue(values, entry);
    return;
  }
  for (const entry of Object.values(value as Record<string, unknown>)) addBoundValue(values, entry);
}

function collectBoundJsonValues(
  value: unknown,
  selectors: IdentityBoundSelectors,
  values: Set<string>,
  path_: readonly (string | number)[] = [],
  depth = 0,
): void {
  if (isIdentityBoundJsonPath(path_, selectors)) {
    addBoundValue(values, value);
    return;
  }
  if (depth > 12 && !isIdentityBoundJsonPrefix(path_, selectors)) return;
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectBoundJsonValues(entry, selectors, values, [...path_, index], depth + 1);
    });
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (isImplicitIdentityBoundRequestFieldName(key)) addBoundValue(values, entry);
    else collectBoundJsonValues(entry, selectors, values, [...path_, key], depth + 1);
  }
}

function identityBoundRequestValues(
  request: ReturnType<typeof parseHttpRequest>,
  target: ReturnType<typeof assertRequestInScope>,
  contentType: string | null,
  selectors: IdentityBoundSelectors,
): ReadonlySet<string> {
  const values = new Set<string>();
  for (const { name, value } of request.headers) {
    if (selectors.headerNames.has(name.toLowerCase()) || isImplicitIdentityBoundRequestFieldName(name)) {
      addBoundValue(values, value);
      const normalizedName = name.toLowerCase();
      if (normalizedName === 'cookie') {
        for (const pair of value.split(';')) {
          const separator = pair.indexOf('=');
          if (separator >= 0) addBoundValue(values, pair.slice(separator + 1).trim());
        }
      } else if (normalizedName === 'authorization' || normalizedName === 'proxy-authorization') {
        const credential = value.trim().split(/\s+/, 2)[1];
        if (credential) addBoundValue(values, credential);
      }
    }
  }
  for (const [name, value] of target.query) {
    if (selectors.queryNames.has(name) || isImplicitIdentityBoundRequestFieldName(name)) addBoundValue(values, value);
  }
  if (contentType === 'application/x-www-form-urlencoded') {
    for (const [name, value] of new URLSearchParams(request.body)) {
      if (selectors.formNames.has(name) || isImplicitIdentityBoundRequestFieldName(name)) addBoundValue(values, value);
    }
  } else if (contentType?.includes('json') || /^[\t\r\n ]*[[{]/.test(request.body)) {
    try {
      collectBoundJsonValues(JSON.parse(request.body), selectors, values);
    } catch {
      // Malformed bodies have no safely attributable structured carrier values.
    }
  }
  return values;
}

function isIdentityBoundJsonPath(path_: readonly (string | number)[], selectors: IdentityBoundSelectors): boolean {
  return selectors.jsonPaths.some(
    (candidate) =>
      candidate.length === path_.length && candidate.every((segment, index) => segment === String(path_[index])),
  );
}

function isIdentityBoundJsonPrefix(path_: readonly (string | number)[], selectors: IdentityBoundSelectors): boolean {
  return selectors.jsonPaths.some(
    (candidate) =>
      candidate.length > path_.length &&
      candidate.slice(0, path_.length).every((segment, index) => segment === String(path_[index])),
  );
}

function isImplicitCarrierContainer(path_: readonly (string | number)[]): boolean {
  const final = path_.at(-1);
  return (
    typeof final === 'string' &&
    ['auth', 'authentication', 'credentials', 'identity', 'session'].includes(final.toLowerCase())
  );
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
      isSensitiveRequestFieldName(previous) ||
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

function routePathShape(pathname: string, groundedReferences: ReadonlySet<string>): string {
  const segments = pathname.split('/');
  return segments
    .map((segment) => {
      if (segment.length === 0 || /^\{[^}]+\}$/.test(segment)) return segment;
      return groundedReferences.has(safeDecode(segment)) ? '{id}' : segment;
    })
    .join('/');
}

function safeFieldName(name: string, configuredSecrets: readonly string[]): string {
  return isSensitiveRequestFieldName(name) || containsConfiguredSecret(name, configuredSecrets) ? REDACTED_NAME : name;
}

function safeRequestShapeFieldName(name: string, configuredSecrets: readonly string[]): string {
  return isImplicitIdentityBoundRequestFieldName(name) || containsConfiguredSecret(name, configuredSecrets)
    ? REDACTED_NAME
    : name;
}

function jsonShape(
  value: unknown,
  configuredSecrets: readonly string[],
  selectors: IdentityBoundSelectors,
  path_: readonly (string | number)[] = [],
  depth = 0,
): string {
  if (depth >= 6) return 'nested';
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    const shapes = [
      ...new Set(
        value
          .slice(0, 8)
          .map((entry, index) => jsonShape(entry, configuredSecrets, selectors, [...path_, index], depth + 1)),
      ),
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
          const nextPath = [...path_, key];
          const safeKey = isIdentityBoundJsonPath(nextPath, selectors)
            ? REDACTED_NAME
            : safeRequestShapeFieldName(key, configuredSecrets);
          return `${safeKey}:${
            safeKey === REDACTED_NAME ? 'redacted' : jsonShape(entry, configuredSecrets, selectors, nextPath, depth + 1)
          }`;
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

function describeBody(
  body: string,
  contentType: string | null,
  configuredSecrets: readonly string[],
  selectors: IdentityBoundSelectors,
): string {
  if (body.length === 0) return 'none';
  if (contentType?.includes('json') || /^[\t\r\n ]*[[{]/.test(body)) {
    try {
      return boundShape(`json:${jsonShape(JSON.parse(body), configuredSecrets, selectors)}`);
    } catch {
      return 'json:malformed';
    }
  }
  if (contentType === 'application/x-www-form-urlencoded') {
    const keys = [
      ...new Set(
        [...new URLSearchParams(body).keys()].map((key) =>
          selectors.formNames.has(key) ? REDACTED_NAME : safeRequestShapeFieldName(key, configuredSecrets),
        ),
      ),
    ].sort();
    return boundShape(`form:${keys.join(',')}`);
  }
  if (contentType?.startsWith('multipart/')) return 'multipart';
  const bucket = body.length <= 32 ? '1-32' : body.length <= 256 ? '33-256' : '257+';
  return `text:${bucket}`;
}

function routeJsonShape(
  value: unknown,
  configuredSecrets: readonly string[],
  selectors: IdentityBoundSelectors,
  path_: readonly (string | number)[] = [],
  depth = 0,
): string | null {
  if (isIdentityBoundJsonPath(path_, selectors)) return null;
  if (depth >= 6) return 'nested';
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    const projected = value
      .slice(0, 8)
      .map((entry, index) => routeJsonShape(entry, configuredSecrets, selectors, [...path_, index], depth + 1));
    if (
      path_.length > 0 &&
      projected.length === 0 &&
      (isIdentityBoundJsonPrefix(path_, selectors) || isImplicitCarrierContainer(path_))
    ) {
      return null;
    }
    return `[${projected.map((shape) => shape ?? REDACTED_NAME).join('|')}]`;
  }
  switch (typeof value) {
    case 'boolean':
    case 'number':
    case 'string':
      return typeof value;
    case 'object': {
      const sourceEntries = Object.entries(value as Record<string, unknown>);
      const entries = sourceEntries.flatMap(([key, entry]): readonly string[] => {
        const nextPath = [...path_, key];
        if (
          isIdentityBoundJsonPath(nextPath, selectors) ||
          isImplicitIdentityBoundRequestFieldName(key) ||
          containsConfiguredSecret(key, configuredSecrets)
        ) {
          return [];
        }
        const shape = routeJsonShape(entry, configuredSecrets, selectors, nextPath, depth + 1);
        return shape === null ? [] : [`${key}:${shape}`];
      });
      if (
        path_.length > 0 &&
        entries.length === 0 &&
        (sourceEntries.length > 0 || isIdentityBoundJsonPrefix(path_, selectors) || isImplicitCarrierContainer(path_))
      ) {
        return null;
      }
      return `{${entries.sort().join(',')}}`;
    }
    default:
      return 'unknown';
  }
}

function describeRouteBody(
  body: string,
  contentType: string | null,
  configuredSecrets: readonly string[],
  selectors: IdentityBoundSelectors,
): string {
  if (body.length === 0) return 'none';
  if (contentType?.includes('json') || /^[\t\r\n ]*[[{]/.test(body)) {
    try {
      return boundShape(`json:${routeJsonShape(JSON.parse(body), configuredSecrets, selectors) ?? '{}'}`);
    } catch {
      return 'json:malformed';
    }
  }
  if (contentType === 'application/x-www-form-urlencoded') {
    const keys = [
      ...new Set(
        [...new URLSearchParams(body).keys()].filter(
          (key) =>
            !selectors.formNames.has(key) &&
            !isImplicitIdentityBoundRequestFieldName(key) &&
            !containsConfiguredSecret(key, configuredSecrets),
        ),
      ),
    ].sort();
    return boundShape(`form:${keys.join(',')}`);
  }
  if (contentType?.startsWith('multipart/')) return 'multipart';
  const bucket = body.length <= 32 ? '1-32' : body.length <= 256 ? '33-256' : '257+';
  return `text:${bucket}`;
}

export function isReferenceField(name: string): boolean {
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
  selectors: IdentityBoundSelectors,
  path_: readonly (string | number)[] = [],
  depth = 0,
): void {
  if (depth >= 6 || value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const [index, entry] of value.slice(0, 32).entries()) {
      collectJsonCandidates(entry, configuredSecrets, candidates, selectors, [...path_, index], depth + 1);
    }
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = [...path_, key];
    const sensitive =
      isIdentityBoundJsonPath(nextPath, selectors) ||
      isSensitiveRequestFieldName(key) ||
      containsConfiguredSecret(key, configuredSecrets);
    if (!sensitive && isReferenceField(key)) {
      if (Array.isArray(entry)) {
        for (const [index, item] of entry.slice(0, 32).entries()) {
          if (!isIdentityBoundJsonPath([...nextPath, index], selectors)) {
            addCandidate(candidates, item, configuredSecrets);
          }
        }
      } else {
        addCandidate(candidates, entry, configuredSecrets);
      }
    }
    if (!sensitive) collectJsonCandidates(entry, configuredSecrets, candidates, selectors, nextPath, depth + 1);
  }
}

function collectBodyCandidates(
  body: string,
  contentType: string | null,
  configuredSecrets: readonly string[],
  candidates: Set<string>,
  selectors: IdentityBoundSelectors,
): void {
  if (body.length === 0) return;
  if (contentType?.includes('json') || /^[\t\r\n ]*[[{]/.test(body)) {
    try {
      collectJsonCandidates(JSON.parse(body), configuredSecrets, candidates, selectors);
    } catch {
      return;
    }
  } else if (contentType === 'application/x-www-form-urlencoded') {
    for (const [key, value] of new URLSearchParams(body)) {
      if (
        !selectors.formNames.has(key) &&
        safeFieldName(key, configuredSecrets) !== REDACTED_NAME &&
        isReferenceField(key)
      ) {
        addCandidate(candidates, value, configuredSecrets);
      }
    }
  }
}

// NOTE: A capture window can hold a request Burp recorded verbatim from a non-conforming
// client, which this strict parser rejects. Such a record carries no attributable evidence
// and is skipped on its own, rather than aborting the window and discarding every valid
// exchange captured alongside it. The catch stays narrow so genuine programming errors
// still surface.
function parseUsableRequest(raw: string): ParsedHttpRequest | null {
  try {
    return parseHttpRequest(raw);
  } catch (error) {
    if (error instanceof HttpMessageParseError) return null;
    throw error;
  }
}

// NOTE: Burp records exactly what the peer sent, so a dropped connection or a
// non-conforming server yields a message this strict parser rejects. Such a response is
// treated as if none had been captured rather than aborting the surrounding capture
// window. The catch stays narrow so genuine programming errors still surface.
function parseUsableResponse(raw: string): ParsedHttpResponse | null {
  try {
    return parseHttpResponse(raw);
  } catch (error) {
    if (error instanceof HttpMessageParseError) return null;
    throw error;
  }
}

/**
 * Identity of an exchange for de-duplication. `captureSequence` is deliberately absent: it is
 * an ordinal stamped on each accepted record, so including it would make every key unique and
 * the collapse a no-op. The surviving record of a duplicate pair keeps its own ordinal.
 */
function collapseKey(exchange: NormalizedExchange): string {
  return JSON.stringify({
    identity: exchange.identity,
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

  const request = parseUsableRequest(input.raw.request);
  if (!request) return null;
  if (!requestMatchesScope(request, input.targetOrigin, input.rules)) return null;
  const identitySelectors = identityBoundSelectors(input.identityBoundRequestFields);
  const target = assertRequestInScope(request, input.targetOrigin, input.rules);
  const requestContentType = mediaType(firstHeader(request.headers, 'content-type'), input.configuredSecrets);
  const pathResult = normalizedPath(target.path, input.configuredSecrets);
  const boundRequestValues = identityBoundRequestValues(request, target, requestContentType, identitySelectors);
  const queryKeys = [
    ...new Set(
      [...target.query.keys()].map((key) =>
        identitySelectors.queryNames.has(key) ? REDACTED_NAME : safeRequestShapeFieldName(key, input.configuredSecrets),
      ),
    ),
  ].sort();
  const routeQueryKeys = [
    ...new Set(
      [...target.query.keys()].filter(
        (key) =>
          !identitySelectors.queryNames.has(key) &&
          !isImplicitIdentityBoundRequestFieldName(key) &&
          !containsConfiguredSecret(key, input.configuredSecrets),
      ),
    ),
  ].sort();
  const bodyShape = describeBody(request.body, requestContentType, input.configuredSecrets, identitySelectors);
  const routeBodyShape = describeRouteBody(
    request.body,
    requestContentType,
    input.configuredSecrets,
    identitySelectors,
  );
  const candidates = new Set(pathResult.objectReferences);
  for (const [key, value] of target.query) {
    if (
      !identitySelectors.queryNames.has(key) &&
      safeFieldName(key, input.configuredSecrets) !== REDACTED_NAME &&
      isReferenceField(key)
    ) {
      addCandidate(candidates, value, input.configuredSecrets);
    }
  }
  collectBodyCandidates(request.body, requestContentType, input.configuredSecrets, candidates, identitySelectors);

  const responseUnavailable =
    input.raw.response.length === 0 ||
    input.raw.response === BURP_NO_RESPONSE ||
    input.raw.response.endsWith(BURP_TRUNCATION_MARKER);
  const response = responseUnavailable ? null : parseUsableResponse(input.raw.response);
  const responseContentType = response
    ? mediaType(firstHeader(response.headers, 'content-type'), input.configuredSecrets)
    : null;
  if (response) {
    const responseCandidates = new Set<string>();
    collectBodyCandidates(
      response.body,
      responseContentType,
      input.configuredSecrets,
      responseCandidates,
      identityBoundSelectors([]),
    );
    for (const candidate of responseCandidates) {
      if (!boundRequestValues.has(candidate)) candidates.add(candidate);
    }
  }
  const rawHash = historyHash(input.raw);
  const exchangeId = `ex_${sha256(
    `${input.provenance.taskId}\0${input.identity}\0${input.captureSequence}\0${rawHash}`,
  ).slice(0, 24)}`;
  const origin = target.origin;
  const routeSignature = `route_${sha256(
    `${request.method}\0${origin}\0${routePathShape(pathResult.path, candidates)}\0${routeQueryKeys.join(',')}\0${routeBodyShape}`,
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
    // WARNING: keyed off `responseUnavailable`, not `response === null`. A response that
    // was captured but could not be parsed must keep the fingerprint of its own bytes, or
    // every such response in a window would hash alike and collapse into one exchange.
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
  if (input.routeSignature !== undefined && input.routeSignature.length === 0) {
    throw new Error('Route signature filter must be non-empty');
  }
  const delta = filterCapturedTrafficByToken(diffHistory(input.before, input.after), input.captureToken);
  const configuredSecrets = [...input.configuredSecrets, input.captureToken];
  const normalized: NormalizedExchange[] = [];
  let directoryReady = false;
  for (const raw of delta) {
    const exchange = normalizeRawExchange({
      targetOrigin: input.targetOrigin,
      rules: input.rules,
      identity: input.identity,
      raw,
      captureSequence: captureSequenceOffset + normalized.length + 1,
      configuredSecrets,
      identityBoundRequestFields: input.identityBoundRequestFields,
      provenance: input.provenance,
    });
    if (!exchange || (input.routeSignature !== undefined && exchange.routeSignature !== input.routeSignature)) continue;
    if (!directoryReady) {
      await ensureDirectory(input.rawDirectory);
      directoryReady = true;
    }
    await atomicWrite(path.join(input.rawDirectory, `${exchange.exchangeId}.json`), raw);
    normalized.push(exchange);
  }

  return collapseExchanges(normalized);
}
