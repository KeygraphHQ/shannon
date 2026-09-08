// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from 'node:crypto';
import type { ReviewFormat, RuleId } from './types.js';
import { isRecord } from './types.js';

function lookup(document: unknown, tokens: readonly string[]): unknown {
  let value = document;
  for (const token of tokens) {
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, token)) return undefined;
    value = (value as Record<string, unknown>)[token];
  }
  return value;
}

/** Identity is private metadata, not anonymization. Numeric positions remain evidence only. */
export function observationIdentity(
  format: ReviewFormat,
  document: unknown,
  rule: RuleId,
  pointer: string,
): string | null {
  if (!pointer.startsWith('/') || /~(?![01])/.test(pointer)) return null;
  const tokens = pointer
    .slice(1)
    .split('/')
    .map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'));
  const value = lookup(document, tokens);
  if (value === undefined) return null;
  let identity: unknown[];
  if (format === 'compose') {
    if (tokens[0] !== 'services' || tokens.length < 3) return null;
    const context = tokens.slice(0, 3);
    if (rule === 'compose/privileged' && tokens.length === 3 && tokens[2] === 'privileged') identity = [context, true];
    else if (
      rule === 'compose/host-namespace' &&
      tokens.length === 3 &&
      ['network_mode', 'pid'].includes(tokens[2] ?? '') &&
      value === 'host'
    )
      identity = [context, 'host'];
    else if (
      rule === 'compose/expanded-capabilities' &&
      tokens.length === 4 &&
      tokens[2] === 'cap_add' &&
      typeof value === 'string'
    ) {
      const capability = value.toUpperCase().replace(/^CAP_/, '');
      if (!['ALL', 'SYS_ADMIN'].includes(capability)) return null;
      identity = [context, capability];
    } else if (
      rule === 'compose/unconfined-profile' &&
      tokens.length === 4 &&
      tokens[2] === 'security_opt' &&
      typeof value === 'string'
    ) {
      const separator = value.includes('=') ? value.indexOf('=') : value.indexOf(':');
      if (separator < 0 || value.slice(separator + 1) !== 'unconfined') return null;
      identity = [context, value.slice(0, separator), 'unconfined'];
    } else return null;
  } else {
    const scope = rule === 'openapi/undeclared-oauth-scope';
    if (!scope && rule !== 'openapi/undeclared-security-scheme') return null;
    const securityIndex = tokens.length - (scope ? 4 : 3);
    if (securityIndex < 0 || tokens[securityIndex] !== 'security' || !/^\d+$/.test(tokens[securityIndex + 1] ?? ''))
      return null;
    const requirement = lookup(document, tokens.slice(0, securityIndex + 2));
    if (!isRecord(requirement)) return null;
    // Scheme-key conjunction identifies the requirement context. Scope order and OR
    // alternative positions do not change that context; duplicate identities abstain.
    identity = [tokens.slice(0, securityIndex), Object.keys(requirement).sort(), tokens[securityIndex + 2]];
    if (scope) {
      if (typeof value !== 'string') return null;
      identity.push(value);
    }
  }
  return createHash('sha256')
    .update(JSON.stringify(['declaration-v1', format, rule, ...identity]))
    .digest('hex');
}
