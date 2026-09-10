/**
 * Web/API application understanding from live HTTP behavior.
 *
 * `probeEndpoint` performs one real HTTP request (via the platform `fetch`)
 * and normalizes the response into a structured, redaction-safe
 * `HttpProbeResult` plus a `RawDiscovery` for the world model — routes,
 * methods, status, content-type, redirect chain, and cookie *names* (never
 * values) become world-model/evidence material. It never assumes an
 * endpoint is vulnerable merely because it responds.
 */

import type { RawDiscovery } from '../types.js';

export interface HttpProbeResult {
  readonly url: string;
  readonly method: string;
  readonly statusCode: number;
  readonly contentType: string | undefined;
  readonly redirectedTo: string | undefined;
  readonly cookieNames: readonly string[];
  readonly headers: Readonly<Record<string, string>>;
  readonly bodyExcerpt: string;
  readonly bodyLength: number;
}

function cookieNamesFrom(setCookieHeader: string | null): readonly string[] {
  if (!setCookieHeader) return [];
  return setCookieHeader
    .split(',')
    .map((part) => part.split(';')[0]?.split('=')[0]?.trim())
    .filter((name): name is string => Boolean(name));
}

export interface ProbeOptions {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly maxBodyExcerpt?: number;
}

/** Performs one real HTTP request and normalizes it. Never throws for a non-2xx response — that is itself an observation. */
export async function probeEndpoint(url: string, options: ProbeOptions = {}): Promise<HttpProbeResult> {
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    ...(options.headers !== undefined ? { headers: options.headers } : {}),
    redirect: 'manual',
    signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
  });

  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const body = await response.text();
  const maxExcerpt = options.maxBodyExcerpt ?? 500;

  return {
    url,
    method: options.method ?? 'GET',
    statusCode: response.status,
    contentType: response.headers.get('content-type') ?? undefined,
    redirectedTo: response.headers.get('location') ?? undefined,
    cookieNames: cookieNamesFrom(response.headers.get('set-cookie')),
    headers,
    bodyExcerpt: body.slice(0, maxExcerpt),
    bodyLength: body.length,
  };
}

export function probeResultToDiscovery(result: HttpProbeResult): RawDiscovery {
  return {
    source: 'active-recon',
    kind: 'endpoint',
    label: result.url,
    attributes: {
      method: result.method,
      statusCode: result.statusCode,
      contentType: result.contentType,
      redirectedTo: result.redirectedTo,
      cookieNames: result.cookieNames,
    },
    confidence: 0.85,
    discoveredAt: new Date().toISOString(),
  };
}
