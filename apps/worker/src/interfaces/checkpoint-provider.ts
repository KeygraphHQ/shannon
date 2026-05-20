/**
 * CheckpointProvider — injectable interface for external state persistence.
 *
 * Called before and after each agent to support skip-guard (resume) and
 * post-agent artifact persistence. During the concurrent vulnerability-exploitation
 * phase, 5 pipelines run in parallel — methods fire per-agent for granular control.
 *
 * Default: no-op (skip nothing, persist nothing).
 */

import type { AgentMetrics, PipelineState } from '../temporal/shared.js';

/** Result of a pre-agent skip check. */
export interface SkipDecision {
  readonly skip: boolean;
  readonly metrics?: AgentMetrics; // Required when skip=true
}

/** File-system context passed after agent completion for artifact persistence. */
export interface CheckpointContext {
  readonly repoPath: string;
  readonly sessionId: string;
  readonly deliverablesSubdir: string;
  readonly outputPath?: string;
}

export interface CheckpointProvider {
  /**
   * Called before an agent activity executes.
   * Return { skip: true, metrics } to skip the agent (e.g., output files already exist).
   * Return { skip: false } to run normally.
   */
  shouldSkipAgent(agentName: string, repoPath: string, deliverablesSubdir: string): Promise<SkipDecision>;

  /**
   * Called after an agent activity succeeds.
   * Receives pipeline state and optional file context for artifact persistence.
   */
  onAgentComplete(agentName: string, phase: string, state: PipelineState, context?: CheckpointContext): Promise<void>;
}

/** Default no-op implementation — no external checkpointing. */
export class NoOpCheckpointProvider implements CheckpointProvider {
  async shouldSkipAgent(): Promise<SkipDecision> {
    return { skip: false };
  }

  async onAgentComplete(): Promise<void> {
    // No-op
  }
}
