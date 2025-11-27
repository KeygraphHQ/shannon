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

/**
 * SessionMutex - Promise-based mutex for session file operations
 *
 * Prevents race conditions when multiple agents or operations attempt to
 * modify the same session data simultaneously. This is particularly important
 * during parallel execution of vulnerability analysis and exploitation phases.
 *
 * Usage:
 * ```js
 * const mutex = new SessionMutex();
 * const unlock = await mutex.lock(sessionId);
 * try {
 *   // Critical section - modify session data
 * } finally {
 *   unlock(); // Always release the lock
 * }
 * ```
 */
export class SessionMutex {
  constructor() {
    // Map of sessionId -> Promise (represents active lock)
    this.locks = new Map();
  }

  /**
   * Acquire lock for a session
   * @param {string} sessionId - Session ID to lock
   * @returns {Promise<Function>} Unlock function to release the lock
   */
  async lock(sessionId) {
    if (this.locks.has(sessionId)) {
      // Wait for existing lock to be released
      await this.locks.get(sessionId);
    }

    // Create new lock promise
    let resolve;
    const promise = new Promise(r => resolve = r);
    this.locks.set(sessionId, promise);

    // Return unlock function
    return () => {
      this.locks.delete(sessionId);
      resolve();
    };
  }
}
