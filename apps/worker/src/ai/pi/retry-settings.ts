// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * pi retries transport faults in-session (408/409/429/5xx, honouring
 * `retry-after`); Temporal owns agent restarts. Eight attempts backing off
 * `min(0.5 * 2^n, 8)`s absorb ~40s — cheap next to a Temporal retry, which
 * re-runs the agent and respends its tokens.
 */
export const PI_RETRY_SETTINGS = {
  enabled: false,
  provider: { maxRetries: 8 },
} as const;
