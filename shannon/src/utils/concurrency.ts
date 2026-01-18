// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Concurrency Control Utilities
 *
 * Provides mutex implementation for preventing race conditions during
 * concurrent session operations.
 */

type UnlockFunction = () => void;

/**
 * SessionMutex - Promise-based mutex for session file operations
 *
 * Prevents race conditions when multiple agents or operations attempt to
 * modify the same session data simultaneously. This is particularly important
 * during parallel execution of vulnerability analysis and exploitation phases.
 *
 * Usage:
 * ```ts
 * const mutex = new SessionMutex();
 * const unlock = await mutex.lock(sessionId);
 * try {
 *   // Critical section - modify session data
 * } finally {
 *   unlock(); // Always release the lock
 * }
 * ```
 */
// Promise-based mutex with queue semantics - safe for parallel agents on same session
export class SessionMutex {
  // Map of sessionId -> Promise (represents active lock)
  private locks: Map<string, Promise<void>> = new Map();

  // Wait for existing lock, then acquire. Queue ensures FIFO ordering.
  async lock(sessionId: string): Promise<UnlockFunction> {
    if (this.locks.has(sessionId)) {
      // Wait for existing lock to be released
      await this.locks.get(sessionId);
    }

    // Create new lock promise
    let resolve: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    this.locks.set(sessionId, promise);

    // Return unlock function
    return () => {
      this.locks.delete(sessionId);
      resolve!();
    };
  }
}
