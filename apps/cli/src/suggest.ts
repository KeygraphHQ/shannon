/**
 * "Did you mean?" suggestions for mistyped commands and flags.
 *
 * A single Levenshtein-based matcher powers both the unknown-command path in the
 * dispatcher and the unknown-option path in `parseArgs`, so a typo like `statsu`
 * or `--workspce` points the user at the closest real name instead of just failing.
 */

/** Levenshtein edit distance between two strings (insertions, deletions, substitutions). */
export function editDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Rolling single row; `diagonal` and `above` carry the two neighbours a full grid would.
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);

  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0] as number;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j] as number;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(above + 1, (row[j - 1] as number) + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return row[b.length] as number;
}

/**
 * The candidate closest to `input`, or undefined if none is near enough.
 *
 * A prefix match ("stat" -> "status") wins first; otherwise the lowest edit
 * distance within a length-scaled threshold, so unrelated words don't match.
 */
export function closestMatch(input: string, candidates: readonly string[]): string | undefined {
  if (input.length >= 2) {
    const prefix = candidates.find((candidate) => candidate.startsWith(input));
    if (prefix) return prefix;
  }

  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (candidate.length <= 3) continue;

    const distance = editDistance(input, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  if (best === undefined) return undefined;

  const threshold = Math.max(2, Math.floor(best.length / 3));
  return bestDistance <= threshold ? best : undefined;
}
