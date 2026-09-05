// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

export interface SensitiveTelemetryPolicy {
  readonly sensitiveValues: readonly string[];
  readonly redactAuthenticationSyntax: true;
  /**
   * Also strip credentials that carry their own scheme prefix or JWT shape and so
   * need no field name to be recognized.
   *
   * WARNING: `Bearer` and `Basic` are ordinary English words, so this pass rewrites
   * prose such as "bypasses Basic authentication". A caller deciding whether to keep
   * text rather than rewrite it must ask `containsCredentialSyntax` instead of
   * comparing redacted output against its input.
   */
  readonly redactPortableTokens?: boolean;
}

const REDACTED = '<redacted>';
const CIRCULAR = '<circular>';

/**
 * Field names that read as a credential wherever they occur, prose included.
 * Longer names precede the shorter ones they contain so alternation prefers the
 * most specific match.
 */
const CREDENTIAL_FIELD_NAMES = [
  'password',
  'passwd',
  'pwd',
  'secret',
  'credential',
  'nonce',
  'api[_-]?key',
  'access[_-]?token',
  'refresh[_-]?token',
  'csrf(?:[_-]?token)?',
  'xsrf(?:[_-]?token)?',
  'session(?:[_-]?id)?',
  'x[_-]?auth(?:[_-]?token)?',
  'token',
].join('|');

/** Header names whose bare `name: value` form belongs to the dedicated header rules. */
const CREDENTIAL_HEADER_NAMES = ['(?:proxy-)?authorization', '(?:set-)?cookie'].join('|');

// IMPORTANT: `key` and `state` are ordinary English words that name a credential
// only when they occupy a key position - an object property or a quoted
// serialization key. The bare-key rules below exclude them so ordinary prose
// ("changes the order state: shipped") survives redaction unchanged.
const KEY_POSITION_NAMES = [CREDENTIAL_HEADER_NAMES, CREDENTIAL_FIELD_NAMES, 'key', 'state'].join('|');

const AUTH_HEADER = /((?:proxy-)?authorization)\s*:\s*[^\r\n]*/gi;
const COOKIE_HEADER = /((?:set-cookie|cookie))\s*:\s*([^\r\n]*)/gi;
const AUTH_ASSIGNMENT = /\b((?:proxy-)?authorization)\s*([:=])\s*([^\r\n&;,}]+)/gi;
const COOKIE_FIELD = /\b((?:set-)?cookie)\s*=\s*([^\r\n&;,}]+)/gi;
const CREDENTIAL_ASSIGNMENT = new RegExp(`\\b(${CREDENTIAL_FIELD_NAMES})\\s*([:=])\\s*(["']?)([^"'&;,}\\s]+)\\3`, 'gi');
// Quoted-key serializations (JSON, JS/Python literals) put the key's closing quote
// between the name and the delimiter, which the bare-key rules cannot cross.
const QUOTED_CREDENTIAL_FIELD = new RegExp(
  `(["'])(${KEY_POSITION_NAMES})\\1(\\s*[:=]\\s*)("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|[^\\s,}\\]]+)`,
  'gi',
);
const COOKIE_ASSIGNMENT = /([A-Za-z0-9_.-]+)\s*=\s*([^;\s,]+)/g;
const SENSITIVE_KEY = new RegExp(`^(?:${KEY_POSITION_NAMES})$`, 'i');
const PORTABLE_AUTH_TOKEN = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const JWT_SHAPE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/;
const PORTABLE_JWT = new RegExp(JWT_SHAPE.source, 'g');

// === Credential shape detection ===
// Redaction rewrites text, so a name that only sometimes marks a credential costs
// nothing there. A caller that instead decides whether to KEEP text pays for every
// false positive with discarded work, and needs the narrower vocabulary below.

/**
 * Field names qualified enough to mark a credential wherever they occur. Bare words such
 * as `token`, `session`, `nonce`, `credential`, `key` and `state` are excluded: they are
 * ordinary vocabulary in a security finding. Longer names precede the shorter ones they
 * contain so alternation prefers the most specific match.
 */
const QUALIFIED_CREDENTIAL_NAMES = [
  'password',
  'passwd',
  'pwd',
  'client[_-]?secret',
  'secret',
  'api[_-]?key',
  'access[_-]?token',
  'refresh[_-]?token',
  'csrf[_-]?token',
  'xsrf[_-]?token',
  'x[_-]?auth[_-]?token',
  'session[_-]?id',
].join('|');

// A closing quote may sit between the name and its separator: serialized JSON reaches these
// tests as `"api_key":"..."`, and a name that only marks a credential in bare prose would miss
// every structured submission.
const CREDENTIAL_HEADER_POSITION = new RegExp(`\\b(?:${CREDENTIAL_HEADER_NAMES})["']?\\s*[:=]\\s*["']?\\S`, 'i');
const QUALIFIED_CREDENTIAL_POSITION = new RegExp(`\\b(?:${QUALIFIED_CREDENTIAL_NAMES})["']?\\s*[:=]\\s*["']?\\S`, 'i');
// `Bearer` and `Basic` open ordinary prose ("bypasses Basic authentication"), so a scheme
// prefix alone proves nothing. A real token runs long and carries a digit or a separator,
// which no English word following the scheme does.
const SCHEME_CREDENTIAL = /\b(?:Bearer|Basic)\s+(?=[A-Za-z0-9._~+/=-]{16,})[A-Za-z0-9._~+/=-]*[0-9._~+/=-]/i;

/**
 * Report whether text carries credential material recognizable by shape alone: a header
 * position, a qualified credential name, a scheme-prefixed token, or a JWT.
 *
 * For callers that keep or discard text rather than rewrite it. Text that merely mentions
 * or quotes authentication vocabulary passes; text carrying the credential itself does not.
 */
export function containsCredentialSyntax(value: string): boolean {
  return (
    CREDENTIAL_HEADER_POSITION.test(value) ||
    QUALIFIED_CREDENTIAL_POSITION.test(value) ||
    SCHEME_CREDENTIAL.test(value) ||
    JWT_SHAPE.test(value)
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Strip scheme-prefixed and JWT-shaped credentials that carry no field name. */
export function redactPortableTokens(value: string): string {
  return value.replace(PORTABLE_AUTH_TOKEN, `$1 ${REDACTED}`).replace(PORTABLE_JWT, REDACTED);
}

function redactString(value: string, policy: SensitiveTelemetryPolicy): string {
  let result = value;
  const values = [...new Set(policy.sensitiveValues)].filter((candidate) => candidate.length > 0);
  for (const sensitiveValue of values.sort((a, b) => b.length - a.length)) {
    result = result.replace(new RegExp(escapeRegExp(sensitiveValue), 'g'), REDACTED);
  }

  if (policy.redactPortableTokens) result = redactPortableTokens(result);
  if (!policy.redactAuthenticationSyntax) return result;

  // A quoted value is bounded by its own closing quote, so it has to be settled
  // before the line-greedy header rules run across the rest of the line.
  result = result.replace(QUOTED_CREDENTIAL_FIELD, (_match, quote: string, key: string, separator: string) => {
    return `${quote}${key}${quote}${separator}"${REDACTED}"`;
  });
  result = result.replace(AUTH_HEADER, `$1: ${REDACTED}`);
  result = result.replace(AUTH_ASSIGNMENT, `$1$2${REDACTED}`);
  result = result.replace(COOKIE_HEADER, (_match, name: string, contents: string) => {
    return `${name}: ${contents.replace(COOKIE_ASSIGNMENT, `$1=${REDACTED}`)}`;
  });
  result = result.replace(COOKIE_FIELD, `$1=${REDACTED}`);
  return result.replace(CREDENTIAL_ASSIGNMENT, `$1$2${REDACTED}`);
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

function redactError(error: Error, policy: SensitiveTelemetryPolicy, seen: WeakMap<object, unknown>): Error {
  const redacted = Object.create(Object.getPrototypeOf(error)) as Error;
  seen.set(error, CIRCULAR);
  Object.defineProperties(redacted, {
    message: { configurable: true, writable: true, value: redactString(error.message, policy) },
    name: { configurable: true, writable: true, value: redactString(error.name, policy) },
  });
  if ('stack' in error && typeof error.stack === 'string') {
    Object.defineProperty(redacted, 'stack', {
      configurable: true,
      writable: true,
      value: redactString(error.stack, policy),
    });
  }
  for (const key of ['code', 'status', 'cause']) {
    if (key in error) {
      const value = (error as unknown as Record<string, unknown>)[key];
      (redacted as unknown as Record<string, unknown>)[key] = redactValue(value, policy, seen);
    }
  }
  return redacted;
}

function redactValue(value: unknown, policy: SensitiveTelemetryPolicy, seen: WeakMap<object, unknown>): unknown {
  if (typeof value === 'string') return redactString(value, policy);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return CIRCULAR;

  if (value instanceof Error) {
    return redactError(value, policy, seen);
  }
  if (Array.isArray(value)) {
    const redacted: unknown[] = [];
    seen.set(value, CIRCULAR);
    for (const item of value) redacted.push(redactValue(item, policy, seen));
    return redacted;
  }
  if (value instanceof Date) return value;
  if (value instanceof Map) {
    const redacted = new Map<unknown, unknown>();
    seen.set(value, CIRCULAR);
    for (const [key, item] of value) {
      redacted.set(redactValue(key, policy, seen), redactValue(item, policy, seen));
    }
    return redacted;
  }
  if (value instanceof Set) {
    const redacted = new Set<unknown>();
    seen.set(value, CIRCULAR);
    for (const item of value) redacted.add(redactValue(item, policy, seen));
    return redacted;
  }

  const redacted: Record<string, unknown> = {};
  seen.set(value, CIRCULAR);
  for (const [key, item] of Object.entries(value)) {
    const redactedKey = redactString(key, policy);
    // A sensitive key hides its whole subtree whatever its JSON type, and skipping
    // the walk keeps a shared object out of `seen` until its first legitimate use.
    if (isSensitiveKey(key)) {
      redacted[redactedKey] = REDACTED;
      continue;
    }
    redacted[redactedKey] = redactValue(item, policy, seen);
  }
  return redacted;
}

export function redactSensitive(value: unknown, policy: SensitiveTelemetryPolicy): unknown {
  return redactValue(value, policy, new WeakMap<object, unknown>());
}
