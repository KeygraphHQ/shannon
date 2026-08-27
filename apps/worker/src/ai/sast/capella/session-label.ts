// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Display-only session labels for a Capella stage's concurrent sessions. */

import { normalizeSemanticLabel } from '../../../audit/safe-fields.js';

// Keep the base short enough that a ` #N` suffix still fits the identity validator's 48-char
// bound; a longer title falls back to `<fallback> N` rather than producing an unsafe label.
const MAX_SESSION_BASE_LENGTH = 40;

/**
 * Build a per-stage session labeler. It normalizes a free-text title to a safe display label and
 * disambiguates same-title siblings with `#2`/`#3`, exactly as the subagent namer does; a title
 * that cannot be normalized falls back to `<fallback> N`. Call it synchronously at dispatch, before
 * any await, so concurrent siblings never race on the ordinal. Labels are not stable across a
 * resume, which is acceptable for a human-facing log.
 */
export function createCapellaSessionNamer(fallback: string): (title: unknown) => string {
  const namedCounts = new Map<string, number>();
  let anonymousCount = 0;
  return (title) => {
    const base = normalizeSemanticLabel(title);
    if (base === undefined || base.length > MAX_SESSION_BASE_LENGTH) {
      anonymousCount += 1;
      return `${fallback} ${anonymousCount}`;
    }
    const nextOrdinal = (namedCounts.get(base) ?? 0) + 1;
    namedCounts.set(base, nextOrdinal);
    return nextOrdinal === 1 ? base : `${base} #${nextOrdinal}`;
  };
}
