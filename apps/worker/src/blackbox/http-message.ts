// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Strict parsing for the HTTP/1.x and HTTP/2 text representations returned by Burp.
 *
 * This module deliberately keeps header values intact, including duplicate
 * fields.
 */

const TOKEN_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const HTTP_VERSION_PATTERN = /^HTTP\/(?:\d+\.\d+|2)$/;

export interface HttpHeader {
  readonly name: string;
  readonly value: string;
}

export interface ParsedHttpRequest {
  readonly method: string;
  readonly target: string;
  readonly version: string;
  readonly headers: readonly HttpHeader[];
  readonly body: string;
}

export interface ParsedHttpResponse {
  readonly version: string;
  readonly status: number;
  readonly reason: string;
  readonly headers: readonly HttpHeader[];
  readonly body: string;
}

export class HttpMessageParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HttpMessageParseError';
  }
}

interface ParsedHead {
  readonly startLine: string;
  readonly headers: readonly HttpHeader[];
  readonly body: string;
}

/** Parse an HTTP request start line, headers, and body. */
export function parseHttpRequest(raw: string): ParsedHttpRequest {
  const parsed = parseMessage(raw, 'request');
  const match = /^(\S+) (\S+) (HTTP\/(?:\d+\.\d+|2))$/.exec(parsed.startLine);
  if (!match) {
    throw new HttpMessageParseError('Malformed HTTP request start line');
  }

  const [, method, target, version] = match;
  if (!method || !TOKEN_PATTERN.test(method) || !target || !version || !HTTP_VERSION_PATTERN.test(version)) {
    throw new HttpMessageParseError('Malformed HTTP request start line');
  }

  return {
    method,
    target,
    version: version.slice('HTTP/'.length),
    headers: parsed.headers,
    body: parsed.body,
  };
}

/** Parse an HTTP response status line, headers, and body. */
export function parseHttpResponse(raw: string): ParsedHttpResponse {
  const parsed = parseMessage(raw, 'response');
  const match = /^HTTP\/((?:\d+\.\d+)|2) (\d{3})(?: (.*))?$/.exec(parsed.startLine);
  if (!match) {
    throw new HttpMessageParseError('Malformed HTTP response start line');
  }

  const [, version, statusText, reason = ''] = match;
  const status = Number(statusText);
  if (!version || !HTTP_VERSION_PATTERN.test(`HTTP/${version}`) || !statusText || !Number.isInteger(status)) {
    throw new HttpMessageParseError('Malformed HTTP response start line');
  }

  return {
    version,
    status,
    reason,
    headers: parsed.headers,
    body: parsed.body,
  };
}

/** Return all values for a header name, preserving their wire order. */
export function getHeaderValues(headers: readonly HttpHeader[], name: string): readonly string[] {
  const normalizedName = name.toLowerCase();
  return headers.filter((header) => header.name.toLowerCase() === normalizedName).map((header) => header.value);
}

function parseMessage(raw: string, kind: 'request' | 'response'): ParsedHead {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new HttpMessageParseError(`Empty HTTP ${kind}`);
  }

  const separator = findHeaderBodySeparator(raw);
  if (separator === null) {
    throw new HttpMessageParseError(`HTTP ${kind} is missing the header/body separator`);
  }

  const head = raw.slice(0, separator.headerEnd);
  const body = raw.slice(separator.bodyStart);
  const lines = splitHeadLines(head, separator.lineEnding);
  const startLine = lines.shift();
  if (!startLine || startLine.trimStart() !== startLine || /[\r\n]/.test(startLine)) {
    throw new HttpMessageParseError(`Malformed HTTP ${kind} start line`);
  }

  const headers = lines.map((line, index) => parseHeader(line, index + 1, kind));
  return { startLine, headers, body };
}

function findHeaderBodySeparator(
  raw: string,
): { readonly headerEnd: number; readonly bodyStart: number; readonly lineEnding: '\r\n' | '\n' } | null {
  const crlfIndex = raw.indexOf('\r\n\r\n');
  const lfIndex = raw.indexOf('\n\n');

  if (crlfIndex < 0 && lfIndex < 0) return null;
  if (crlfIndex >= 0 && (lfIndex < 0 || crlfIndex <= lfIndex)) {
    return { headerEnd: crlfIndex, bodyStart: crlfIndex + 4, lineEnding: '\r\n' };
  }
  return { headerEnd: lfIndex, bodyStart: lfIndex + 2, lineEnding: '\n' };
}

function splitHeadLines(head: string, lineEnding: '\r\n' | '\n'): string[] {
  if (lineEnding === '\r\n') {
    if (head.includes('\n') && !head.includes('\r\n')) {
      throw new HttpMessageParseError('Mixed HTTP line endings');
    }
    if (head.includes('\r') && /\r(?!\n)/.test(head)) {
      throw new HttpMessageParseError('Malformed HTTP line ending');
    }
    return head.split('\r\n');
  }

  if (head.includes('\r')) {
    throw new HttpMessageParseError('Mixed HTTP line endings');
  }
  return head.split('\n');
}

function parseHeader(line: string, lineNumber: number, kind: 'request' | 'response'): HttpHeader {
  if (line.length === 0 || /^[ \t]/.test(line)) {
    throw new HttpMessageParseError(`Malformed HTTP ${kind} header on line ${lineNumber}`);
  }

  const colon = line.indexOf(':');
  if (colon <= 0) {
    throw new HttpMessageParseError(`Malformed HTTP ${kind} header on line ${lineNumber}`);
  }

  const name = line.slice(0, colon);
  if (!TOKEN_PATTERN.test(name)) {
    throw new HttpMessageParseError(`Malformed HTTP ${kind} header name on line ${lineNumber}`);
  }

  const value = line.slice(colon + 1).trim();
  if (/[\r\n]/.test(value)) {
    throw new HttpMessageParseError(`Malformed HTTP ${kind} header value on line ${lineNumber}`);
  }

  return { name, value };
}
