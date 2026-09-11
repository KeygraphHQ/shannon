/**
 * Deterministic scope/ROE validator.
 *
 * This is the safety gate that must run, and pass, before any active
 * execution against a target. It never contacts the target or any external
 * service — it only reasons over the program's declared scope (as loaded by
 * intake/hackerone.ts) and the target the operator supplied.
 */

import { err, ok, type ProgramScope, type Result, type ScopeAsset, type ValidatedTarget } from '../types.js';
import { domainMatches, normalizeHost } from './matching.js';

export interface ScopeValidationInput {
  readonly program: ProgramScope;
  readonly url: string;
  readonly repoPath: string;
}

function parseTargetUrl(url: string): URL | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function urlMatches(asset: ScopeAsset, url: string): boolean {
  if (asset.type !== 'url') {
    return false;
  }
  const identifier = asset.identifier.trim();
  return url === identifier || url.startsWith(identifier);
}

function assetMatchesTarget(asset: ScopeAsset, host: string, url: string): boolean {
  return domainMatches(asset, host) || urlMatches(asset, url);
}

function isLocalRepoPath(repoPath: string): boolean {
  const trimmed = repoPath.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return !trimmed.includes('://');
}

/**
 * Validate a single (url, repoPath) target against a program's declared
 * scope. Out-of-scope assets always take precedence over in-scope matches.
 */
export function validateTarget(input: ScopeValidationInput): Result<ValidatedTarget, string> {
  const { program, url, repoPath } = input;

  if (!program.authorizationConfirmed) {
    return err(`program "${program.programId}" does not have authorization confirmed; refusing to validate a target`);
  }

  if (!isLocalRepoPath(repoPath)) {
    return err(`repo path "${repoPath}" must be a local filesystem path, not a URL`);
  }

  const parsed = parseTargetUrl(url);
  if (!parsed) {
    return err(`"${url}" is not a valid http(s) URL`);
  }
  const host = normalizeHost(parsed.hostname);

  const outOfScope = program.assets.filter((asset) => asset.instruction === 'out-of-scope');
  const matchedOutOfScope = outOfScope.find((asset) => assetMatchesTarget(asset, host, url));
  if (matchedOutOfScope) {
    return err(`"${url}" matches out-of-scope asset "${matchedOutOfScope.identifier}"`);
  }

  const inScope = program.assets.filter((asset) => asset.instruction === 'in-scope');
  const matchedInScope = inScope.find((asset) => assetMatchesTarget(asset, host, url));
  if (!matchedInScope) {
    return err(`"${url}" does not match any in-scope asset declared by program "${program.programId}"`);
  }

  return ok({ url, repoPath, matchedAsset: matchedInScope });
}
