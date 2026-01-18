/**
 * Cleanup Job
 *
 * Periodically cleans up orphaned containers and resources.
 * Runs on a schedule to ensure no zombie containers persist.
 *
 * @module container/cleanup-job
 */

import { ContainerManager } from './container-manager.js';
import type { CleanupResult } from './types.js';

/**
 * Cleanup Job class
 *
 * Detects and terminates orphaned containers that lost their workflow heartbeat
 */
export class CleanupJob {
  private readonly containerManager: ContainerManager;
  private readonly orphanThresholdMinutes: number;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(options?: { orphanThresholdMinutes?: number }) {
    this.containerManager = new ContainerManager();
    this.orphanThresholdMinutes = options?.orphanThresholdMinutes ?? 5;
  }

  /**
   * Start the cleanup job on a schedule
   * Placeholder - will be implemented in Phase 6 (US4)
   */
  start(_intervalMinutes: number = 5): void {
    // TODO: Implement in Phase 6
    console.log('CleanupJob.start() - Not implemented (Phase 6 US4)');
  }

  /**
   * Stop the cleanup job
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Run cleanup once
   * Placeholder - will be implemented in Phase 6 (US4)
   */
  async runOnce(): Promise<CleanupResult> {
    // TODO: Implement in Phase 6
    return {
      orphanedCount: 0,
      terminatedCount: 0,
      failedCount: 0,
      errors: [],
    };
  }

  /**
   * Find orphaned containers
   * Placeholder - will be implemented in Phase 6 (US4)
   */
  async findOrphaned(): Promise<string[]> {
    // TODO: Implement in Phase 6
    return [];
  }
}
