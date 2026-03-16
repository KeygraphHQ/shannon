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
// Promise-based mutex with chained queue semantics - safe for parallel agents on same session
export class SessionMutex {
  // Map of sessionId -> Promise (tail of the FIFO queue)
  private locks: Map<string, Promise<void>> = new Map();

  // Chain onto the queue tail, then wait for predecessor to release. Guarantees FIFO ordering.
  async lock(sessionId: string): Promise<UnlockFunction> {
    // 1. Capture the current tail of the queue
    const prev = this.locks.get(sessionId) ?? Promise.resolve();

    // 2. Create our lock and immediately become the new tail
    let resolve: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    this.locks.set(sessionId, promise);

    // 3. Wait for predecessor to release
    await prev;

    // 4. Return unlock that releases the next waiter in the chain
    return () => {
      if (this.locks.get(sessionId) === promise) {
        this.locks.delete(sessionId);
      }
      resolve();
    };
  }
}
