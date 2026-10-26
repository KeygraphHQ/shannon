/**
 * PHP version table for php2shell, and the version-string to verdict logic.
 *
 * Pure module, no I/O. Encodes the fixed releases from the php2shell advisory (CVE-2026-109618,
 * CVE-2026-109619) and derives a per-version verdict, so the probe and its output share one source of
 * truth for the fixed-version boundaries.
 */

import type { Php2shellVersionVerdict } from './types.js';

/** Both php2shell CVEs. */
export const PHP2SHELL_CVES: readonly string[] = Object.freeze(['CVE-2026-109618', 'CVE-2026-109619']);

/** The lowest PHP version that introduced the flaw. Anything below this predates it entirely. */
export const INTRODUCED_IN: readonly [number, number, number] = Object.freeze([5, 4, 0]);

/** A supported branch and the first patched release on it. */
export interface PatchedBranch {
  readonly branch: string;
  readonly firstFixed: string;
}

/** Supported branches and their first fixed release. A branch not listed here is EOL or out of range. */
export const PATCHED_BRANCHES: readonly PatchedBranch[] = Object.freeze([
  { branch: '8.5', firstFixed: '8.5.12' },
  { branch: '8.4', firstFixed: '8.4.27' },
  { branch: '8.3', firstFixed: '8.3.36' },
  { branch: '8.2', firstFixed: '8.2.35' },
]);

/** EOL branches that received source-only backports. Treated as affected unless a backport is proven. */
export const EOL_BACKPORT_BRANCHES: readonly string[] = Object.freeze(['8.1', '8.0', '7.4']);

export interface VersionAssessment {
  readonly verdict: Php2shellVersionVerdict;
  readonly reason: string;
  readonly recommendedVersion?: string;
  readonly backportCaveat: boolean;
}

type Version = readonly [number, number, number];

/** Parse a leading `X.Y.Z` or `X.Y` from a raw string, ignoring any suffix. Missing patch is 0. */
function parseVersion(raw: string): Version | null {
  const match = raw.trim().match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (match === null) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = match[3] === undefined ? 0 : Number(match[3]);
  return [major, minor, patch];
}

/** Numeric (not lexical) comparison: negative when a < b, 0 when equal, positive when a > b. */
function compareVersions(a: Version, b: Version): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
}

/** Compare two branch tuples `[major, minor]`. */
function compareBranches(a: readonly [number, number], b: readonly [number, number]): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  return a[1] - b[1];
}

function newestPatchedBranch(): readonly [number, number] {
  let newest: readonly [number, number] = [0, 0];
  for (const entry of PATCHED_BRANCHES) {
    const parsed = parseVersion(entry.branch);
    if (parsed === null) continue;
    const candidate: readonly [number, number] = [parsed[0], parsed[1]];
    if (compareBranches(candidate, newest) > 0) newest = candidate;
  }
  return newest;
}

/**
 * Assess a raw PHP version string against the php2shell advisory.
 *
 * A missing or unparseable version is `unknown`, never `not_affected`. An upstream string below its
 * branch's first fixed release is `affected` with `backportCaveat` set, because a distro backport can
 * carry the fix under the old number.
 */
export function assessPhpVersion(raw: string): VersionAssessment {
  const version = parseVersion(raw);
  const completeVersion = /^\d+\.\d+\.\d+(?:[-+][0-9a-z][0-9a-z.+~_-]*)?$/i.test(raw.trim());
  const prerelease = /^\d+\.\d+\.\d+[-.]?(?:(?:dev|alpha|beta|rc|pre|preview)(?:\d|[.+-]|$)|[ab]\d)/i.test(raw.trim());
  if (version === null || !completeVersion || prerelease || !version.every(Number.isSafeInteger)) {
    return {
      verdict: 'unknown',
      reason: `"${raw}" is not a complete stable PHP version. Treat as unknown and verify the runtime version.`,
      backportCaveat: false,
    };
  }

  if (compareVersions(version, INTRODUCED_IN) < 0) {
    return {
      verdict: 'not_affected',
      reason: `PHP ${version.join('.')} predates the introduction of the flaw in 5.4.0.`,
      backportCaveat: false,
    };
  }

  const branch = `${version[0]}.${version[1]}`;

  const patched = PATCHED_BRANCHES.find((entry) => entry.branch === branch);
  if (patched !== undefined) {
    const fixed = parseVersion(patched.firstFixed);
    const atOrAboveFixed = fixed !== null && compareVersions(version, fixed) >= 0;
    if (atOrAboveFixed) {
      return {
        verdict: 'not_affected',
        reason: `PHP ${version.join('.')} is at or above the first fixed release ${patched.firstFixed} on branch ${branch}.`,
        recommendedVersion: patched.firstFixed,
        backportCaveat: false,
      };
    }
    return {
      verdict: 'affected',
      reason: `PHP ${version.join('.')} is below the first fixed release ${patched.firstFixed} on branch ${branch}. A distro may have backported the fix while keeping the old number, so this upstream string cannot by itself confirm exposure.`,
      recommendedVersion: patched.firstFixed,
      backportCaveat: true,
    };
  }

  if (EOL_BACKPORT_BRANCHES.includes(branch)) {
    return {
      verdict: 'affected',
      reason: `Branch ${branch} is end-of-life and received only a source-only backport. Upgrade to a supported branch or apply the vendor source backport.`,
      backportCaveat: true,
    };
  }

  if (compareBranches([version[0], version[1]], newestPatchedBranch()) > 0) {
    return {
      verdict: 'unknown',
      reason: `Branch ${branch} is newer than the advisory table. Verify its patch status against the primary advisory.`,
      backportCaveat: false,
    };
  }

  return {
    verdict: 'affected',
    reason: `Branch ${branch} is in the affected range (5.4.0 and later) and has no upstream fix. Upgrade to a supported, patched branch.`,
    backportCaveat: true,
  };
}
