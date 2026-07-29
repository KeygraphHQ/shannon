// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Shared rendering of queue code locations, so both deliverable kinds read the same. */

import type { QueueCodeLocation } from '../ai/queue-schemas.js';

/** Machine-shaped so the report agent maps rather than parses. Returns null when there are none. */
export function formatCodeLocations(locations: readonly QueueCodeLocation[] | undefined): string | null {
  if (!locations || locations.length === 0) return null;
  const sinkFirst = [...locations].sort((a, b) => Number(b.role === 'sink') - Number(a.role === 'sink'));
  const rendered = sinkFirst.map((location) => {
    const span = location.start_line
      ? `:${location.start_line}${location.end_line ? `-${location.end_line}` : ''}`
      : '';
    const detail = location.symbol ? `${location.role}, ${location.symbol}` : location.role;
    return `  - ${location.file}${span} (${detail})`;
  });
  return ['**Code locations:**', ...rendered].join('\n');
}
