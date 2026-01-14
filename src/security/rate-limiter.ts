// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Production-grade rate limiting for API server
 * Uses sliding window algorithm with per-client tracking
 */

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  skipFailedRequests?: boolean; // Don't count failed requests
  keyGenerator?: (clientId: string) => string; // Custom key generation
}

interface WindowEntry {
  count: number;
  windowStart: number;
}

export class RateLimiter {
  private windows: Map<string, WindowEntry> = new Map();
  private config: RateLimitConfig;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = {
      windowMs: config.windowMs ?? 60_000, // 1 minute default
      maxRequests: config.maxRequests ?? 100, // 100 requests per minute default
      skipFailedRequests: config.skipFailedRequests ?? false,
      keyGenerator: config.keyGenerator ?? ((clientId) => clientId),
    };

    // Cleanup old entries periodically
    setInterval(() => this.cleanup(), this.config.windowMs);
  }

  /**
   * Check if a request should be allowed
   */
  isAllowed(clientId: string): { allowed: boolean; remaining: number; resetMs: number } {
    const key = this.config.keyGenerator!(clientId);
    const now = Date.now();
    const entry = this.windows.get(key);

    if (!entry || now - entry.windowStart >= this.config.windowMs) {
      // New window
      this.windows.set(key, { count: 1, windowStart: now });
      return {
        allowed: true,
        remaining: this.config.maxRequests - 1,
        resetMs: this.config.windowMs,
      };
    }

    if (entry.count >= this.config.maxRequests) {
      const resetMs = this.config.windowMs - (now - entry.windowStart);
      return {
        allowed: false,
        remaining: 0,
        resetMs,
      };
    }

    entry.count++;
    return {
      allowed: true,
      remaining: this.config.maxRequests - entry.count,
      resetMs: this.config.windowMs - (now - entry.windowStart),
    };
  }

  /**
   * Record a successful request (for skipFailedRequests mode)
   */
  recordSuccess(clientId: string): void {
    if (this.config.skipFailedRequests) {
      const key = this.config.keyGenerator!(clientId);
      const entry = this.windows.get(key);
      if (entry) {
        entry.count++;
      }
    }
  }

  /**
   * Reset rate limit for a client (admin function)
   */
  reset(clientId: string): void {
    const key = this.config.keyGenerator!(clientId);
    this.windows.delete(key);
  }

  /**
   * Get current status for a client
   */
  getStatus(clientId: string): { count: number; remaining: number; resetMs: number } | null {
    const key = this.config.keyGenerator!(clientId);
    const now = Date.now();
    const entry = this.windows.get(key);

    if (!entry) return null;

    if (now - entry.windowStart >= this.config.windowMs) {
      return null; // Window expired
    }

    return {
      count: entry.count,
      remaining: Math.max(0, this.config.maxRequests - entry.count),
      resetMs: this.config.windowMs - (now - entry.windowStart),
    };
  }

  /**
   * Cleanup expired windows
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.windows) {
      if (now - entry.windowStart >= this.config.windowMs * 2) {
        this.windows.delete(key);
      }
    }
  }

  /**
   * Get total number of tracked clients
   */
  get clientCount(): number {
    return this.windows.size;
  }
}

/**
 * Create rate limiter middleware config for API endpoints
 */
export const createApiRateLimiter = (): RateLimiter => {
  return new RateLimiter({
    windowMs: 60_000, // 1 minute
    maxRequests: 60, // 60 requests per minute (1 per second avg)
    skipFailedRequests: false,
  });
};

/**
 * Create rate limiter for scan endpoints (more restrictive)
 */
export const createScanRateLimiter = (): RateLimiter => {
  return new RateLimiter({
    windowMs: 300_000, // 5 minutes
    maxRequests: 10, // 10 scans per 5 minutes
    skipFailedRequests: true, // Don't count failed scans
  });
};

/**
 * Create rate limiter for webhook callbacks
 */
export const createWebhookRateLimiter = (): RateLimiter => {
  return new RateLimiter({
    windowMs: 60_000, // 1 minute
    maxRequests: 100, // 100 webhook calls per minute
    skipFailedRequests: false,
  });
};
