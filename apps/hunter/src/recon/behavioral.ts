/**
 * Behavioral recon.
 *
 * Understands the application by comparing how the same endpoint behaves
 * across authentication states (anonymous, authenticated-user,
 * resource-owner, different-user, privileged-user), never by assuming a
 * privilege level. A difference in behavior becomes a structured
 * observation — never a vulnerability claim by itself; that judgment is
 * left to hypothesis generation and, ultimately, validation.
 */

import type { Observation } from '../types.js';

export type AuthState = 'anonymous' | 'authenticated-user' | 'resource-owner' | 'different-user' | 'privileged-user';

export interface StateResponse {
  readonly status: number;
  readonly bodySnippet: string;
}

export type StateResponseMap = Partial<Record<AuthState, StateResponse>>;

const PRIVILEGE_ORDER: readonly AuthState[] = [
  'anonymous',
  'authenticated-user',
  'different-user',
  'resource-owner',
  'privileged-user',
];

function isSuccess(response: StateResponse): boolean {
  return response.status >= 200 && response.status < 300;
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `obs-behavioral-${counter}`;
}

/**
 * Compares one endpoint's responses across auth states. Two heuristics are
 * checked, each producing an observation requiring further validation:
 *
 * - a lower-privilege state (e.g. anonymous) got the same successful,
 *   near-identical response as a higher-privilege state that should be
 *   required — a candidate broken-access-control observation.
 * - "different-user" can see content that matches "resource-owner"'s
 *   response for what should be a user-scoped resource — a candidate IDOR
 *   observation.
 */
export function compareAuthStates(
  engagementId: string,
  assetRef: string,
  endpoint: string,
  responses: StateResponseMap,
): readonly Observation[] {
  const collectedAt = new Date().toISOString();
  const observations: Observation[] = [];

  const anonymous = responses.anonymous;
  const privileged = responses['privileged-user'];
  if (
    anonymous &&
    privileged &&
    isSuccess(anonymous) &&
    isSuccess(privileged) &&
    anonymous.bodySnippet === privileged.bodySnippet
  ) {
    observations.push({
      id: nextId(),
      engagementId,
      source: 'behavioral-diff',
      assetRef,
      vulnClass: 'authz',
      title: `"${endpoint}" returns identical content to anonymous and privileged-user requests`,
      description: `Anonymous request to ${endpoint} returned the same response (status ${anonymous.status}) as a privileged-user request. Candidate broken access control — requires reproduction with a second account.`,
      severityHint: 'high',
      confidenceHint: 'medium',
      verified: false,
      tags: ['behavioral-diff'],
      collectedAt,
    });
  }

  const differentUser = responses['different-user'];
  const resourceOwner = responses['resource-owner'];
  if (
    differentUser &&
    resourceOwner &&
    isSuccess(differentUser) &&
    isSuccess(resourceOwner) &&
    differentUser.bodySnippet === resourceOwner.bodySnippet
  ) {
    observations.push({
      id: nextId(),
      engagementId,
      source: 'behavioral-diff',
      assetRef,
      vulnClass: 'idor',
      title: `"${endpoint}" returns resource-owner content to a different authenticated user`,
      description: `A different-user session received the same response body as the resource owner from ${endpoint} (status ${differentUser.status}). Candidate IDOR — requires reproduction and confirmation the resource IDs actually differ.`,
      severityHint: 'high',
      confidenceHint: 'medium',
      verified: false,
      tags: ['behavioral-diff'],
      collectedAt,
    });
  }

  const observedStates = PRIVILEGE_ORDER.filter((state) => responses[state] !== undefined);
  if (observedStates.length >= 2) {
    const statuses = new Set(observedStates.map((state) => responses[state]?.status));
    if (statuses.size === 1) {
      observations.push({
        id: nextId(),
        engagementId,
        source: 'behavioral-diff',
        assetRef,
        vulnClass: 'behavioral-note',
        title: `"${endpoint}" behaves identically across all tested auth states`,
        description: `All tested auth states (${observedStates.join(', ')}) returned status ${[...statuses][0]}. Not necessarily a problem — flagged for completeness.`,
        severityHint: 'informational',
        confidenceHint: 'low',
        verified: false,
        tags: ['behavioral-diff'],
        collectedAt,
      });
    }
  }

  return observations;
}
