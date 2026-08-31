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
import type { Rules } from '../types/config.js';
import { parseHttpRequest } from './http-message.js';
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
    const nodeRequest = requestFunction(
      url,
      { method, headers: requestHeaders, signal },
      (nodeResponse) => {
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
      },
    );
    nodeRequest.once('error', reject);
    if (body !== undefined) nodeRequest.end(body);
    else nodeRequest.end();
  });
}

async function fetchWithNodeHttp(hostHeader: string, input: string | URL | Request, init?: RequestInit): Promise<Response> {
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

  async connect(cancellationSignal?: AbortSignal): Promise<void> {
    if (this.connected) return;
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
    if (!this.connected || !this.sdkClient) {
      throw new Error('Burp MCP client is not connected');
    }
    cancellationSignal?.throwIfAborted();
    return this.sdkClient.callTool(
      { name, arguments: arguments_ },
      undefined,
      cancellationSignal ? { signal: cancellationSignal } : undefined,
    );
  }

  async close(): Promise<void> {
    const client = this.sdkClient;
    this.sdkClient = undefined;
    this.connected = false;
    if (client) await client.close();
  }
}

export function parseHistoryText(text: string): RawHistoryRecord[] {
  const records: RawHistoryRecord[] = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || line.trim() === '') continue;
    if (line === BURP_END_OF_ITEMS) continue;

    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch {
      throw new Error(`Malformed Burp history line ${index + 1}`);
    }
    if (!isRecord(value) || typeof value.request !== 'string' || value.request.length === 0) {
      throw new Error(`Burp history line ${index + 1} is missing a request`);
    }
    if (value.response !== undefined && value.response !== null && typeof value.response !== 'string') {
      throw new Error(`Malformed Burp history line ${index + 1} response`);
    }
    if (value.notes !== undefined && value.notes !== null && typeof value.notes !== 'string') {
      throw new Error(`Malformed Burp history line ${index + 1} notes`);
    }
    // Burp serializes absent messages as these literal placeholders. Retain
    // them here so pagination still counts every returned history item; the
    // scope boundary discards records that have no request to attribute.
    records.push({
      request: value.request,
      response: value.response ?? BURP_NO_RESPONSE,
      notes: value.notes ?? '',
      occurrence: 1,
    });
  }

  return records;
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

export async function readTargetHistory(
  client: BurpToolClient,
  targetOrigin: string,
  rules: Rules,
  cancellationSignal?: AbortSignal,
): Promise<HistorySnapshot> {
  const records: RawHistoryRecord[] = [];
  const regex = escapedHostRegex(targetOrigin);
  const count = 100;

  for (let offset = 0; ; offset += count) {
    const result = await client.call('get_proxy_http_history_regex', { regex, count, offset }, cancellationSignal);
    const page = parseHistoryText(extractMcpText(result));
    records.push(...page);
    if (page.length < count) break;
  }

  const filtered = records.filter((record) => {
    if (record.request === BURP_NO_REQUEST || record.request.endsWith(BURP_TRUNCATION_MARKER)) return false;
    const request = parseHttpRequest(record.request);
    return requestMatchesScope(request, targetOrigin, rules);
  });
  return snapshotHistory(filtered);
}
