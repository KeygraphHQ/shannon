/**
 * FindingsProvider — injectable interface for external findings integration.
 *
 * Allows external security data from consumer-supplied sources to be merged
 * into the exploitation pipeline between vulnerability analysis and exploitation.
 *
 * Default: no-op returning { mergedCount: 0 }.
 */

import type { ActivityInput } from '../temporal/activities.js';
import type { VulnType } from '../types/agents.js';

export interface FindingsProvider {
  mergeFindingsIntoQueue(repoPath: string, vulnType: VulnType, input: ActivityInput): Promise<{ mergedCount: number }>;
}

/** Default no-op implementation — no external findings to merge. */
export class NoOpFindingsProvider implements FindingsProvider {
  async mergeFindingsIntoQueue(): Promise<{ mergedCount: number }> {
    return { mergedCount: 0 };
  }
}
