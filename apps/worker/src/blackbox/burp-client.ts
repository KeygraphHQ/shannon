// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { createHash } from 'node:crypto';
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
  connect(): Promise<void>;
  call<T extends Record<string, unknown>>(name: AllowedBurpTool, arguments_: T): Promise<unknown>;
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
  connect(transport: unknown): Promise<void>;
  listTools(): Promise<unknown>;
  callTool(input: { readonly name: string; readonly arguments: Record<string, unknown> }): Promise<unknown>;
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

export function createHostHeaderFetch(hostHeader: string, fetchImpl: typeof fetch = fetch): typeof fetch {
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
  private readonly fetchImpl: typeof fetch;
  private sdkClient: SdkClientLike | undefined;
  private connected = false;

  constructor(settings: BurpMcpSettings, factories: BurpClientFactories = {}) {
    this.settings = settings;
    this.createClient = factories.createClient ?? createProductionClient;
    this.createTransport = factories.createTransport ?? createProductionTransport;
    this.fetchImpl = factories.fetch ?? fetch;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    const client = this.createClient();
    this.sdkClient = client;
    try {
      const transport = this.createTransport(new URL(this.settings.url), {
        fetch: createHostHeaderFetch(this.settings.hostHeader, this.fetchImpl),
      });
      await client.connect(transport);

      const tools = await client.listTools();
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
      try {
        await client.close();
      } catch {
        // Preserve the connection or tool-validation error.
      }
      throw error;
    }
  }

  async call<T extends Record<string, unknown>>(name: AllowedBurpTool, arguments_: T): Promise<unknown> {
    if (!ALLOWED_BURP_TOOLS.has(name)) {
      throw new Error(`Burp MCP tool is not allowed: ${name}`);
    }
    if (!this.connected || !this.sdkClient) {
      throw new Error('Burp MCP client is not connected');
    }
    return this.sdkClient.callTool({ name, arguments: arguments_ });
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
): Promise<HistorySnapshot> {
  const records: RawHistoryRecord[] = [];
  const regex = escapedHostRegex(targetOrigin);
  const count = 100;

  for (let offset = 0; ; offset += count) {
    const result = await client.call('get_proxy_http_history_regex', { regex, count, offset });
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
