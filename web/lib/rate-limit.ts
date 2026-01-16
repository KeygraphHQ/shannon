/**
 * Rate Limiting - Simple in-memory rate limiter
 *
 * For production, consider using Redis-based rate limiting
 * or a service like Upstash.
 *
 * Usage:
 *   import { rateLimit } from '@/lib/rate-limit';
 *
 *   const limiter = rateLimit({ interval: 60000, limit: 10 });
 *   const { success, remaining, reset } = await limiter.check(identifier);
 */

import { logger } from "@/lib/logger";

interface RateLimitConfig {
  /** Time window in milliseconds */
  interval: number;
  /** Maximum requests per interval */
  limit: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
  limit: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store (use Redis in production)
const store = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
const CLEANUP_INTERVAL = 60000; // 1 minute
let cleanupTimeout: NodeJS.Timeout | null = null;

function scheduleCleanup() {
  if (cleanupTimeout) return;

  cleanupTimeout = setTimeout(() => {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of store.entries()) {
      if (entry.resetAt <= now) {
        store.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug("Rate limit cleanup", { entriesRemoved: cleaned });
    }

    cleanupTimeout = null;
    if (store.size > 0) {
      scheduleCleanup();
    }
  }, CLEANUP_INTERVAL);
}

export function rateLimit(config: RateLimitConfig) {
  const { interval, limit } = config;

  return {
    /**
     * Check if request is allowed
     * @param identifier - Unique identifier (e.g., IP, user ID, API key)
     */
    async check(identifier: string): Promise<RateLimitResult> {
      const now = Date.now();
      const key = identifier;

      let entry = store.get(key);

      // Create new entry or reset if expired
      if (!entry || entry.resetAt <= now) {
        entry = {
          count: 0,
          resetAt: now + interval,
        };
        store.set(key, entry);
        scheduleCleanup();
      }

      // Check if limit exceeded
      if (entry.count >= limit) {
        logger.warn("Rate limit exceeded", { identifier, limit, interval });
        return {
          success: false,
          remaining: 0,
          reset: entry.resetAt,
          limit,
        };
      }

      // Increment counter
      entry.count++;

      return {
        success: true,
        remaining: Math.max(0, limit - entry.count),
        reset: entry.resetAt,
        limit,
      };
    },

    /**
     * Reset rate limit for an identifier
     */
    async reset(identifier: string): Promise<void> {
      store.delete(identifier);
    },

    /**
     * Get current status without incrementing
     */
    async status(identifier: string): Promise<RateLimitResult | null> {
      const now = Date.now();
      const entry = store.get(identifier);

      if (!entry || entry.resetAt <= now) {
        return null;
      }

      return {
        success: entry.count < limit,
        remaining: Math.max(0, limit - entry.count),
        reset: entry.resetAt,
        limit,
      };
    },
  };
}

// Pre-configured rate limiters for common use cases
export const rateLimiters = {
  /**
   * Strict limiter for authentication endpoints
   * 5 requests per minute
   */
  auth: rateLimit({ interval: 60000, limit: 5 }),

  /**
   * Standard limiter for API endpoints
   * 60 requests per minute
   */
  api: rateLimit({ interval: 60000, limit: 60 }),

  /**
   * Relaxed limiter for general pages
   * 120 requests per minute
   */
  general: rateLimit({ interval: 60000, limit: 120 }),

  /**
   * Very strict limiter for sensitive operations
   * 3 requests per 5 minutes
   */
  sensitive: rateLimit({ interval: 300000, limit: 3 }),
};

/**
 * Get client IP from request headers
 */
export function getClientIp(headers: Headers): string {
  // Check common proxy headers
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return forwarded.split(",")[0].trim();
  }

  const realIp = headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Fallback to a generic identifier
  return "unknown";
}

/**
 * Create rate limit response headers
 */
export function createRateLimitHeaders(result: RateLimitResult): HeadersInit {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.reset / 1000)),
  };
}
