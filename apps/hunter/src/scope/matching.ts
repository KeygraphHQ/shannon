/**
 * Shared host/domain matching logic.
 *
 * Used by both `scope/validator.ts` (the strict, single-target safety gate)
 * and `recon/scope-tagging.ts` (bulk-classifying every discovered host
 * against the program, purely for world-model labeling — never itself an
 * authorization to test).
 */

import type { ScopeAsset, ScopeStatus } from '../types.js';

export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '');
}

/** Parses a strict dotted-quad IPv4 address into an unsigned 32-bit integer, or undefined for anything else (a hostname, IPv6, a malformed octet). Never resolves DNS — this is string parsing only. */
export function parseIPv4(ip: string): number | undefined {
  const parts = ip.split('.');
  if (parts.length !== 4) return undefined;
  let value = 0;
  for (const part of parts) {
    // Reject leading zeros ("01") and anything non-numeric — both are common sources of ambiguous/inconsistent IP parsing across tools.
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return undefined;
    const octet = Number(part);
    if (octet > 255) return undefined;
    value = (value << 8) | octet;
  }
  return value >>> 0;
}

export interface ParsedCidr {
  readonly network: number;
  readonly prefixLength: number;
}

/** Parses "a.b.c.d/n" (0 <= n <= 32) into a network address + prefix length, or undefined for anything malformed. */
export function parseCidr(cidr: string): ParsedCidr | undefined {
  const slashIndex = cidr.indexOf('/');
  if (slashIndex === -1) return undefined;
  const ipPart = cidr.slice(0, slashIndex);
  const prefixPart = cidr.slice(slashIndex + 1);
  const network = parseIPv4(ipPart);
  if (network === undefined) return undefined;
  if (!/^\d{1,2}$/.test(prefixPart)) return undefined;
  const prefixLength = Number(prefixPart);
  if (prefixLength < 0 || prefixLength > 32) return undefined;
  return { network, prefixLength };
}

function prefixMask(prefixLength: number): number {
  if (prefixLength === 0) return 0;
  return (0xffffffff << (32 - prefixLength)) >>> 0;
}

/**
 * True only when `host` is itself a well-formed IPv4 address that falls
 * within `cidr`'s range. Fail-closed on every ambiguous input: a hostname
 * (never DNS-resolved here), an IPv6 address, or a malformed CIDR/IP all
 * return false rather than guessing.
 */
export function cidrContains(cidr: string, host: string): boolean {
  const parsed = parseCidr(cidr);
  if (!parsed) return false;
  const hostIp = parseIPv4(host);
  if (hostIp === undefined) return false;
  const mask = prefixMask(parsed.prefixLength);
  return (hostIp & mask) === (parsed.network & mask);
}

export function domainMatches(asset: ScopeAsset, host: string): boolean {
  const identifier = normalizeHost(asset.identifier);
  if (asset.type === 'domain' || asset.type === 'ip') {
    return host === identifier;
  }
  if (asset.type === 'wildcard-domain') {
    const base = identifier.startsWith('*.') ? identifier.slice(2) : identifier;
    return host === base || host.endsWith(`.${base}`);
  }
  if (asset.type === 'cidr') {
    return cidrContains(identifier, host);
  }
  // 'url'/'repo' are asset types that are never themselves a bare host — deliberately not matched here.
  return false;
}

/**
 * Classifies a bare host against a program's assets. Out-of-scope always
 * wins over in-scope. Unlike `scope/validator.ts:validateTarget`, this does
 * not check authorization or a repo path — it is for labeling discovered
 * nodes, not for gating execution.
 */
export function classifyHostScope(assets: readonly ScopeAsset[], host: string): ScopeStatus {
  const normalizedHost = normalizeHost(host);
  const outOfScope = assets.filter((a) => a.instruction === 'out-of-scope');
  if (outOfScope.some((a) => domainMatches(a, normalizedHost))) {
    return 'out-of-scope';
  }
  const inScope = assets.filter((a) => a.instruction === 'in-scope');
  if (inScope.some((a) => domainMatches(a, normalizedHost))) {
    return 'in-scope';
  }
  return 'unknown';
}
