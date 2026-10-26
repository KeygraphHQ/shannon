/**
 * HTTP transport for the php2shell probe.
 *
 * Sends one multipart request and records the response in the shape the classifier needs: whether
 * the request completed at all, the status, the body (bounded), and the version-bearing headers. A
 * transport failure is reported as `reachable: false` rather than thrown, because a probe request
 * that drops its connection while the control succeeded is itself a crash signal. A request aborted
 * by the deadline is reported separately as `timedOut`, since slowness must not read as a crash.
 */

import type { MultipartBody } from './multipart.js';

/** Response headers the probe reads a PHP version from, lowest cost first. */
export const VERSION_HEADERS = ['x-powered-by', 'server'] as const;

/** Cap on the response body the probe reads. The in-band fatal-error banner appears at the top. */
const MAX_BODY_BYTES = 64 * 1024;

export interface ProbeResponse {
  readonly reachable: boolean;
  /** True when the request was aborted by the probe's own deadline rather than completing or failing outright. */
  readonly timedOut: boolean;
  readonly status: number;
  readonly bodyLength: number;
  readonly bodyText: string;
  readonly headers: Readonly<Record<string, string>>;
}

/** A request that failed outright (connection refused, reset, DNS, TLS). A crash signal when the control is healthy. */
const UNREACHABLE: ProbeResponse = Object.freeze({
  reachable: false,
  timedOut: false,
  status: 0,
  bodyLength: 0,
  bodyText: '',
  headers: Object.freeze({}),
});

/** A request aborted by the deadline. Ambiguous (a crash or ordinary slowness), so never a crash signal. */
const TIMED_OUT: ProbeResponse = Object.freeze({
  reachable: false,
  timedOut: true,
  status: 0,
  bodyLength: 0,
  bodyText: '',
  headers: Object.freeze({}),
});

/**
 * Read the response body as a stream, retaining at most {@link MAX_BODY_BYTES} for classification
 * while counting the full byte length for the report. Bounding the retained bytes keeps a very large
 * response from exhausting memory, and the running count preserves the reported body length.
 */
async function readBoundedBody(response: Response): Promise<{ bodyText: string; bodyLength: number }> {
  const reader = response.body?.getReader();
  if (reader === undefined) {
    return { bodyText: '', bodyLength: 0 };
  }
  const kept: Buffer[] = [];
  let keptBytes = 0;
  let totalBytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (keptBytes < MAX_BODY_BYTES) {
      const room = MAX_BODY_BYTES - keptBytes;
      const slice = value.byteLength > room ? value.subarray(0, room) : value;
      kept.push(Buffer.from(slice));
      keptBytes += slice.byteLength;
    }
  }
  return { bodyText: Buffer.concat(kept).toString('utf8'), bodyLength: totalBytes };
}

function collectVersionHeaders(headers: Headers): Record<string, string> {
  const collected: Record<string, string> = {};
  for (const name of VERSION_HEADERS) {
    const value = headers.get(name);
    if (value !== null) collected[name] = value;
  }
  return collected;
}

/**
 * Send a single multipart request and observe the response. Never throws on a transport fault; an
 * incomplete request returns {@link UNREACHABLE} so the caller can treat a dropped probe connection
 * as a crash signal relative to a healthy control.
 */
export async function sendMultipart(
  url: string,
  method: string,
  body: MultipartBody,
  timeoutMs: number,
): Promise<ProbeResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: { 'content-type': body.contentType, accept: '*/*' },
      body: body.body,
      redirect: 'manual',
      signal: controller.signal,
    });

    const { bodyText, bodyLength } = await readBoundedBody(response);
    return {
      reachable: true,
      timedOut: false,
      status: response.status,
      bodyLength,
      bodyText,
      headers: collectVersionHeaders(response.headers),
    };
  } catch {
    // Distinguish the probe's own deadline (ambiguous) from an outright transport failure (a crash
    // signal when the control is healthy). The abort covers both a timeout before the response
    // headers and one while the body is still streaming.
    return controller.signal.aborted ? TIMED_OUT : UNREACHABLE;
  } finally {
    clearTimeout(timer);
  }
}
