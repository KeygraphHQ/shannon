/**
 * CheckpointProvider — injectable interface for external state persistence.
 *
 * Called after each agent completes to allow external progress tracking.
 * During the concurrent vulnerability-exploitation phase, 5 pipelines run
 * in parallel — onAgentComplete fires per-agent for granular progress.
 *
 * Default: no-op.
 */

import type { PipelineState } from '../temporal/shared.js';

export interface CheckpointProvider {
  onAgentComplete(
    agentName: string,
    phase: string,
    state: PipelineState,
  ): Promise<void>;
}

/** Default no-op implementation — no external checkpointing. */
export class NoOpCheckpointProvider implements CheckpointProvider {
  async onAgentComplete(): Promise<void> {
    // No-op
  }
}
