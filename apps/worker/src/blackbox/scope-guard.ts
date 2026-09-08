// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { createHash } from 'node:crypto';
import type { BlackboxRunScope } from '../types/blackbox.js';
import type { IdentityBoundRequestField, Rule, Rules } from '../types/config.js';
import type { ParsedHttpRequest } from './http-message.js';
import { getHeaderValues } from './http-message.js';

const HTTP_PROTOCOLS = new Set(['http:', 'https:']);

export const DEFAULT_BURP_MCP_URL = 'http://host.docker.internal:9876';
export const DEFAULT_BURP_MCP_HOST_HEADER = '127.0.0.1:9876';
export const BLACKBOX_EVIDENCE_BINDING_VERSION = 1;

export interface BlackboxScopeEnvironment {
  readonly SHANNON_BURP_MCP_URL?: string;
  readonly SHANNON_BURP_MCP_HOST_HEADER?: string;
  readonly SHANNON_BURP_PROXY_URL?: string;
}

export interface NormalizedRequestTarget {
  readonly origin: string;
  readonly path: string;
  readonly query: URLSearchParams;
}

/**
 * Normalize an HTTP(S) origin to the URL origin form.
 *
 * Origins never carry a path, query, or fragment. URL also canonicalizes host
 * casing and removes default HTTP(S) ports for comparisons.
 */
export function normalizeTargetOrigin(targetOrigin: string): string {
  if (typeof targetOrigin !== 'string' || targetOrigin.trim().length === 0) {
    throw new Error('Target origin must be a non-empty URL');
  }

  let parsed: URL;
  try {
    parsed = new URL(targetOrigin);
  } catch {
    throw new Error('Invalid target origin');
  }
  if (!HTTP_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`Only HTTP(S) target origins are supported: ${parsed.protocol}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('Target origin must not contain credentials');
  }
  return parsed.origin;
}

function normalizeEndpoint(value: string, label: string, protocols: ReadonlySet<string>): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (!protocols.has(parsed.protocol) || parsed.hostname.length === 0 || parsed.username || parsed.password) {
    throw new Error(`${label} is invalid`);
  }
  return parsed.href;
}

export function createBlackboxRunScope(
  targetUrl: string,
  identities: readonly string[],
  identityBoundRequestFields: readonly IdentityBoundRequestField[],
  environment: BlackboxScopeEnvironment,
  validationSelectionDigest?: string,
): BlackboxRunScope {
  const proxy = environment.SHANNON_BURP_PROXY_URL?.trim();
  if (!proxy) throw new Error('SHANNON_BURP_PROXY_URL is required for black-box mode');
  const hostHeader = (environment.SHANNON_BURP_MCP_HOST_HEADER?.trim() || DEFAULT_BURP_MCP_HOST_HEADER).toLowerCase();
  if (/[^!-~]/.test(hostHeader) || /[/?#@]/.test(hostHeader)) {
    throw new Error('SHANNON_BURP_MCP_HOST_HEADER is invalid');
  }
  if (validationSelectionDigest !== undefined && !/^[a-f0-9]{64}$/.test(validationSelectionDigest)) {
    throw new Error('Black-box validation selection digest is invalid');
  }

  return {
    mode: 'blackbox',
    targetOrigin: normalizeTargetOrigin(targetUrl),
    identities: [...identities].sort((left, right) => left.localeCompare(right)),
    burpMcpUrl: normalizeEndpoint(
      environment.SHANNON_BURP_MCP_URL?.trim() || DEFAULT_BURP_MCP_URL,
      'SHANNON_BURP_MCP_URL',
      HTTP_PROTOCOLS,
    ),
    burpMcpHostHeader: hostHeader,
    burpProxyUrl: normalizeEndpoint(proxy, 'SHANNON_BURP_PROXY_URL', new Set(['http:'])),
    evidenceBindingVersion: BLACKBOX_EVIDENCE_BINDING_VERSION,
    identityBindingContractDigest: identityBindingContractDigest(identityBoundRequestFields),
    ...(validationSelectionDigest ? { validationSelectionDigest } : {}),
  };
}

export function identityBindingContractDigest(fields: readonly IdentityBoundRequestField[]): string {
  const canonical = fields
    .map((field) =>
      field.location === 'json'
        ? `${field.location}\0${field.pointer}`
        : `${field.location}\0${field.location === 'header' ? field.name.toLowerCase() : field.name}`,
    )
    .sort();
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function assertSameBlackboxRunScope(existing: BlackboxRunScope, expected: BlackboxRunScope): void {
  const fields: readonly (keyof BlackboxRunScope)[] = [
    'mode',
    'targetOrigin',
    'identities',
    'burpMcpUrl',
    'burpMcpHostHeader',
    'burpProxyUrl',
    'evidenceBindingVersion',
    'identityBindingContractDigest',
    'validationSelectionDigest',
  ];
  for (const field of fields) {
    const left = field === 'identities' ? [...existing.identities].sort() : existing[field];
    const right = field === 'identities' ? [...expected.identities].sort() : expected[field];
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      throw new Error(`Black-box resume scope mismatch: ${field}`);
    }
  }
}

function hostValues(request: ParsedHttpRequest): string[] {
  return getHeaderValues(request.headers, 'host')
    .map((value) => value.trim())
    .filter(Boolean);
}

function hostOrigin(protocol: string, host: string): URL {
  if (host.length === 0 || /[\s\\/@?#]/.test(host) || host.startsWith(':') || host.endsWith(':')) {
    throw new Error('Invalid Host header');
  }
  try {
    const parsed = new URL(`${protocol}//${host}`);
    if (parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) {
      throw new Error('Invalid Host header');
    }
    return parsed;
  } catch {
    throw new Error('Invalid Host header');
  }
}

function requestUrl(request: ParsedHttpRequest, targetOrigin: string): URL {
  const configured = new URL(normalizeTargetOrigin(targetOrigin));
  const hosts = hostValues(request);
  if (hosts.length !== 1) {
    throw new Error('HTTP request must contain exactly one non-empty Host header');
  }
  const host = hosts[0];
  if (!host) throw new Error('HTTP request is missing a Host header');

  const target = request.target.trim();
  let parsed: URL;
  if (/^https?:\/\//i.test(target)) {
    try {
      parsed = new URL(target);
    } catch {
      throw new Error('Invalid absolute HTTP request target');
    }
    if (!HTTP_PROTOCOLS.has(parsed.protocol)) {
      throw new Error(`Unsupported request target protocol ${parsed.protocol}`);
    }
    if (parsed.username || parsed.password) {
      throw new Error('HTTP request target must not contain credentials');
    }

    const declaredHost = hostOrigin(parsed.protocol, host);
    if (declaredHost.host !== parsed.host) {
      throw new Error('HTTP request target and Host header do not match');
    }
  } else {
    // Only origin-form paths are accepted. CONNECT authority-form and '*' are
    // not useful for target-scoped HTTP traffic and fail closed.
    if (!target.startsWith('/')) {
      throw new Error('Unsupported HTTP request target');
    }
    const declaredHost = hostOrigin(configured.protocol, host);
    parsed = new URL(target, declaredHost);
  }

  if (!HTTP_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`Unsupported request target protocol ${parsed.protocol}`);
  }
  return parsed;
}

function sameOrigin(request: ParsedHttpRequest, targetOrigin: string): URL | null {
  const configured = normalizeTargetOrigin(targetOrigin);
  try {
    const parsed = requestUrl(request, configured);
    if (parsed.origin !== configured) return null;
    return parsed;
  } catch {
    return null;
  }
}

function globToRegExp(glob: string): RegExp | null {
  if (!glob.startsWith('/') || glob.includes('\0')) return null;

  let pattern = '^';
  for (const character of glob) {
    if (character === '*') {
      pattern += '.*';
      continue;
    }
    pattern += character.replace(/[\\^$+?.()|[\]{}]/g, '\\$&');
  }
  pattern += '$';

  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

function pathMatches(pathname: string, pattern: string): boolean {
  if (!pattern.includes('*')) {
    const prefix = pattern.endsWith('/') ? pattern : `${pattern}/`;
    return pathname === pattern || pathname.startsWith(prefix);
  }
  const expression = globToRegExp(pattern);
  return expression?.test(pathname) ?? false;
}

function normalizedRuleValue(rule: Rule): string {
  return rule.value.trim().toLowerCase().replace(/\.$/, '');
}

function domainMatches(hostname: string, value: string): boolean {
  const domain = normalizedRuleValue({ type: 'domain', value });
  if (!domain) return false;
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function subdomainMatches(hostname: string, value: string): boolean {
  const subdomain = normalizedRuleValue({ type: 'subdomain', value }).replace(/^\.+/, '');
  if (!subdomain) return false;

  return hostname === subdomain || hostname.startsWith(`${subdomain}.`);
}

function collectJsonParameterNames(
  value: unknown,
  names: Set<string>,
  budget: { remaining: number },
  depth = 0,
): boolean {
  if (depth > 12 || budget.remaining <= 0) return false;
  budget.remaining -= 1;
  if (value === null || typeof value !== 'object') return true;
  if (Array.isArray(value)) {
    return value.every((entry) => collectJsonParameterNames(entry, names, budget, depth + 1));
  }
  return Object.entries(value as Record<string, unknown>).every(([key, entry]) => {
    names.add(key);
    return collectJsonParameterNames(entry, names, budget, depth + 1);
  });
}

function multipartParameterNames(body: string, contentType: string): Set<string> | null {
  const boundaryMatch = /(?:^|;)\s*boundary=(?:"([^"\r\n]+)"|([^;\s\r\n]+))/i.exec(contentType);
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
  if (!boundary || boundary.length > 70) return null;

  const delimiter = `--${boundary}`;
  const parts = body.split(delimiter);
  if (parts.length < 3 || !parts.at(-1)?.trimStart().startsWith('--')) return null;

  const names = new Set<string>();
  for (const rawPart of parts.slice(1, -1)) {
    const part = rawPart.replace(/^\r?\n/, '');
    const separator = part.indexOf('\r\n\r\n');
    const fallbackSeparator = separator < 0 ? part.indexOf('\n\n') : -1;
    const headerEnd = separator >= 0 ? separator : fallbackSeparator;
    if (headerEnd < 0) return null;

    const headerLines = part.slice(0, headerEnd).split(/\r?\n/);
    const dispositions = headerLines.filter((line) => /^content-disposition\s*:/i.test(line));
    if (dispositions.length !== 1) return null;
    const nameMatch = /(?:^|;)\s*name=(?:"([^"\r\n]*)"|([^;\s\r\n]+))/i.exec(dispositions[0] ?? '');
    const name = nameMatch?.[1] ?? nameMatch?.[2];
    if (!name) return null;
    names.add(name);
  }
  return names;
}

function parameterNames(request: ParsedHttpRequest, parsed: URL): Set<string> | null {
  const names = new Set(parsed.searchParams.keys());
  const contentType = getHeaderValues(request.headers, 'content-type')[0] ?? '';
  const normalizedContentType = contentType.toLowerCase();
  const mediaType = normalizedContentType.split(';', 1)[0]?.trim() ?? '';

  if (mediaType === 'application/x-www-form-urlencoded') {
    for (const key of new URLSearchParams(request.body).keys()) names.add(key);
  } else if (mediaType === 'application/json' || mediaType.endsWith('+json')) {
    try {
      const value: unknown = JSON.parse(request.body);
      if (!collectJsonParameterNames(value, names, { remaining: 10_000 })) return null;
    } catch {
      return null;
    }
  } else if (mediaType === 'multipart/form-data') {
    const multipartNames = multipartParameterNames(request.body, contentType);
    if (!multipartNames) return null;
    for (const name of multipartNames) names.add(name);
  }
  return names;
}

function ruleMatches(
  rule: Rule,
  request: ParsedHttpRequest,
  parsed: URL,
  inspectedParameters: ReadonlySet<string> | undefined,
): boolean {
  const value = normalizedRuleValue(rule);
  switch (rule.type) {
    case 'url_path':
      return pathMatches(parsed.pathname, rule.value.trim());
    case 'domain':
      return domainMatches(parsed.hostname.toLowerCase().replace(/\.$/, ''), value);
    case 'subdomain':
      return subdomainMatches(parsed.hostname.toLowerCase().replace(/\.$/, ''), value);
    case 'method':
      return request.method.toUpperCase() === value.toUpperCase();
    case 'header':
      return getHeaderValues(request.headers, rule.value.trim()).length > 0;
    case 'parameter':
      return inspectedParameters?.has(rule.value.trim()) ?? false;
    case 'code_path':
      return false;
    default:
      return false;
  }
}

function groupedRules(rules: readonly Rule[]): Map<Rule['type'], Rule[]> {
  const groups = new Map<Rule['type'], Rule[]>();
  for (const rule of rules) {
    const current = groups.get(rule.type) ?? [];
    current.push(rule);
    groups.set(rule.type, current);
  }
  return groups;
}

function assertSupportedRules(rules: Rules): void {
  const unsupported = [...(rules.avoid ?? []), ...(rules.focus ?? [])].find(
    ({ type }) =>
      type === 'code_path' || !['url_path', 'subdomain', 'domain', 'method', 'header', 'parameter'].includes(type),
  );
  if (unsupported) throw new Error(`code_path or unsupported scope rule ${unsupported.type} fails closed`);
}

function rulesAllow(request: ParsedHttpRequest, parsed: URL, rules: Rules): boolean {
  const avoid = rules.avoid ?? [];
  const focus = rules.focus ?? [];
  const hasParameterRule = [...avoid, ...focus].some(({ type }) => type === 'parameter');
  const inspectedParameters = hasParameterRule ? parameterNames(request, parsed) : undefined;
  if (inspectedParameters === null) return false;

  if (avoid.some((rule) => ruleMatches(rule, request, parsed, inspectedParameters))) return false;
  if (focus.length === 0) return true;
  for (const group of groupedRules(focus).values()) {
    if (!group.some((rule) => ruleMatches(rule, request, parsed, inspectedParameters))) return false;
  }
  return true;
}

/**
 * Return whether a parsed request is allowed by target origin and configured
 * scope. Avoid rules take precedence over focus rules; focus rules are ORed by
 * type and all configured focus types must match.
 */
export function requestMatchesScope(request: ParsedHttpRequest, targetOrigin: string, rules: Rules = {}): boolean {
  assertSupportedRules(rules);
  const parsed = sameOrigin(request, targetOrigin);
  if (!parsed) return false;
  return rulesAllow(request, parsed, rules);
}

/** Assert scope membership with a useful reason for the caller. */
export function assertRequestInScope(
  request: ParsedHttpRequest,
  targetOrigin: string,
  rules: Rules = {},
): NormalizedRequestTarget {
  assertSupportedRules(rules);
  const parsed = sameOrigin(request, targetOrigin);
  if (!parsed || !rulesAllow(request, parsed, rules)) {
    throw new Error('HTTP request is outside the configured target scope');
  }
  return { origin: parsed.origin, path: parsed.pathname, query: new URLSearchParams(parsed.searchParams) };
}

/** Normalize one request target and reject it unless it is on the configured origin. */
export function normalizeRequestTarget(request: ParsedHttpRequest, targetOrigin: string): NormalizedRequestTarget {
  const parsed = sameOrigin(request, targetOrigin);
  if (!parsed) throw new Error('HTTP request target is outside the configured origin');
  return { origin: parsed.origin, path: parsed.pathname, query: new URLSearchParams(parsed.searchParams) };
}
