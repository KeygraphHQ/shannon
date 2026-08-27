// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Retry split between the two layers that can restart work.
 *
 * `enabled: false` turns off pi's own agent-level retry loop — Temporal owns
 * agent restarts, and both retrying the same turn would compound. `provider`
 * settings are read independently of that flag, so transport faults
 * (408/409/429/5xx) are still absorbed inside the session, which is far cheaper
 * than a Temporal retry that re-runs the agent and respends its tokens.
 *
 * `maxRetries` is handed to the selected vendor's SDK, which owns the backoff, so
 * the schedule varies by provider rather than following one formula.
 *
 * NOTE: pi recommends keeping this at 0, since SDK-level retries consume
 * out-of-usage-limit responses before pi's classifier can mark them terminal.
 * Shannon accepts that trade for the transport-fault coverage. A two-minute
 * delay cap lets short server-directed recovery remain in the current session;
 * longer delays return to Temporal's bounded activity retry policy.
 */
export const PI_RETRY_SETTINGS = {
  enabled: false,
  provider: { maxRetries: 8, maxRetryDelayMs: 120_000 },
} as const;
