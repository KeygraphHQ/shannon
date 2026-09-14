/**
 * ROE (rules of engagement) enforcement.
 *
 * `ProgramScope.disallowedTechniques` (types.ts) was, until this module,
 * validated on intake (`intake/hackerone.ts`) and never read again anywhere
 * in the pipeline — a program could declare "no active scanning" and the
 * adaptive loop would never notice. `isTechniqueAllowed` is the one function
 * that turns that declared list into an actual pre-execution decision, and
 * `pipeline/tool-bridge.ts`/`pipeline/shannon-action.ts` are the only two
 * call sites: every action, recon or Shannon, passes through here before an
 * adapter or the Shannon CLI ever runs.
 *
 * Matching is deliberately conservative (biased toward blocking) rather than
 * clever: a disallowed-technique string is compared against the action kind,
 * a short table of known aliases for that kind, and (when available) the
 * concrete tool name — by exact match first, then by substring containment
 * once both sides are long enough to make containment meaningful (>= 4
 * characters), so a short rule like `"js"` cannot accidentally swallow
 * unrelated candidates. A program that declares nothing is never blocked by
 * this check at all.
 */

import type { ActionKind, ProgramScope } from '../types.js';

export interface RoeCheckResult {
  readonly allowed: boolean;
  readonly reason: string;
  readonly matchedRule?: string;
}

const ACTION_KIND_ALIASES: Readonly<Record<ActionKind, readonly string[]>> = {
  'passive-recon': ['passive-recon', 'passive reconnaissance', 'passive', 'osint', 'subdomain enumeration'],
  'active-recon': [
    'active-recon',
    'active reconnaissance',
    'active scanning',
    'port scan',
    'port scanning',
    'scanning',
    'fuzzing',
    'brute force',
    'brute-force',
    'dos',
    'denial of service',
    'automated scanning',
  ],
  'js-intelligence': ['js-intelligence', 'javascript analysis', 'source map', 'client-side analysis'],
  'behavioral-diff': ['behavioral-diff', 'behavioral testing', 'authorization testing', 'idor testing'],
  shannon: ['shannon', 'source-aware scan', 'automated exploitation', 'exploitation', 'active exploitation'],
  'manual-review': ['manual-review', 'manual review', 'manual testing', 'source review'],
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function fuzzyMatches(candidate: string, rule: string): boolean {
  if (candidate === rule) return true;
  if (candidate.length < 4 || rule.length < 4) return false;
  return candidate.includes(rule) || rule.includes(candidate);
}

/**
 * Checks one prospective action (and, once a specific adapter has been
 * chosen, its tool name) against `program.disallowedTechniques`. Called
 * once per action kind (cheap, upfront) and, inside the per-adapter loop,
 * once more per candidate tool name — so a rule naming one specific tool
 * (e.g. `"ffuf"`) blocks only that adapter, letting the gate chain fall
 * through to the next preferred tool instead of blocking the whole action
 * kind.
 */
export function isTechniqueAllowed(program: ProgramScope, actionKind: ActionKind, toolName?: string): RoeCheckResult {
  const rules = program.disallowedTechniques.map(normalize).filter((r) => r.length > 0);
  if (rules.length === 0) {
    return { allowed: true, reason: 'program declares no disallowed techniques' };
  }

  const candidates = new Set<string>([normalize(actionKind), ...ACTION_KIND_ALIASES[actionKind].map(normalize)]);
  if (toolName) candidates.add(normalize(toolName));

  for (const rule of rules) {
    for (const candidate of candidates) {
      if (fuzzyMatches(candidate, rule)) {
        return {
          allowed: false,
          reason: `"${rule}" is a disallowed technique for program "${program.programId}" (matched against ${toolName ? `tool "${toolName}"` : `action kind "${actionKind}"`})`,
          matchedRule: rule,
        };
      }
    }
  }
  return { allowed: true, reason: 'no disallowed-technique rule matched' };
}
