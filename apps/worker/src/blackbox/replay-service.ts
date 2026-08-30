// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { createHash } from 'node:crypto';
import path from 'node:path';
import type {
  DeterministicProofObservation,
  EvidenceProvenance,
  NormalizedExchange,
  ProofCondition,
  ReplaySequence,
  ReplayStep,
  RequestMutation,
} from '../types/blackbox.js';
import type { Rules } from '../types/config.js';
import { atomicWrite, ensureDirectory, fileExists, readJson } from '../utils/file-io.js';
import type { BurpToolClient, RawHistoryRecord } from './burp-client.js';
import { BURP_NO_REQUEST, BURP_NO_RESPONSE, BURP_TRUNCATION_MARKER, extractMcpText } from './burp-client.js';
import type { ParsedHttpResponse } from './http-message.js';
import { getHeaderValues, parseHttpRequest, parseHttpResponse } from './http-message.js';
import type { IdentityStateResolver } from './identity-state.js';
import { assertRequestInScope, normalizeTargetOrigin } from './scope-guard.js';
import { normalizeRawExchange, sha256 } from './traffic-normalizer.js';

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const FORBIDDEN_MODEL_HEADERS = new Set(['cookie', 'authorization', 'proxy-authorization', 'host', 'origin']);
const JSON_POINTER_DANGEROUS_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

export type ReplayCommand = ReplaySequence;

export interface ResponseComparison {
  readonly baselineExchangeId: string;
  readonly observedExchangeId: string;
  readonly baselineStatus: number;
  readonly observedStatus: number;
  readonly statusChanged: boolean;
  readonly baselineFingerprint: string;
  readonly observedFingerprint: string;
  readonly fingerprintChanged: boolean;
}

export type ReplayOutcome =
  | {
      readonly status: 'completed';
      readonly exchanges: readonly NormalizedExchange[];
      readonly comparison: ResponseComparison;
      readonly observation: DeterministicProofObservation;
    }
  | { readonly status: 'needs_fresh_actor_request'; readonly stepId: string; readonly routeSignature: string }
  | { readonly status: 'delivery_unknown'; readonly reason: string };

export interface StoredReplayAction {
  readonly schemaVersion: 1;
  readonly actionId: string;
  readonly commandDigest: string;
  readonly outcome: ReplayOutcome;
}

export interface ReplayRawStore {
  readExchange(exchangeId: string): Promise<RawHistoryRecord | null>;
  writeExchange(exchangeId: string, record: RawHistoryRecord): Promise<void>;
  readAction(actionId: string): Promise<StoredReplayAction | null>;
  writeAction(record: StoredReplayAction): Promise<void>;
}

export interface ReplayServiceOptions {
  readonly targetOrigin: string;
  readonly rules: Rules;
  readonly configuredSecrets: readonly string[];
  readonly exchanges: readonly NormalizedExchange[];
  readonly client: BurpToolClient;
  readonly rawStore: ReplayRawStore;
  readonly identityState: IdentityStateResolver;
  readonly provenance: EvidenceProvenance;
}

export class ReplayValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReplayValidationError';
  }
}

function assertSafeIdentifier(value: string, kind: string): void {
  if (!SAFE_IDENTIFIER.test(value)) throw new ReplayValidationError(`Invalid ${kind} identifier`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, allowed: readonly string[], context: string): void {
  const allowedKeys = new Set(allowed);
  const unexpected = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unexpected) throw new ReplayValidationError(`Unexpected ${context} field ${unexpected}`);
}

function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new ReplayValidationError('Replay values must be finite JSON values');
      return JSON.stringify(value);
    case 'string':
      return JSON.stringify(value);
    case 'object':
      if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
      return `{${Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
        .join(',')}}`;
    default:
      throw new ReplayValidationError('Replay values must be JSON serializable');
  }
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function normalizeProofCondition(value: unknown): ProofCondition {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new ReplayValidationError('Invalid replay proof condition');
  }
  switch (value.type) {
    case 'body_contains':
      if (typeof value.marker !== 'string' || value.marker.length === 0 || value.marker.length > 512) {
        throw new ReplayValidationError('body_contains requires a bounded marker');
      }
      return { type: 'body_contains', marker: value.marker };
    case 'json_pointer_equals':
      if (typeof value.pointer !== 'string') {
        throw new ReplayValidationError('json_pointer_equals requires a JSON pointer');
      }
      parseJsonPointer(value.pointer);
      canonicalJson(value.value);
      return { type: 'json_pointer_equals', pointer: value.pointer, value: structuredClone(value.value) };
    case 'persistent_state':
      if (
        typeof value.verificationSourceExchangeId !== 'string' ||
        typeof value.marker !== 'string' ||
        value.marker.length === 0 ||
        value.marker.length > 512
      ) {
        throw new ReplayValidationError('persistent_state requires a source exchange and bounded marker');
      }
      assertSafeIdentifier(value.verificationSourceExchangeId, 'verification exchange');
      return {
        type: 'persistent_state',
        verificationSourceExchangeId: value.verificationSourceExchangeId,
        marker: value.marker,
      };
    default:
      throw new ReplayValidationError(`Unsupported replay proof condition ${value.type}`);
  }
}

function validateMutation(value: unknown): RequestMutation {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new ReplayValidationError('Invalid replay mutation');
  }
  const textField = (name: string): string => {
    const field = value[name];
    if (typeof field !== 'string') throw new ReplayValidationError(`Mutation ${value.type} requires ${name}`);
    return field;
  };
  switch (value.type) {
    case 'set_path':
      assertExactKeys(value, ['type', 'path'], 'set_path mutation');
      return { type: 'set_path', path: textField('path') };
    case 'set_query':
      assertExactKeys(value, ['type', 'name', 'value'], 'set_query mutation');
      return { type: 'set_query', name: textField('name'), value: textField('value') };
    case 'remove_query':
      assertExactKeys(value, ['type', 'name'], 'remove_query mutation');
      return { type: 'remove_query', name: textField('name') };
    case 'set_header':
      assertExactKeys(value, ['type', 'name', 'value'], 'set_header mutation');
      return { type: 'set_header', name: textField('name'), value: textField('value') };
    case 'remove_header':
      assertExactKeys(value, ['type', 'name'], 'remove_header mutation');
      return { type: 'remove_header', name: textField('name') };
    case 'set_form_field':
      assertExactKeys(value, ['type', 'name', 'value'], 'set_form_field mutation');
      return { type: 'set_form_field', name: textField('name'), value: textField('value') };
    case 'set_json_pointer':
      assertExactKeys(value, ['type', 'pointer', 'value'], 'set_json_pointer mutation');
      canonicalJson(value.value);
      return { type: 'set_json_pointer', pointer: textField('pointer'), value: structuredClone(value.value) };
    default:
      throw new ReplayValidationError(`Unsupported replay mutation ${value.type}`);
  }
}

function normalizeCommand(value: ReplayCommand): ReplayCommand {
  if (!isRecord(value)) throw new ReplayValidationError('Replay command must be an object');
  assertExactKeys(value, ['actionId', 'steps', 'proofCondition'], 'replay command');
  if (typeof value.actionId !== 'string') throw new ReplayValidationError('Replay action ID is required');
  assertSafeIdentifier(value.actionId, 'action');
  if (!Array.isArray(value.steps) || value.steps.length < 1 || value.steps.length > 4) {
    throw new ReplayValidationError('Replay command requires one to four steps');
  }

  const seenStepIds = new Set<string>();
  const steps = value.steps.map((candidate): ReplayStep => {
    if (!isRecord(candidate)) throw new ReplayValidationError('Replay step must be an object');
    assertExactKeys(candidate, ['stepId', 'sourceExchangeId', 'actor', 'mutations'], 'replay step');
    if (
      typeof candidate.stepId !== 'string' ||
      typeof candidate.sourceExchangeId !== 'string' ||
      typeof candidate.actor !== 'string'
    ) {
      throw new ReplayValidationError('Replay step identifiers and actor are required');
    }
    assertSafeIdentifier(candidate.stepId, 'step');
    assertSafeIdentifier(candidate.sourceExchangeId, 'exchange reference');
    if (candidate.actor !== 'anonymous') assertSafeIdentifier(candidate.actor, 'actor');
    if (seenStepIds.has(candidate.stepId)) throw new ReplayValidationError(`Duplicate replay step ${candidate.stepId}`);
    seenStepIds.add(candidate.stepId);
    if (!Array.isArray(candidate.mutations) || candidate.mutations.length > 8) {
      throw new ReplayValidationError(`Replay step ${candidate.stepId} allows zero to eight explicit mutations`);
    }
    return {
      stepId: candidate.stepId,
      sourceExchangeId: candidate.sourceExchangeId,
      actor: candidate.actor,
      mutations: candidate.mutations.map(validateMutation),
    };
  });
  return { actionId: value.actionId, steps, proofCondition: normalizeProofCondition(value.proofCondition) };
}

function containsConfiguredSecret(value: string, configuredSecrets: readonly string[]): boolean {
  return configuredSecrets.some((secret) => secret.length > 0 && value.includes(secret));
}

function normalizedSensitiveName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isIdentityBoundName(name: string): boolean {
  const normalized = normalizedSensitiveName(name);
  if (['pass', 'state', 'nonce', 'key'].includes(normalized)) return true;
  return [
    'authorization',
    'csrf',
    'xsrf',
    'token',
    'password',
    'passwd',
    'secret',
    'session',
    'apikey',
    'privatekey',
    'authenticity',
  ].some((marker) => normalized.includes(marker));
}

function contentType(request: MutableRequest): string {
  return request.headers.find(({ name }) => name.toLowerCase() === 'content-type')?.value.toLowerCase() ?? '';
}

function isJsonRequest(request: MutableRequest): boolean {
  const mediaType = contentType(request).split(';', 1)[0]?.trim() ?? '';
  return mediaType === 'application/json' || mediaType.endsWith('+json') || /^[\t\r\n ]*[[{]/.test(request.body);
}

function isFormRequest(request: MutableRequest): boolean {
  return contentType(request).split(';', 1)[0]?.trim() === 'application/x-www-form-urlencoded';
}

function parseJsonBody(request: MutableRequest): unknown {
  try {
    return JSON.parse(request.body) as unknown;
  } catch {
    throw new ReplayValidationError('Replay request has a malformed JSON body');
  }
}

function parseFormBody(request: MutableRequest): URLSearchParams {
  if (/%(?![0-9A-Fa-f]{2})/.test(request.body)) {
    throw new ReplayValidationError('Replay request has a malformed form body');
  }
  return new URLSearchParams(request.body);
}

interface MutableHeader {
  name: string;
  value: string;
}

interface MutableRequest {
  method: string;
  version: string;
  target: URL;
  headers: MutableHeader[];
  body: string;
}

interface PreparedRequest {
  readonly stepId: string;
  readonly actor: string | 'anonymous';
  readonly source: NormalizedExchange;
  readonly request: MutableRequest;
}

interface TerminalAttempt {
  readonly exchangeId: string;
  readonly record: RawHistoryRecord;
}

type PrepareResult =
  | { readonly status: 'ready'; readonly request: PreparedRequest }
  | { readonly status: 'needs_fresh_actor_request'; readonly stepId: string; readonly routeSignature: string };

function mutableRequest(rawRequest: string, targetOrigin: string, rules: Rules): MutableRequest {
  if (rawRequest === BURP_NO_REQUEST || rawRequest.endsWith(BURP_TRUNCATION_MARKER) || rawRequest.length === 0) {
    throw new ReplayValidationError('Replay source request is unavailable or truncated');
  }
  const parsed = parseHttpRequest(rawRequest);
  const normalized = assertRequestInScope(parsed, targetOrigin, rules);
  const target = new URL(
    `${normalized.path}${normalized.query.size > 0 ? `?${normalized.query}` : ''}`,
    normalized.origin,
  );
  return {
    method: parsed.method,
    version: parsed.version,
    target,
    headers: parsed.headers.map(({ name, value }) => ({ name, value })),
    body: parsed.body,
  };
}

function cloneRequest(request: MutableRequest): MutableRequest {
  return {
    method: request.method,
    version: request.version,
    target: new URL(request.target.href),
    headers: request.headers.map(({ name, value }) => ({ name, value })),
    body: request.body,
  };
}

function removeHeaders(request: MutableRequest, predicate: (name: string) => boolean): void {
  request.headers = request.headers.filter(({ name }) => !predicate(name.toLowerCase()));
}

function setHeader(request: MutableRequest, name: string, values: readonly string[]): void {
  const normalized = name.toLowerCase();
  const firstIndex = request.headers.findIndex((header) => header.name.toLowerCase() === normalized);
  request.headers = request.headers.filter((header) => header.name.toLowerCase() !== normalized);
  const replacements = values.map((value) => ({ name, value }));
  request.headers.splice(firstIndex >= 0 ? firstIndex : request.headers.length, 0, ...replacements);
}

function headerEntries(request: MutableRequest, name: string): readonly MutableHeader[] {
  const normalized = name.toLowerCase();
  return request.headers.filter((header) => header.name.toLowerCase() === normalized);
}

function boundHeaderNames(request: MutableRequest): readonly string[] {
  return [
    ...new Set(
      request.headers
        .map(({ name }) => name)
        .filter((name) => {
          const normalized = name.toLowerCase();
          return !['cookie', 'proxy-authorization', 'host', 'origin'].includes(normalized) && isIdentityBoundName(name);
        })
        .map((name) => name.toLowerCase()),
    ),
  ];
}

function boundParameterNames(values: URLSearchParams): readonly string[] {
  return [...new Set([...values.keys()].filter(isIdentityBoundName))];
}

function replaceBoundParameters(source: URLSearchParams, actor: URLSearchParams | null, anonymous: boolean): boolean {
  for (const name of boundParameterNames(source)) {
    source.delete(name);
    if (anonymous) continue;
    const replacements = actor?.getAll(name) ?? [];
    if (replacements.length === 0) return false;
    for (const value of replacements) source.append(name, value);
  }
  return true;
}

type JsonPath = readonly (string | number)[];

function collectBoundJsonPaths(value: unknown, path_: JsonPath = [], result: JsonPath[] = [], depth = 0): JsonPath[] {
  if (depth > 12 || value === null || typeof value !== 'object') return result;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectBoundJsonPaths(entry, [...path_, index], result, depth + 1);
    });
    return result;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const next = [...path_, key];
    if (isIdentityBoundName(key)) result.push(next);
    else collectBoundJsonPaths(entry, next, result, depth + 1);
  }
  return result;
}

function jsonPathValue(value: unknown, path_: JsonPath): { readonly found: boolean; readonly value: unknown } {
  let current = value;
  for (const segment of path_) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current) || segment >= current.length) return { found: false, value: undefined };
      current = current[segment];
    } else {
      if (!isRecord(current) || !Object.hasOwn(current, segment)) return { found: false, value: undefined };
      current = current[segment];
    }
  }
  return { found: true, value: current };
}

function jsonPathParent(value: unknown, path_: JsonPath): { parent: unknown; key: string | number } | null {
  if (path_.length === 0) return null;
  const parentPath = path_.slice(0, -1);
  const parent = jsonPathValue(value, parentPath);
  const key = path_.at(-1);
  return parent.found && key !== undefined ? { parent: parent.value, key } : null;
}

function setJsonPath(value: unknown, path_: JsonPath, replacement: unknown): boolean {
  const resolved = jsonPathParent(value, path_);
  if (!resolved) return false;
  if (typeof resolved.key === 'number') {
    if (!Array.isArray(resolved.parent) || resolved.key >= resolved.parent.length) return false;
    resolved.parent[resolved.key] = structuredClone(replacement);
    return true;
  }
  if (!isRecord(resolved.parent)) return false;
  resolved.parent[resolved.key] = structuredClone(replacement);
  return true;
}

function deleteJsonPath(value: unknown, path_: JsonPath): boolean {
  const resolved = jsonPathParent(value, path_);
  if (!resolved) return false;
  if (typeof resolved.key === 'number') {
    if (!Array.isArray(resolved.parent) || resolved.key >= resolved.parent.length) return false;
    resolved.parent.splice(resolved.key, 1);
    return true;
  }
  if (!isRecord(resolved.parent)) return false;
  return delete resolved.parent[resolved.key];
}

function replaceBoundJson(source: unknown, actor: unknown | null, anonymous: boolean): boolean {
  const paths = collectBoundJsonPaths(source);
  for (const path_ of paths) {
    if (anonymous) {
      if (!deleteJsonPath(source, path_)) return false;
      continue;
    }
    const replacement = actor === null ? { found: false, value: undefined } : jsonPathValue(actor, path_);
    if (!replacement.found || !setJsonPath(source, path_, replacement.value)) return false;
  }
  return true;
}

function parseJsonPointer(pointer: string): readonly string[] {
  if (pointer.length === 0 || !pointer.startsWith('/')) {
    throw new ReplayValidationError('JSON pointer must be non-empty and start with /');
  }
  return pointer
    .slice(1)
    .split('/')
    .map((encoded) => {
      if (/~(?:[^01]|$)/.test(encoded)) throw new ReplayValidationError('JSON pointer contains an invalid escape');
      const segment = encoded.replace(/~1/g, '/').replace(/~0/g, '~');
      if (JSON_POINTER_DANGEROUS_SEGMENTS.has(segment)) {
        throw new ReplayValidationError('JSON pointer contains a forbidden segment');
      }
      return segment;
    });
}

function setJsonPointer(value: unknown, pointer: string, replacement: unknown): void {
  const segments = parseJsonPointer(pointer);
  let current = value;
  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9]\d*)$/.test(segment) || Number(segment) >= current.length) {
        throw new ReplayValidationError('JSON pointer array index is outside the body');
      }
      current = current[Number(segment)];
    } else if (isRecord(current) && Object.hasOwn(current, segment)) {
      current = current[segment];
    } else {
      throw new ReplayValidationError('JSON pointer parent does not exist');
    }
  }
  const final = segments.at(-1);
  if (final === undefined) throw new ReplayValidationError('JSON pointer is empty');
  if (Array.isArray(current)) {
    if (!/^(?:0|[1-9]\d*)$/.test(final) || Number(final) >= current.length) {
      throw new ReplayValidationError('JSON pointer array index is outside the body');
    }
    current[Number(final)] = structuredClone(replacement);
  } else if (isRecord(current)) {
    current[final] = structuredClone(replacement);
  } else {
    throw new ReplayValidationError('JSON pointer target parent is not a container');
  }
}

function validateModelFieldName(name: string, kind: string): void {
  if (name.length === 0 || /[\r\n\0]/.test(name)) throw new ReplayValidationError(`Invalid ${kind} name`);
  if (isIdentityBoundName(name)) throw new ReplayValidationError(`Replay ${kind} cannot mutate identity-bound state`);
}

function updateContentLength(request: MutableRequest): void {
  const values = headerEntries(request, 'content-length');
  if (values.length > 0)
    setHeader(request, values[0]?.name ?? 'Content-Length', [String(Buffer.byteLength(request.body))]);
}

function applyMutations(request: MutableRequest, mutations: readonly RequestMutation[]): void {
  let bodyChanged = false;
  for (const mutation of mutations) {
    switch (mutation.type) {
      case 'set_path':
        if (
          !mutation.path.startsWith('/') ||
          mutation.path.startsWith('//') ||
          /[?#\r\n\0]/.test(mutation.path) ||
          /^https?:/i.test(mutation.path)
        ) {
          throw new ReplayValidationError('Replay path must be a same-origin absolute path without query or fragment');
        }
        request.target.pathname = mutation.path;
        break;
      case 'set_query':
        validateModelFieldName(mutation.name, 'query');
        request.target.searchParams.set(mutation.name, mutation.value);
        break;
      case 'remove_query':
        validateModelFieldName(mutation.name, 'query');
        request.target.searchParams.delete(mutation.name);
        break;
      case 'set_header': {
        if (!HEADER_NAME.test(mutation.name) || /[\r\n]/.test(mutation.value)) {
          throw new ReplayValidationError('Invalid replay header mutation');
        }
        const normalized = mutation.name.toLowerCase();
        if (FORBIDDEN_MODEL_HEADERS.has(normalized) || isIdentityBoundName(mutation.name)) {
          throw new ReplayValidationError(`Replay cannot mutate protected header ${mutation.name}`);
        }
        setHeader(request, mutation.name, [mutation.value]);
        break;
      }
      case 'remove_header': {
        if (!HEADER_NAME.test(mutation.name)) throw new ReplayValidationError('Invalid replay header mutation');
        const normalized = mutation.name.toLowerCase();
        if (FORBIDDEN_MODEL_HEADERS.has(normalized) || isIdentityBoundName(mutation.name)) {
          throw new ReplayValidationError(`Replay cannot mutate protected header ${mutation.name}`);
        }
        removeHeaders(request, (name) => name === normalized);
        break;
      }
      case 'set_form_field': {
        validateModelFieldName(mutation.name, 'form field');
        if (!isFormRequest(request)) throw new ReplayValidationError('set_form_field requires a form request body');
        const body = parseFormBody(request);
        body.set(mutation.name, mutation.value);
        request.body = body.toString();
        bodyChanged = true;
        break;
      }
      case 'set_json_pointer': {
        const finalSegment = parseJsonPointer(mutation.pointer).at(-1) ?? '';
        validateModelFieldName(finalSegment, 'JSON field');
        if (!isJsonRequest(request)) throw new ReplayValidationError('set_json_pointer requires a JSON request body');
        const body = parseJsonBody(request);
        setJsonPointer(body, mutation.pointer, mutation.value);
        request.body = JSON.stringify(body);
        bodyChanged = true;
        break;
      }
      default: {
        const exhaustive: never = mutation;
        throw new ReplayValidationError(`Unsupported mutation ${(exhaustive as RequestMutation).type}`);
      }
    }
  }
  if (bodyChanged) updateContentLength(request);
}

function serializeHttp1(request: MutableRequest): string {
  const target = `${request.target.pathname}${request.target.search}`;
  return [
    `${request.method} ${target} HTTP/${request.version}`,
    ...request.headers.map(({ name, value }) => `${name}: ${value}`),
    '',
    request.body,
  ].join('\r\n');
}

function http2Headers(request: MutableRequest): Record<string, string> {
  const result: Record<string, string> = {};
  for (const { name, value } of request.headers) {
    const normalized = name.toLowerCase();
    if (normalized === 'host') continue;
    if (Object.hasOwn(result, normalized)) {
      throw new ReplayValidationError(`HTTP/2 replay cannot preserve duplicate header ${name}`);
    }
    result[normalized] = value;
  }
  return result;
}

function sendArguments(request: MutableRequest): {
  readonly name: 'send_http1_request' | 'send_http2_request';
  readonly arguments_: Record<string, unknown>;
  readonly rawRequest: string;
} {
  const targetHostname = request.target.hostname.replace(/^\[|\]$/g, '');
  const targetPort = Number(request.target.port || (request.target.protocol === 'https:' ? '443' : '80'));
  const usesHttps = request.target.protocol === 'https:';
  const rawRequest = serializeHttp1(request);
  if (request.version === '2') {
    return {
      name: 'send_http2_request',
      arguments_: {
        pseudoHeaders: {
          ':method': request.method,
          ':path': `${request.target.pathname}${request.target.search}`,
          ':scheme': request.target.protocol.slice(0, -1),
          ':authority': request.target.host,
        },
        headers: http2Headers(request),
        requestBody: request.body,
        targetHostname,
        targetPort,
        usesHttps,
      },
      rawRequest,
    };
  }
  if (!/^1\.[01]$/.test(request.version))
    throw new ReplayValidationError(`Unsupported HTTP version ${request.version}`);
  return {
    name: 'send_http1_request',
    arguments_: { content: rawRequest, targetHostname, targetPort, usesHttps },
    rawRequest,
  };
}

function redirectedOutsideTarget(response: ParsedHttpResponse, target: URL, targetOrigin: string): boolean {
  if (response.status < 300 || response.status >= 400) return false;
  const locations = getHeaderValues(response.headers, 'location');
  if (locations.length === 0) return false;
  try {
    return locations.some((location) => new URL(location, target).origin !== targetOrigin);
  } catch {
    return true;
  }
}

function pointerValue(value: unknown, pointer: string): { readonly found: boolean; readonly value: unknown } {
  const segments = parseJsonPointer(pointer);
  let current = value;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9]\d*)$/.test(segment) || Number(segment) >= current.length) {
        return { found: false, value: undefined };
      }
      current = current[Number(segment)];
    } else if (isRecord(current) && Object.hasOwn(current, segment)) {
      current = current[segment];
    } else {
      return { found: false, value: undefined };
    }
  }
  return { found: true, value: current };
}

function evaluateProof(
  condition: ProofCondition,
  response: ParsedHttpResponse,
  exchangeId: string,
): DeterministicProofObservation {
  let passed = false;
  let observedMarkerDigest: string | null = null;
  switch (condition.type) {
    case 'body_contains':
      passed = response.body.includes(condition.marker);
      if (passed) observedMarkerDigest = sha256(condition.marker);
      break;
    case 'persistent_state':
      passed = response.body.includes(condition.marker);
      if (passed) observedMarkerDigest = sha256(condition.marker);
      break;
    case 'json_pointer_equals':
      try {
        const observed = pointerValue(JSON.parse(response.body) as unknown, condition.pointer);
        passed = observed.found && canonicalJson(observed.value) === canonicalJson(condition.value);
        if (observed.found) observedMarkerDigest = sha256(canonicalJson(observed.value));
      } catch {
        passed = false;
      }
      break;
    default: {
      const exhaustive: never = condition;
      throw new ReplayValidationError(`Unsupported proof condition ${(exhaustive as ProofCondition).type}`);
    }
  }
  return {
    condition: structuredClone(condition),
    passed,
    observedMarkerDigest,
    observedTransitionId: null,
    verificationExchangeId: exchangeId,
  };
}

function comparison(baseline: NormalizedExchange, observed: NormalizedExchange): ResponseComparison {
  return {
    baselineExchangeId: baseline.exchangeId,
    observedExchangeId: observed.exchangeId,
    baselineStatus: baseline.responseStatus,
    observedStatus: observed.responseStatus,
    statusChanged: baseline.responseStatus !== observed.responseStatus,
    baselineFingerprint: baseline.responseFingerprint,
    observedFingerprint: observed.responseFingerprint,
    fingerprintChanged: baseline.responseFingerprint !== observed.responseFingerprint,
  };
}

function validateRawRecord(value: unknown): RawHistoryRecord {
  if (
    !isRecord(value) ||
    typeof value.request !== 'string' ||
    typeof value.response !== 'string' ||
    typeof value.notes !== 'string' ||
    typeof value.occurrence !== 'number' ||
    !Number.isInteger(value.occurrence) ||
    value.occurrence < 1
  ) {
    throw new ReplayValidationError('Raw exchange record is malformed');
  }
  return {
    request: value.request,
    response: value.response,
    notes: value.notes,
    occurrence: value.occurrence,
  };
}

function validateStoredAction(value: unknown, actionId: string): StoredReplayAction {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.actionId !== actionId ||
    typeof value.commandDigest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.commandDigest) ||
    !isRecord(value.outcome) ||
    !['completed', 'delivery_unknown'].includes(String(value.outcome.status))
  ) {
    throw new ReplayValidationError(`Stored replay action ${actionId} is malformed`);
  }
  return structuredClone(value) as unknown as StoredReplayAction;
}

export class FileReplayRawStore implements ReplayRawStore {
  private readonly rawDirectory: string;

  constructor(rawDirectory: string) {
    this.rawDirectory = path.resolve(rawDirectory);
  }

  private exchangePath(exchangeId: string): string {
    assertSafeIdentifier(exchangeId, 'exchange reference');
    return path.join(this.rawDirectory, `${exchangeId}.json`);
  }

  private actionPath(actionId: string): string {
    assertSafeIdentifier(actionId, 'action');
    return path.join(this.rawDirectory, 'actions', `${actionId}.json`);
  }

  async readExchange(exchangeId: string): Promise<RawHistoryRecord | null> {
    const filePath = this.exchangePath(exchangeId);
    if (!(await fileExists(filePath))) return null;
    return validateRawRecord(await readJson(filePath));
  }

  async writeExchange(exchangeId: string, record: RawHistoryRecord): Promise<void> {
    const validated = validateRawRecord(record);
    await ensureDirectory(this.rawDirectory);
    await atomicWrite(this.exchangePath(exchangeId), validated);
  }

  async readAction(actionId: string): Promise<StoredReplayAction | null> {
    const filePath = this.actionPath(actionId);
    if (!(await fileExists(filePath))) return null;
    return validateStoredAction(await readJson(filePath), actionId);
  }

  async writeAction(record: StoredReplayAction): Promise<void> {
    const validated = validateStoredAction(record, record.actionId);
    await ensureDirectory(path.join(this.rawDirectory, 'actions'));
    await atomicWrite(this.actionPath(record.actionId), validated);
  }
}

export class ReplayService {
  private readonly targetOrigin: string;
  private readonly rules: Rules;
  private readonly configuredSecrets: readonly string[];
  private readonly exchanges: ReadonlyMap<string, NormalizedExchange>;
  private readonly client: BurpToolClient;
  private readonly rawStore: ReplayRawStore;
  private readonly identityState: IdentityStateResolver;
  private readonly provenance: EvidenceProvenance;
  private readonly captureSequences = new Map<string, number>();

  constructor(options: ReplayServiceOptions) {
    this.targetOrigin = normalizeTargetOrigin(options.targetOrigin);
    this.rules = structuredClone(options.rules);
    this.configuredSecrets = [...options.configuredSecrets];
    const exchanges = new Map<string, NormalizedExchange>();
    for (const exchange of options.exchanges) {
      if (exchanges.has(exchange.exchangeId))
        throw new ReplayValidationError(`Duplicate exchange ${exchange.exchangeId}`);
      exchanges.set(exchange.exchangeId, structuredClone(exchange));
      this.captureSequences.set(
        exchange.identity,
        Math.max(this.captureSequences.get(exchange.identity) ?? 0, exchange.captureSequence),
      );
    }
    this.exchanges = exchanges;
    this.client = options.client;
    this.rawStore = options.rawStore;
    this.identityState = options.identityState;
    this.provenance = structuredClone(options.provenance);
  }

  private exchange(exchangeId: string): NormalizedExchange {
    const exchange = this.exchanges.get(exchangeId);
    if (!exchange) throw new ReplayValidationError(`Unknown replay exchange reference ${exchangeId}`);
    if (exchange.origin !== this.targetOrigin) {
      throw new ReplayValidationError(`Replay exchange ${exchangeId} is outside the target origin`);
    }
    return exchange;
  }

  private nextCaptureSequence(identity: string): number {
    const sequence = (this.captureSequences.get(identity) ?? 0) + 1;
    if (!Number.isSafeInteger(sequence)) throw new ReplayValidationError('Replay capture sequence exhausted');
    this.captureSequences.set(identity, sequence);
    return sequence;
  }

  private async actorEquivalent(
    actor: string,
    source: NormalizedExchange,
  ): Promise<{ readonly normalized: NormalizedExchange; readonly request: MutableRequest } | null> {
    const exchangeId = await this.identityState.getLatestExchangeId(actor, source.routeSignature);
    if (!exchangeId) return null;
    const normalized = this.exchanges.get(exchangeId);
    if (!normalized || normalized.identity !== actor || normalized.routeSignature !== source.routeSignature)
      return null;
    const record = await this.rawStore.readExchange(exchangeId);
    if (!record) return null;
    try {
      return { normalized, request: mutableRequest(record.request, this.targetOrigin, this.rules) };
    } catch {
      return null;
    }
  }

  private sourceNeedsEquivalent(request: MutableRequest): boolean {
    if (boundHeaderNames(request).length > 0) return true;
    if (boundParameterNames(request.target.searchParams).length > 0) return true;
    if (isFormRequest(request) && boundParameterNames(parseFormBody(request)).length > 0) return true;
    if (isJsonRequest(request)) return collectBoundJsonPaths(parseJsonBody(request)).length > 0;
    return false;
  }

  private async prepare(step: ReplayStep, allowNoMutations = false): Promise<PrepareResult> {
    const source = this.exchange(step.sourceExchangeId);
    const record = await this.rawStore.readExchange(step.sourceExchangeId);
    if (!record) throw new ReplayValidationError(`Raw replay exchange ${step.sourceExchangeId} does not exist`);
    const request = mutableRequest(record.request, this.targetOrigin, this.rules);
    if (request.method !== source.method) {
      throw new ReplayValidationError(`Raw replay exchange ${step.sourceExchangeId} does not match its metadata`);
    }
    const originalHadCookie = headerEntries(request, 'cookie').length > 0;
    const needsEquivalent = this.sourceNeedsEquivalent(request);
    const anonymous = step.actor === 'anonymous';

    let cookieHeader: string | null = null;
    let equivalent: MutableRequest | null = null;
    if (!anonymous) {
      if (!this.identityState.isKnownIdentity(step.actor)) {
        throw new ReplayValidationError(`Unknown replay actor ${step.actor}`);
      }
      try {
        cookieHeader = await this.identityState.getCookieHeader(step.actor, request.target);
        if (needsEquivalent) equivalent = (await this.actorEquivalent(step.actor, source))?.request ?? null;
      } catch {
        return { status: 'needs_fresh_actor_request', stepId: step.stepId, routeSignature: source.routeSignature };
      }
      if ((originalHadCookie && !cookieHeader) || (needsEquivalent && !equivalent)) {
        return { status: 'needs_fresh_actor_request', stepId: step.stepId, routeSignature: source.routeSignature };
      }
    }

    const prepared = cloneRequest(request);
    const protectedHeaders = new Set(['cookie', 'authorization', 'proxy-authorization', ...boundHeaderNames(request)]);
    removeHeaders(prepared, (name) => protectedHeaders.has(name));
    if (!anonymous && cookieHeader) setHeader(prepared, 'Cookie', [cookieHeader]);

    if (!anonymous && equivalent) {
      for (const name of boundHeaderNames(request)) {
        const values = headerEntries(equivalent, name);
        if (values.length === 0) {
          return { status: 'needs_fresh_actor_request', stepId: step.stepId, routeSignature: source.routeSignature };
        }
        setHeader(
          prepared,
          values[0]?.name ?? name,
          values.map(({ value }) => value),
        );
      }
    }

    if (!replaceBoundParameters(prepared.target.searchParams, equivalent?.target.searchParams ?? null, anonymous)) {
      return { status: 'needs_fresh_actor_request', stepId: step.stepId, routeSignature: source.routeSignature };
    }
    if (isFormRequest(prepared)) {
      const sourceForm = parseFormBody(prepared);
      const actorForm = equivalent && isFormRequest(equivalent) ? parseFormBody(equivalent) : null;
      if (!replaceBoundParameters(sourceForm, actorForm, anonymous)) {
        return { status: 'needs_fresh_actor_request', stepId: step.stepId, routeSignature: source.routeSignature };
      }
      prepared.body = sourceForm.toString();
      updateContentLength(prepared);
    } else if (isJsonRequest(prepared)) {
      const sourceJson = parseJsonBody(prepared);
      const actorJson = equivalent && isJsonRequest(equivalent) ? parseJsonBody(equivalent) : null;
      if (!replaceBoundJson(sourceJson, actorJson, anonymous)) {
        return { status: 'needs_fresh_actor_request', stepId: step.stepId, routeSignature: source.routeSignature };
      }
      prepared.body = JSON.stringify(sourceJson);
      updateContentLength(prepared);
    }

    if (!allowNoMutations && step.mutations.length === 0 && step.actor === source.identity) {
      throw new ReplayValidationError(`Replay step ${step.stepId} requires an identity change or a mutation`);
    }
    applyMutations(prepared, step.mutations);
    assertRequestInScope(parseHttpRequest(serializeHttp1(prepared)), this.targetOrigin, this.rules);
    return { status: 'ready', request: { stepId: step.stepId, actor: step.actor, source, request: prepared } };
  }

  private async persistTerminal(
    actionId: string,
    commandDigest: string,
    reason: string,
    attempt?: TerminalAttempt,
  ): Promise<ReplayOutcome> {
    let terminalReason = reason;
    if (attempt) {
      try {
        await this.rawStore.writeExchange(attempt.exchangeId, attempt.record);
      } catch {
        terminalReason = `${reason}; raw attempt persistence failed`;
      }
    }
    const outcome: ReplayOutcome = { status: 'delivery_unknown', reason: terminalReason };
    const stored = { schemaVersion: 1 as const, actionId, commandDigest, outcome };
    try {
      await this.rawStore.writeAction(stored);
    } catch {
      await this.rawStore.writeAction(stored);
    }
    return outcome;
  }

  async replay(commandInput: ReplayCommand): Promise<ReplayOutcome> {
    const command = normalizeCommand(commandInput);
    const serializedCommand = canonicalJson(command);
    if (containsConfiguredSecret(serializedCommand, this.configuredSecrets)) {
      throw new ReplayValidationError('Replay command contains configured secret material');
    }
    const commandDigest = digest(command);
    const existing = await this.rawStore.readAction(command.actionId);
    if (existing) {
      if (existing.commandDigest !== commandDigest) {
        throw new ReplayValidationError(`Replay action ${command.actionId} was already used for another command`);
      }
      return structuredClone(existing.outcome);
    }

    const prepared: PreparedRequest[] = [];
    for (const step of command.steps) {
      const result = await this.prepare(step);
      if (result.status !== 'ready') return result;
      prepared.push(result.request);
    }

    let verificationBaseline: NormalizedExchange | null = null;
    if (command.proofCondition.type === 'persistent_state') {
      verificationBaseline = this.exchange(command.proofCondition.verificationSourceExchangeId);
      const verificationStep: ReplayStep = {
        stepId: `verify_${command.actionId}`,
        sourceExchangeId: command.proofCondition.verificationSourceExchangeId,
        actor: verificationBaseline.identity,
        mutations: [],
      };
      const result = await this.prepare(verificationStep, true);
      if (result.status !== 'ready') return result;
      prepared.push(result.request);
    }

    const exchanges: NormalizedExchange[] = [];
    const responses: ParsedHttpResponse[] = [];
    for (const [index, preparedRequest] of prepared.entries()) {
      const outbound = sendArguments(preparedRequest.request);
      const terminalAttempt = (rawResponse: string): TerminalAttempt => ({
        exchangeId: `attempt_${sha256(`${command.actionId}\0${preparedRequest.stepId}\0${index + 1}`).slice(0, 24)}`,
        record: {
          request: outbound.rawRequest,
          response: rawResponse,
          notes: `${command.actionId}:${preparedRequest.stepId}:terminal`,
          occurrence: 1,
        },
      });
      let result: unknown;
      try {
        result = await this.client.call(outbound.name, outbound.arguments_);
      } catch {
        return this.persistTerminal(
          command.actionId,
          commandDigest,
          'Burp transport failed after dispatch',
          terminalAttempt(BURP_NO_RESPONSE),
        );
      }

      let rawResponse: string;
      try {
        rawResponse = extractMcpText(result);
      } catch {
        return this.persistTerminal(
          command.actionId,
          commandDigest,
          'Burp returned an invalid tool result after dispatch',
          terminalAttempt(BURP_NO_RESPONSE),
        );
      }
      if (rawResponse === BURP_NO_RESPONSE || rawResponse.trim().length === 0) {
        return this.persistTerminal(
          command.actionId,
          commandDigest,
          'Burp returned no HTTP response after dispatch',
          terminalAttempt(rawResponse),
        );
      }
      if (rawResponse.endsWith(BURP_TRUNCATION_MARKER)) {
        return this.persistTerminal(
          command.actionId,
          commandDigest,
          'Burp returned a truncated HTTP response after dispatch',
          terminalAttempt(rawResponse),
        );
      }
      if (/^Send HTTP request denied by Burp Suite\s*$/.test(rawResponse)) {
        return this.persistTerminal(
          command.actionId,
          commandDigest,
          'Burp denied request dispatch',
          terminalAttempt(rawResponse),
        );
      }

      let parsedResponse: ParsedHttpResponse;
      try {
        parsedResponse = parseHttpResponse(rawResponse);
      } catch {
        return this.persistTerminal(
          command.actionId,
          commandDigest,
          'Burp returned a malformed HTTP response after dispatch',
          terminalAttempt(rawResponse),
        );
      }
      if (redirectedOutsideTarget(parsedResponse, preparedRequest.request.target, this.targetOrigin)) {
        return this.persistTerminal(
          command.actionId,
          commandDigest,
          'Cross-origin redirect rejected',
          terminalAttempt(rawResponse),
        );
      }

      const record: RawHistoryRecord = {
        request: outbound.rawRequest,
        response: rawResponse,
        notes: `${command.actionId}:${preparedRequest.stepId}`,
        occurrence: 1,
      };
      const normalized = normalizeRawExchange({
        targetOrigin: this.targetOrigin,
        rules: this.rules,
        identity: preparedRequest.actor,
        raw: record,
        captureSequence: this.nextCaptureSequence(preparedRequest.actor),
        configuredSecrets: this.configuredSecrets,
        provenance: this.provenance,
      });
      if (!normalized) {
        return this.persistTerminal(
          command.actionId,
          commandDigest,
          'Dispatched request could not be normalized safely',
          terminalAttempt(rawResponse),
        );
      }
      try {
        await this.rawStore.writeExchange(normalized.exchangeId, record);
      } catch {
        return this.persistTerminal(
          command.actionId,
          commandDigest,
          'Replay evidence persistence failed after dispatch',
          terminalAttempt(rawResponse),
        );
      }
      exchanges.push(normalized);
      responses.push(parsedResponse);
    }

    const observed = exchanges.at(-1);
    const observedResponse = responses.at(-1);
    const baseline = verificationBaseline ?? prepared.at(-1)?.source;
    if (!observed || !observedResponse || !baseline) {
      throw new ReplayValidationError('Replay produced no observable response');
    }
    const outcome: ReplayOutcome = {
      status: 'completed',
      exchanges,
      comparison: comparison(baseline, observed),
      observation: evaluateProof(command.proofCondition, observedResponse, observed.exchangeId),
    };
    try {
      await this.rawStore.writeAction({ schemaVersion: 1, actionId: command.actionId, commandDigest, outcome });
    } catch {
      return this.persistTerminal(
        command.actionId,
        commandDigest,
        'Replay completion persistence failed after dispatch',
      );
    }
    return structuredClone(outcome);
  }
}
