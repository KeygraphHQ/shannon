// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { createHash } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport, type SSEClientTransportOptions } from '@modelcontextprotocol/sdk/client/sse.js';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { Rules } from '../types/config.js';
import { HttpMessageParseError, parseHttpRequest } from './http-message.js';
import { requestMatchesScope } from './scope-guard.js';

export const BURP_END_OF_ITEMS = 'Reached end of items';
export const BURP_NO_REQUEST = '<no request>';
export const BURP_NO_RESPONSE = '<no response>';
export const BURP_TRUNCATION_MARKER = '... (truncated)';

const REQUIRED_BURP_TOOLS = ['get_proxy_http_history_regex', 'send_http1_request', 'send_http2_request'] as const;

const ALLOWED_BURP_TOOLS = new Set<string>(REQUIRED_BURP_TOOLS);

export type AllowedBurpTool = (typeof REQUIRED_BURP_TOOLS)[number];

export interface BurpMcpSettings {
  readonly url: string;
  readonly hostHeader: string;
}

export interface BurpToolClient {
  connect(cancellationSignal?: AbortSignal): Promise<void>;
  call<T extends Record<string, unknown>>(
    name: AllowedBurpTool,
    arguments_: T,
    cancellationSignal?: AbortSignal,
  ): Promise<unknown>;
  close(): Promise<void>;
}

export interface RawHistoryRecord {
  readonly request: string;
  readonly response: string;
  readonly notes: string;
  readonly occurrence: number;
}

export interface HistorySnapshot {
  readonly orderedRecords: readonly RawHistoryRecord[];
  readonly occurrenceCounts: Readonly<Record<string, number>>;
}

export interface TrafficCaptureInput {
  readonly targetOrigin: string;
  readonly rules: Rules;
  readonly identity: string | 'anonymous';
  readonly before: HistorySnapshot;
  readonly after: HistorySnapshot;
  readonly rawDirectory: string;
  readonly configuredSecrets: readonly string[];
}

interface SdkClientLike {
  connect(transport: unknown, options?: { readonly signal?: AbortSignal }): Promise<void>;
  listTools(params?: undefined, options?: { readonly signal?: AbortSignal }): Promise<unknown>;
  callTool(
    input: { readonly name: string; readonly arguments: Record<string, unknown> },
    resultSchema?: unknown,
    options?: { readonly signal?: AbortSignal },
  ): Promise<unknown>;
  close(): Promise<void>;
}

interface BurpClientFactories {
  readonly createClient?: () => SdkClientLike;
  readonly createTransport?: (url: URL, options: SSEClientTransportOptions) => unknown;
  readonly fetch?: typeof fetch;
}

function createProductionClient(): SdkClientLike {
  return new Client({ name: 'shannon-blackbox', version: '1' });
}

function createProductionTransport(url: URL, options: SSEClientTransportOptions): unknown {
  return new SSEClientTransport(url, options);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMcpRequestTimeout(error: unknown): boolean {
  return isRecord(error) && error.code === ErrorCode.RequestTimeout;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 20;

function isHttpUrl(url: URL): boolean {
  return url.protocol === 'http:' || url.protocol === 'https:';
}

function annotateResponse(response: Response, url: URL, redirected: boolean): Response {
  Object.defineProperties(response, {
    url: { configurable: true, enumerable: true, value: url.href },
    redirected: { configurable: true, enumerable: true, value: redirected },
  });
  return response;
}

async function readRequestBody(request: Request): Promise<Buffer | undefined> {
  if (!request.body) return undefined;
  request.signal.throwIfAborted();

  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    let settled = false;
    const abort = (): void => {
      if (settled) return;
      settled = true;
      reject(request.signal.reason);
      void reader.cancel(request.signal.reason).catch(() => undefined);
    };
    const read = async (): Promise<void> => {
      try {
        while (!settled) {
          const { done, value } = await reader.read();
          if (settled) return;
          if (done) {
            settled = true;
            resolve(Buffer.concat(chunks));
            return;
          }
          chunks.push(Buffer.from(value));
          if (request.signal.aborted) abort();
        }
      } catch (error) {
        if (!settled) {
          settled = true;
          reject(error);
        }
      } finally {
        request.signal.removeEventListener('abort', abort);
        reader.releaseLock();
      }
    };
    request.signal.addEventListener('abort', abort, { once: true });
    if (request.signal.aborted) abort();
    else void read();
  });
}

function requestNodeResponse(
  url: URL,
  method: string,
  headers: Headers,
  body: Buffer | undefined,
  signal: AbortSignal,
): Promise<Response> {
  const requestHeaders: Record<string, string> = {};
  for (const [name, value] of headers) requestHeaders[name] = value;
  const requestFunction = url.protocol === 'https:' ? https.request : http.request;
  return new Promise<Response>((resolve, reject) => {
    const nodeRequest = requestFunction(url, { method, headers: requestHeaders, signal }, (nodeResponse) => {
      try {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(nodeResponse.headers)) {
          if (Array.isArray(value)) {
            for (const item of value) responseHeaders.append(name, item);
          } else if (value !== undefined) {
            responseHeaders.set(name, value);
          }
        }
        const status = nodeResponse.statusCode ?? 500;
        const nullBody = method === 'HEAD' || status === 204 || status === 205 || status === 304;
        if (nullBody) {
          nodeResponse.on('error', () => undefined);
          nodeResponse.resume();
          resolve(
            new Response(null, {
              status,
              statusText: nodeResponse.statusMessage ?? '',
              headers: responseHeaders,
            }),
          );
          return;
        }
        resolve(
          new Response(Readable.toWeb(nodeResponse), {
            status,
            statusText: nodeResponse.statusMessage ?? '',
            headers: responseHeaders,
          }),
        );
      } catch (error) {
        nodeResponse.on('error', () => undefined);
        nodeResponse.resume();
        reject(error);
      }
    });
    nodeRequest.once('error', reject);
    if (body !== undefined) nodeRequest.end(body);
    else nodeRequest.end();
  });
}

async function fetchWithNodeHttp(
  hostHeader: string,
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const request = new Request(input, init);
  let url = new URL(request.url);
  if (!isHttpUrl(url)) throw new TypeError(`Unsupported URL protocol for Burp MCP: ${url.protocol}`);

  let method = request.method;
  let body = await readRequestBody(request);
  const headers = new Headers(request.headers);
  headers.set('Host', hostHeader);
  let redirected = false;

  for (let redirectCount = 0; ; redirectCount += 1) {
    request.signal.throwIfAborted();
    const response = await requestNodeResponse(url, method, headers, body, request.signal);
    const location = response.headers.get('location');
    if (!REDIRECT_STATUSES.has(response.status) || !location) return annotateResponse(response, url, redirected);
    if (request.redirect === 'error') {
      if (response.body) await response.body.cancel().catch(() => undefined);
      throw new TypeError('Redirect encountered while redirect mode is error');
    }
    if (request.redirect === 'manual') return annotateResponse(response, url, redirected);
    if (redirectCount >= MAX_REDIRECTS) {
      if (response.body) await response.body.cancel().catch(() => undefined);
      throw new TypeError('Too many redirects');
    }
    if (response.body) await response.body.cancel().catch(() => undefined);

    const nextUrl = new URL(location, url);
    if (!isHttpUrl(nextUrl)) throw new TypeError(`Unsupported redirect URL protocol: ${nextUrl.protocol}`);
    if ((response.status === 301 || response.status === 302) && method === 'POST') {
      method = 'GET';
      body = undefined;
      headers.delete('content-length');
      headers.delete('content-type');
      headers.delete('transfer-encoding');
    } else if (response.status === 303 && method !== 'GET' && method !== 'HEAD') {
      method = 'GET';
      body = undefined;
      headers.delete('content-length');
      headers.delete('content-type');
      headers.delete('transfer-encoding');
    }
    url = nextUrl;
    redirected = true;
  }
}

export function createHostHeaderFetch(hostHeader: string, fetchImpl?: typeof fetch): typeof fetch {
  if (fetchImpl === undefined) {
    return (input, init) => fetchWithNodeHttp(hostHeader, input, init);
  }
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('Host', hostHeader);
    return fetchImpl(input, { ...init, headers });
  };
}

export function extractMcpText(result: unknown): string {
  if (!isRecord(result)) {
    throw new Error('Burp MCP call failed: result is not an object');
  }
  if (result.isError === true) {
    throw new Error('Burp MCP call failed');
  }

  const content = result.content;
  if (!Array.isArray(content) || content.length === 0) {
    throw new Error('Burp MCP result has no text content');
  }

  const textBlocks: string[] = [];
  for (const block of content) {
    if (!isRecord(block) || block.type !== 'text' || typeof block.text !== 'string') {
      throw new Error('Burp MCP result contains non-text content');
    }
    textBlocks.push(block.text);
  }
  if (textBlocks.length === 0) {
    throw new Error('Burp MCP result has no text content');
  }
  return textBlocks.join('\n');
}

const HTTP_REQUEST_RESPONSE_PREFIX = 'HttpRequestResponse{httpRequest=';
const HTTP_RESPONSE_SEPARATOR = ', httpResponse=';
const MESSAGE_ANNOTATIONS_SEPARATOR = ', messageAnnotations=Annotations{';

function equivalentEchoedRequest(expectedRequest: string, echoedRequest: string): boolean {
  if (echoedRequest === expectedRequest) return true;
  try {
    const expected = parseHttpRequest(expectedRequest);
    const echoed = parseHttpRequest(echoedRequest);
    if (
      expected.version !== '2' ||
      echoed.version !== expected.version ||
      echoed.method !== expected.method ||
      echoed.target !== expected.target ||
      echoed.body !== expected.body
    ) {
      return false;
    }
    const canonicalHeaders = (headers: typeof expected.headers): string[] =>
      headers.map(({ name, value }) => `${name.toLowerCase()}\0${value}`).sort();
    return JSON.stringify(canonicalHeaders(echoed.headers)) === JSON.stringify(canonicalHeaders(expected.headers));
  } catch {
    return false;
  }
}

export function extractBurpSendHttpResponse(text: string, expectedRequest: string): string {
  if (!text.startsWith(HTTP_REQUEST_RESPONSE_PREFIX)) return text;

  const annotationsIndex = text.lastIndexOf(MESSAGE_ANNOTATIONS_SEPARATOR);
  if (annotationsIndex < HTTP_REQUEST_RESPONSE_PREFIX.length || !text.endsWith('}}')) {
    throw new Error('Burp MCP send result has a malformed request-response envelope');
  }

  const requestAndResponse = text.slice(HTTP_REQUEST_RESPONSE_PREFIX.length, annotationsIndex);
  const candidates: string[] = [];
  for (let offset = 0; offset < requestAndResponse.length; ) {
    const separatorIndex = requestAndResponse.indexOf(HTTP_RESPONSE_SEPARATOR, offset);
    if (separatorIndex < 0) break;
    const echoedRequest = requestAndResponse.slice(0, separatorIndex);
    const response = requestAndResponse.slice(separatorIndex + HTTP_RESPONSE_SEPARATOR.length);
    if (
      (response === 'null' || response === BURP_NO_RESPONSE || response.startsWith('HTTP/')) &&
      equivalentEchoedRequest(expectedRequest, echoedRequest)
    ) {
      candidates.push(response);
    }
    offset = separatorIndex + 1;
  }
  if (candidates.length !== 1) {
    throw new Error('Burp MCP send result has a malformed request-response envelope');
  }
  const response = candidates[0];
  if (response === undefined) {
    throw new Error('Burp MCP send result has a malformed request-response envelope');
  }
  return response === 'null' ? BURP_NO_RESPONSE : response;
}

export class BurpMcpClient implements BurpToolClient {
  private readonly settings: BurpMcpSettings;
  private readonly createClient: () => SdkClientLike;
  private readonly createTransport: (url: URL, options: SSEClientTransportOptions) => unknown;
  private readonly fetchImpl: typeof fetch | undefined;
  private sdkClient: SdkClientLike | undefined;
  private connected = false;

  constructor(settings: BurpMcpSettings, factories: BurpClientFactories = {}) {
    this.settings = settings;
    this.createClient = factories.createClient ?? createProductionClient;
    this.createTransport = factories.createTransport ?? createProductionTransport;
    this.fetchImpl = factories.fetch;
  }

  private connectedClient(): SdkClientLike {
    if (!this.connected || !this.sdkClient) throw new Error('Burp MCP client is not connected');
    return this.sdkClient;
  }

  async connect(cancellationSignal?: AbortSignal): Promise<void> {
    if (this.connected) return;
    try {
      await this.connectOnce(cancellationSignal);
    } catch (error) {
      cancellationSignal?.throwIfAborted();
      if (!isMcpRequestTimeout(error)) throw error;
      await this.connectOnce(cancellationSignal);
    }
  }

  private async connectOnce(cancellationSignal?: AbortSignal): Promise<void> {
    cancellationSignal?.throwIfAborted();

    const client = this.createClient();
    this.sdkClient = client;
    let closePromise: Promise<void> | undefined;
    const closeClient = (): Promise<void> => {
      closePromise ??= Promise.resolve().then(() => client.close());
      return closePromise;
    };
    try {
      const transport = this.createTransport(new URL(this.settings.url), {
        fetch: createHostHeaderFetch(this.settings.hostHeader, this.fetchImpl),
      });
      const requestOptions = cancellationSignal ? { signal: cancellationSignal } : undefined;
      const connectPromise = client.connect(transport, requestOptions);
      if (cancellationSignal) {
        let abortConnect: (() => void) | undefined;
        const cancellation = new Promise<never>((_resolve, reject) => {
          abortConnect = () => {
            void closeClient().catch(() => undefined);
            try {
              cancellationSignal.throwIfAborted();
            } catch (error) {
              reject(error);
            }
          };
          cancellationSignal.addEventListener('abort', abortConnect, { once: true });
          if (cancellationSignal.aborted) abortConnect();
        });
        try {
          await Promise.race([connectPromise, cancellation]);
        } finally {
          if (abortConnect) cancellationSignal.removeEventListener('abort', abortConnect);
        }
      } else {
        await connectPromise;
      }
      cancellationSignal?.throwIfAborted();

      const tools = await client.listTools(undefined, requestOptions);
      const available = new Set(
        isRecord(tools) && Array.isArray(tools.tools)
          ? tools.tools
              .filter((tool): tool is Record<string, unknown> => isRecord(tool))
              .map((tool) => tool.name)
              .filter((name): name is string => typeof name === 'string')
          : [],
      );
      const missing = REQUIRED_BURP_TOOLS.filter((name) => !available.has(name));
      if (missing.length > 0) {
        throw new Error(`Burp MCP is missing required tools: ${missing.join(', ')}`);
      }
      this.connected = true;
    } catch (error) {
      this.sdkClient = undefined;
      if (cancellationSignal?.aborted) {
        void closeClient().catch(() => undefined);
      } else {
        try {
          await closeClient();
        } catch {
          // Preserve the connection or tool-validation error.
        }
      }
      throw error;
    }
  }

  async call<T extends Record<string, unknown>>(
    name: AllowedBurpTool,
    arguments_: T,
    cancellationSignal?: AbortSignal,
  ): Promise<unknown> {
    if (!ALLOWED_BURP_TOOLS.has(name)) {
      throw new Error(`Burp MCP tool is not allowed: ${name}`);
    }
    cancellationSignal?.throwIfAborted();
    const input = { name, arguments: arguments_ };
    const requestOptions = cancellationSignal ? { signal: cancellationSignal } : undefined;
    try {
      return await this.connectedClient().callTool(input, undefined, requestOptions);
    } catch (error) {
      cancellationSignal?.throwIfAborted();
      if (name !== 'get_proxy_http_history_regex' || !isMcpRequestTimeout(error)) throw error;

      const staleClient = this.connectedClient();
      this.sdkClient = undefined;
      this.connected = false;
      try {
        await staleClient.close();
      } catch {
        // A fresh connection can recover a timed-out read even when the stale transport cannot close cleanly.
      }
      await this.connect(cancellationSignal);
      return this.connectedClient().callTool(input, undefined, requestOptions);
    }
  }

  async close(): Promise<void> {
    const client = this.sdkClient;
    this.sdkClient = undefined;
    this.connected = false;
    if (client) await client.close();
  }
}

const BURP_TRUNCATED_RECORD_LENGTH = 5000 + BURP_TRUNCATION_MARKER.length;

type JsonStringScan =
  | { readonly kind: 'complete'; readonly end: number }
  | { readonly kind: 'incomplete' }
  | { readonly kind: 'invalid' };

function scanJsonString(value: string, start: number): JsonStringScan {
  if (value[start] !== '"') return { kind: 'invalid' };

  for (let index = start + 1; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"') return { kind: 'complete', end: index };
    if (character === '\\') {
      const escapedCharacter = value[index + 1];
      if (escapedCharacter === undefined) return { kind: 'incomplete' };
      if ('"\\/bfnrt'.includes(escapedCharacter)) {
        index += 1;
        continue;
      }
      if (escapedCharacter !== 'u') return { kind: 'invalid' };

      const code = value.slice(index + 2, index + 6);
      if (code.length < 4) return /^[0-9a-fA-F]*$/.test(code) ? { kind: 'incomplete' } : { kind: 'invalid' };
      if (!/^[0-9a-fA-F]{4}$/.test(code)) return { kind: 'invalid' };
      index += 5;
      continue;
    }
    if ((character?.charCodeAt(0) ?? 0) < 0x20) return { kind: 'invalid' };
  }
  return { kind: 'incomplete' };
}

function decodeJsonString(
  value: string,
  scan: Extract<JsonStringScan, { readonly kind: 'complete' }>,
  start: number,
): string | undefined {
  try {
    const decoded = JSON.parse(value.slice(start, scan.end + 1)) as unknown;
    return typeof decoded === 'string' ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function matchDelimiter(value: string, start: number, delimiter: string): 'complete' | 'incomplete' | 'invalid' {
  const suffix = value.slice(start);
  if (suffix.length < delimiter.length) return delimiter.startsWith(suffix) ? 'incomplete' : 'invalid';
  return suffix.startsWith(delimiter) ? 'complete' : 'invalid';
}

function parseTruncatedHistoryRecord(line: string): RawHistoryRecord | undefined {
  if (line.length !== BURP_TRUNCATED_RECORD_LENGTH || !line.endsWith(BURP_TRUNCATION_MARKER)) return undefined;

  const prefix = line.slice(0, 5000);
  const requestField = '{"request":"';
  if (!prefix.startsWith(requestField)) return undefined;

  const requestValueStart = requestField.length - 1;
  const requestScan = scanJsonString(prefix, requestValueStart);
  if (requestScan.kind === 'incomplete') {
    return {
      request: `${BURP_NO_REQUEST}${BURP_TRUNCATION_MARKER}`,
      response: BURP_TRUNCATION_MARKER,
      notes: '',
      occurrence: 1,
    };
  }
  if (requestScan.kind === 'invalid') return undefined;
  const request = decodeJsonString(prefix, requestScan, requestValueStart);
  if (request === undefined || request.length === 0) return undefined;

  const responseField = ',"response":"';
  let cursor = requestScan.end + 1;
  const responseDelimiter = matchDelimiter(prefix, cursor, responseField);
  if (responseDelimiter === 'incomplete') {
    return { request, response: BURP_TRUNCATION_MARKER, notes: '', occurrence: 1 };
  }
  if (responseDelimiter === 'invalid') return undefined;

  cursor += responseField.length - 1;
  const responseScan = scanJsonString(prefix, cursor);
  if (responseScan.kind === 'incomplete')
    return { request, response: BURP_TRUNCATION_MARKER, notes: '', occurrence: 1 };
  if (responseScan.kind === 'invalid') return undefined;
  const response = decodeJsonString(prefix, responseScan, cursor);
  if (response === undefined) return undefined;

  const notesField = ',"notes":"';
  cursor = responseScan.end + 1;
  const notesDelimiter = matchDelimiter(prefix, cursor, notesField);
  if (notesDelimiter === 'incomplete') return { request, response, notes: BURP_TRUNCATION_MARKER, occurrence: 1 };
  if (notesDelimiter === 'invalid') return undefined;

  cursor += notesField.length - 1;
  const notesScan = scanJsonString(prefix, cursor);
  if (notesScan.kind === 'incomplete') return { request, response, notes: BURP_TRUNCATION_MARKER, occurrence: 1 };
  if (notesScan.kind === 'invalid') return undefined;
  const notes = decodeJsonString(prefix, notesScan, cursor);
  if (notes === undefined) return undefined;

  return prefix.slice(notesScan.end + 1) === '}' ? { request, response, notes, occurrence: 1 } : undefined;
}

/**
 * Surface a history record this client could not keep. A skipped record is evidence the
 * corpus will never carry, so the reason has to reach the run log rather than vanish into
 * a silent drop.
 */
function warnHistoryRecordSkipped(reason: unknown): void {
  const detail = reason instanceof Error ? reason.message : String(reason);
  console.warn(`Skipping unreadable Burp history record: ${detail}`);
}

interface HistoryItemLine {
  readonly line: string;
  readonly lineNumber: number;
}

/**
 * Split a history page into the lines that carry records, dropping blank lines and the
 * end-of-items footer. Line numbers stay 1-based against the original page text.
 */
function historyItemLines(text: string): HistoryItemLine[] {
  const items: HistoryItemLine[] = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || line.trim() === '') continue;
    if (line === BURP_END_OF_ITEMS) continue;
    items.push({ line, lineNumber: index + 1 });
  }

  return items;
}

function parseHistoryLine(line: string, lineNumber: number): RawHistoryRecord {
  let value: unknown;
  try {
    value = JSON.parse(line) as unknown;
  } catch {
    const truncated = parseTruncatedHistoryRecord(line);
    if (!truncated) throw new Error(`Malformed Burp history line ${lineNumber}`);
    return truncated;
  }
  if (!isRecord(value) || typeof value.request !== 'string' || value.request.length === 0) {
    throw new Error(`Burp history line ${lineNumber} is missing a request`);
  }
  if (value.response !== undefined && value.response !== null && typeof value.response !== 'string') {
    throw new Error(`Malformed Burp history line ${lineNumber} response`);
  }
  if (value.notes !== undefined && value.notes !== null && typeof value.notes !== 'string') {
    throw new Error(`Malformed Burp history line ${lineNumber} notes`);
  }
  // Burp serializes absent messages as these literal placeholders. Retain
  // them here so pagination still counts every returned history item; the
  // scope boundary discards records that have no request to attribute.
  return {
    request: value.request,
    response: value.response ?? BURP_NO_RESPONSE,
    notes: value.notes ?? '',
    occurrence: 1,
  };
}

/** Parse every record on a history page, rejecting the whole page when any line is unreadable. */
export function parseHistoryText(text: string): RawHistoryRecord[] {
  return historyItemLines(text).map(({ line, lineNumber }) => parseHistoryLine(line, lineNumber));
}

interface HistoryPage {
  /** Records this parser could read, in page order. */
  readonly records: readonly RawHistoryRecord[];
  /** Every history item Burp returned on the page, skipped records included. */
  readonly itemCount: number;
}

/**
 * Parse a history page for the pagination loop, skipping the records this parser cannot read.
 *
 * One unreadable line costs a single record instead of the records already read from the page
 * and every page behind it. A skipped record still counts toward `itemCount` because a short
 * page is what terminates pagination — leaving it out of the count would end the read early
 * and hide the traffic on the pages that follow.
 */
function parseHistoryPage(text: string): HistoryPage {
  const items = historyItemLines(text);
  const records: RawHistoryRecord[] = [];

  for (const { line, lineNumber } of items) {
    try {
      records.push(parseHistoryLine(line, lineNumber));
    } catch (error) {
      warnHistoryRecordSkipped(error);
    }
  }

  return { records, itemCount: items.length };
}

export function historyHash(record: Pick<RawHistoryRecord, 'request' | 'response'>): string {
  return createHash('sha256').update(`${record.request}\0${record.response}`).digest('hex');
}

export function snapshotHistory(records: readonly RawHistoryRecord[]): HistorySnapshot {
  const occurrenceCounts: Record<string, number> = {};
  const orderedRecords = records.map((record) => {
    const hash = historyHash(record);
    const occurrence = (occurrenceCounts[hash] ?? 0) + 1;
    occurrenceCounts[hash] = occurrence;
    return { ...record, occurrence };
  });
  return { orderedRecords, occurrenceCounts };
}

function escapedHostRegex(targetOrigin: string): string {
  const host = new URL(targetOrigin).hostname;
  return host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapedRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function captureTokensRegex(captureTokens: readonly string[]): string {
  const tokens = [...new Set(captureTokens)].sort().map(escapedRegex);
  return `(?m)^(?i:X-Shannon-Capture):[ \\t]*(?:${tokens.join('|')})[ \\t]*\\r?$`;
}

function recordMatchesScope(record: RawHistoryRecord, targetOrigin: string, rules: Rules): boolean {
  if (record.request === BURP_NO_REQUEST || record.request.endsWith(BURP_TRUNCATION_MARKER)) return false;

  try {
    return requestMatchesScope(parseHttpRequest(record.request), targetOrigin, rules);
  } catch (error) {
    // A history entry Burp returned in a shape this parser cannot read carries no
    // attributable request, and the capture-token filter discards it downstream
    // anyway, so dropping it alone keeps the rest of the paged corpus intact.
    // WARNING: only parse failures are absorbed here. An unsupported scope rule
    // must still abort the read rather than silently disable configured rules.
    if (!(error instanceof HttpMessageParseError)) throw error;
    warnHistoryRecordSkipped(error);
    return false;
  }
}

export async function readTargetHistory(
  client: BurpToolClient,
  targetOrigin: string,
  rules: Rules,
  cancellationSignal?: AbortSignal,
  captureTokens?: readonly string[],
): Promise<HistorySnapshot> {
  if (captureTokens?.length === 0) return snapshotHistory([]);

  const records: RawHistoryRecord[] = [];
  const regex = captureTokens === undefined ? escapedHostRegex(targetOrigin) : captureTokensRegex(captureTokens);
  const count = 100;

  for (let offset = 0; ; offset += count) {
    const result = await client.call('get_proxy_http_history_regex', { regex, count, offset }, cancellationSignal);
    const page = parseHistoryPage(extractMcpText(result));
    records.push(...page.records);
    if (page.itemCount < count) break;
  }

  const filtered = records.filter((record) => recordMatchesScope(record, targetOrigin, rules));
  return snapshotHistory(filtered);
}
