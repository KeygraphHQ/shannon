/**
 * Reasoning provider selection + fallback routing.
 *
 * `createReasoningProvider` picks Claude when `ANTHROPIC_API_KEY` is
 * configured, else the heuristic provider outright — always pairing
 * whichever primary is chosen with the heuristic provider as fallback.
 * `selectNextBestActionWithFallback` is what the adaptive loop actually
 * calls each round: it tries the primary, and on *any* error (network,
 * non-2xx, schema validation) falls back to the heuristic provider and
 * reports why, rather than stalling the hunt on a model outage.
 */

import type { ActionProposal, ReasoningSource, WorldModelSnapshot } from '../types.js';
import { ClaudeReasoningProvider } from './claude-provider.js';
import { HeuristicReasoningProvider } from './heuristic-provider.js';
import type { ReasoningProvider } from './provider.js';

export interface ReasoningRouter {
  readonly primary: ReasoningProvider;
  readonly fallback: ReasoningProvider;
  readonly configuredSource: ReasoningSource;
}

export function createReasoningProvider(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ReasoningRouter {
  const fallback = new HeuristicReasoningProvider();
  const apiKey = env.ANTHROPIC_API_KEY;
  if (apiKey) {
    const primary = new ClaudeReasoningProvider({
      apiKey,
      ...(env.HUNTER_REASONING_MODEL !== undefined ? { model: env.HUNTER_REASONING_MODEL } : {}),
    });
    return { primary, fallback, configuredSource: 'claude' };
  }
  return { primary: fallback, fallback, configuredSource: 'heuristic' };
}

export interface ActionSelectionResult {
  readonly proposal: ActionProposal | undefined;
  readonly source: ReasoningSource;
  readonly fallbackReason: string | undefined;
}

export async function selectNextBestActionWithFallback(
  router: ReasoningRouter,
  snapshot: WorldModelSnapshot,
): Promise<ActionSelectionResult> {
  if (router.primary.source === router.fallback.source) {
    return {
      proposal: await router.primary.selectNextBestAction(snapshot),
      source: router.primary.source,
      fallbackReason: undefined,
    };
  }
  try {
    const proposal = await router.primary.selectNextBestAction(snapshot);
    return { proposal, source: router.primary.source, fallbackReason: undefined };
  } catch (error) {
    const proposal = await router.fallback.selectNextBestAction(snapshot);
    return { proposal, source: router.fallback.source, fallbackReason: (error as Error).message };
  }
}
