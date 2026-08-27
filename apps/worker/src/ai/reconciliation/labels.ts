/**
 * Opaque, call-local labels used at reconciliation model boundaries.
 *
 * The model groups observations by these labels instead of by producer ID, so no internal producer
 * identity has to cross into the prompt. The alphabet is consonants only, which keeps labels short
 * and avoids accidentally spelling real words.
 */

export const LABEL_ALPHABET = 'bcdfghjkmnpqrstvwxz';
export const LABEL_LENGTH = 4;

export interface MintLabelsOptions {
  taken?: ReadonlySet<string>;
  rng?: () => number;
}

/** Mint distinct four-consonant labels disjoint from any supplied label space. */
export function mintLabels(count: number, options: MintLabelsOptions = {}): string[] {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`mintLabels: count must be a non-negative safe integer, received ${count}`);
  }

  // `taken` reserves label strings that must not be minted (for one class, the producer IDs
  // themselves), so a minted label can never collide with a value already meaningful to the caller.
  const used = new Set(options.taken);
  const capacity = LABEL_ALPHABET.length ** LABEL_LENGTH;
  if (count + used.size > capacity) {
    throw new Error(`mintLabels: cannot mint ${count} labels; alphabet space is ${capacity}`);
  }

  const rng = options.rng ?? Math.random;
  const labels: string[] = [];
  while (labels.length < count) {
    let label = '';
    for (let index = 0; index < LABEL_LENGTH; index++) {
      const sample = rng();
      if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
        throw new Error('mintLabels: rng must return a finite value in [0, 1)');
      }
      label += LABEL_ALPHABET[Math.floor(sample * LABEL_ALPHABET.length)];
    }
    if (used.has(label)) continue;
    used.add(label);
    labels.push(label);
  }
  return labels;
}
