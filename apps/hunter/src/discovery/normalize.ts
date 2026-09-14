/**
 * HackerOne-shaped discovery data -> Hunter's `ProgramScope`.
 *
 * The one conversion point between "a candidate program the discovery layer
 * found" and "a program the rest of Hunter (scope validator, tool bridge,
 * adaptive loop) will actually treat as an engagement target." It never
 * hand-builds a `ProgramScope` object directly — every normalized program is
 * round-tripped through `intake/hackerone.ts:parseProgramScope`, the exact
 * same validator `LocalFileIntake` uses, so a normalized program can never
 * be structurally different from (or less strictly checked than) one an
 * operator hand-authored.
 *
 * Two things this module refuses to do, on purpose:
 *  - An asset whose `instruction` is `'unclear'`, or whose `type` is
 *    `'unsupported'`, is dropped, never guessed into `'in-scope'`/a fallback
 *    type — "unknown scope must never silently become in-scope" holds here
 *    exactly as it does in `recon/scope-tagging.ts`.
 *  - `authorizationConfirmed` is always written as `false`. Discovery and
 *    ranking never imply authorization; only `orchestration/lifecycle.ts`,
 *    acting on an explicit, human-supplied `AuthorizationRecord`, is allowed
 *    to flip it to `true` — and it does so on the already-normalized file,
 *    not in here.
 */

import { parseProgramScope } from '../intake/hackerone.js';
import type { ProgramScope, Result } from '../types.js';
import type { DiscoveredProgram } from './types.js';

export interface NormalizeResult {
  readonly scope: ProgramScope;
  readonly droppedAssets: readonly string[];
}

export function normalizeDiscoveredProgram(program: DiscoveredProgram): Result<NormalizeResult, string> {
  const droppedAssets: string[] = [];
  const assets = program.assets
    .filter((asset) => {
      const keep = asset.instruction !== 'unclear' && asset.type !== 'unsupported';
      if (!keep) {
        droppedAssets.push(
          `"${asset.identifier}" dropped (${asset.instruction === 'unclear' ? 'unclear instruction' : 'unsupported type'}) — never defaulted to in-scope`,
        );
      }
      return keep;
    })
    .map((asset) => ({
      identifier: asset.identifier,
      type: asset.type,
      instruction: asset.instruction,
      ...(asset.tier !== undefined ? { tier: asset.tier } : {}),
      ...(asset.bountyEligible !== undefined ? { bountyEligible: asset.bountyEligible } : {}),
      ...(asset.requiresAuthentication !== undefined ? { requiresAuthentication: asset.requiresAuthentication } : {}),
    }));

  const raw = {
    programId: program.programId,
    programName: program.programName,
    platform: program.platform,
    authorizationConfirmed: false,
    assets,
    rulesOfEngagement: program.rulesOfEngagement,
    disallowedTechniques: program.disallowedTechniques,
    ...(program.rateLimitPerMinute !== undefined ? { rateLimitPerMinute: program.rateLimitPerMinute } : {}),
  };

  const parsed = parseProgramScope(raw);
  if (!parsed.ok) {
    return { ok: false, error: `normalized program "${program.programId}" failed scope validation: ${parsed.error}` };
  }
  return { ok: true, value: { scope: parsed.value, droppedAssets } };
}

/**
 * Picks one concrete `https://…` URL to hand `runAdaptiveHunt`/`validateTarget`
 * as the engagement's primary target — preferring an explicit `url` asset
 * (used verbatim) and otherwise synthesizing one from the first in-scope
 * `domain`/`wildcard-domain` asset. Returns `undefined` rather than
 * guessing when neither exists (e.g. a program scoped only to a mobile app
 * or a bare repo), which callers must treat as "this program has no
 * web target Hunter's scope validator can accept."
 */
export function deriveTargetUrl(scope: ProgramScope): string | undefined {
  const urlAsset = scope.assets.find((a) => a.instruction === 'in-scope' && a.type === 'url');
  if (urlAsset) return urlAsset.identifier;

  const domainAsset = scope.assets.find(
    (a) => a.instruction === 'in-scope' && (a.type === 'domain' || a.type === 'wildcard-domain'),
  );
  if (!domainAsset) return undefined;
  const host = domainAsset.identifier.startsWith('*.') ? domainAsset.identifier.slice(2) : domainAsset.identifier;
  return `https://${host}`;
}
