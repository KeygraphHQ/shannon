/**
 * Live behavioral recon.
 *
 * Performs real, controlled HTTP requests across explicitly-supplied auth
 * states (a header/cookie set per state — never credential guessing) and
 * diffs the responses using the same anomaly heuristics as the static
 * `behavioral.ts`. Every request/response pair becomes redaction-safe
 * evidence material (`recon/http-probe.ts` already strips nothing sensitive
 * from bodies, so callers must not pass real secrets in test headers).
 */

import type { Observation } from '../types.js';
import { type AuthState, compareAuthStates, type StateResponse } from './behavioral.js';
import { probeEndpoint } from './http-probe.js';

export type AuthStateHeaders = Partial<Record<AuthState, Readonly<Record<string, string>>>>;

export interface LiveBehavioralResult {
  readonly observations: readonly Observation[];
  readonly statesQueried: number;
}

/**
 * Issues one real GET per supplied auth state against `endpointUrl`,
 * capturing status and a body snippet, then reuses
 * `behavioral.ts:compareAuthStates` for anomaly detection so the heuristics
 * stay identical between the fixture-driven and live paths.
 */
export async function compareAuthStatesLive(
  engagementId: string,
  assetRef: string,
  endpointUrl: string,
  headersByState: AuthStateHeaders,
  timeoutMs = 10_000,
): Promise<LiveBehavioralResult> {
  const responses: Partial<Record<AuthState, StateResponse>> = {};
  let statesQueried = 0;

  for (const [state, headers] of Object.entries(headersByState) as [AuthState, Readonly<Record<string, string>>][]) {
    const probe = await probeEndpoint(endpointUrl, { headers, timeoutMs });
    responses[state] = { status: probe.statusCode, bodySnippet: probe.bodyExcerpt };
    statesQueried += 1;
  }

  const endpointPath = (() => {
    try {
      return new URL(endpointUrl).pathname;
    } catch {
      return endpointUrl;
    }
  })();

  const observations = compareAuthStates(engagementId, assetRef, endpointPath, responses);
  return { observations, statesQueried };
}
