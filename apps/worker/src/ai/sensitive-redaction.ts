// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

export interface SensitiveTelemetryPolicy {
  readonly sensitiveValues: readonly string[];
  readonly redactAuthenticationSyntax: true;
}

const REDACTED = '<redacted>';
const CIRCULAR = '<circular>';
const AUTH_HEADER = /((?:proxy-)?authorization)\s*:\s*[^\r\n]*/gi;
const COOKIE_HEADER = /((?:set-cookie|cookie))\s*:\s*([^\r\n]*)/gi;
const AUTH_ASSIGNMENT = /\b((?:proxy-)?authorization)\s*([:=])\s*([^\r\n&;,}]+)/gi;
const COOKIE_FIELD = /\b((?:set-)?cookie)\s*=\s*([^\r\n&;,}]+)/gi;
const CREDENTIAL_ASSIGNMENT =
  /\b((?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|csrf(?:[_-]?token)?|xsrf(?:[_-]?token)?))\s*([:=])\s*(["']?)([^"'&;,}\s]+)\3/gi;
const COOKIE_ASSIGNMENT = /([A-Za-z0-9_.-]+)\s*=\s*([^;\s,]+)/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function redactString(value: string, policy: SensitiveTelemetryPolicy): string {
  let result = value;
  const values = [...new Set(policy.sensitiveValues)].filter((candidate) => candidate.length > 0);
  for (const sensitiveValue of values.sort((a, b) => b.length - a.length)) {
    result = result.replace(new RegExp(escapeRegExp(sensitiveValue), 'g'), REDACTED);
  }

  if (!policy.redactAuthenticationSyntax) return result;

  result = result.replace(AUTH_HEADER, `$1: ${REDACTED}`);
  result = result.replace(AUTH_ASSIGNMENT, `$1$2${REDACTED}`);
  result = result.replace(COOKIE_HEADER, (_match, name: string, contents: string) => {
    return `${name}: ${contents.replace(COOKIE_ASSIGNMENT, `$1=${REDACTED}`)}`;
  });
  result = result.replace(COOKIE_FIELD, `$1=${REDACTED}`);
  return result.replace(CREDENTIAL_ASSIGNMENT, `$1$2${REDACTED}`);
}

function isSensitiveKey(key: string): boolean {
  return /^(?:proxy-)?authorization$|^(?:set-)?cookie$|^(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|csrf(?:[_-]?token)?|xsrf(?:[_-]?token)?)$/i.test(
    key,
  );
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
    const redactedItem = redactValue(item, policy, seen);
    redacted[redactedKey] = isSensitiveKey(key) && typeof item === 'string' ? REDACTED : redactedItem;
  }
  return redacted;
}

export function redactSensitive(value: unknown, policy: SensitiveTelemetryPolicy): unknown {
  return redactValue(value, policy, new WeakMap<object, unknown>());
}
