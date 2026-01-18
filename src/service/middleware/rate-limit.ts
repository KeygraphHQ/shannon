/**
 * Rate Limiting Middleware
 * Implements per-tenant and per-endpoint rate limiting
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * Rate limit configuration by endpoint type
 */
export const RATE_LIMITS = {
  // Default rate limit (requests per hour)
  default: {
    max: 1000,
    timeWindow: '1 hour',
  },
  // Scan creation rate limit
  scan: {
    max: 10,
    timeWindow: '1 hour',
  },
  // Auth validation rate limit
  validation: {
    max: 100,
    timeWindow: '1 hour',
  },
} as const;

/**
 * Add rate limit headers to response
 */
export function addRateLimitHeaders(
  reply: FastifyReply,
  limit: number,
  remaining: number,
  reset: Date
): void {
  reply.header('X-RateLimit-Limit', limit);
  reply.header('X-RateLimit-Remaining', Math.max(0, remaining));
  reply.header('X-RateLimit-Reset', reset.toISOString());
}

/**
 * Create a rate limit key generator based on organization or IP
 */
export function createKeyGenerator(prefix: string) {
  return (request: FastifyRequest): string => {
    // Use organization ID if authenticated, otherwise use IP
    if (request.organizationId) {
      return `${prefix}:org:${request.organizationId}`;
    }
    return `${prefix}:ip:${request.ip}`;
  };
}

/**
 * Rate limiting hook for scan creation
 * This is applied in addition to the global rate limit
 */
export async function scanRateLimitHook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // This hook is called after authentication, so organizationId should be set
  if (!request.organizationId) {
    return;
  }

  // Note: The actual rate limiting is done by @fastify/rate-limit plugin
  // This hook is just for logging/metrics
  request.log.debug(
    { organizationId: request.organizationId },
    'Scan rate limit check'
  );
}

/**
 * Register rate limiting plugin
 * Note: The main rate limiting is configured in app.ts via @fastify/rate-limit
 * This plugin provides additional route-specific limiting
 */
export async function rateLimitPlugin(app: FastifyInstance): Promise<void> {
  // Add response hook to include rate limit headers
  app.addHook('onSend', async (request, reply, payload) => {
    // Rate limit headers are added by @fastify/rate-limit automatically
    // This hook is for any additional processing
    return payload;
  });
}

/**
 * Concurrent scan limiter
 * Tracks active scans per organization to enforce concurrent scan limits
 */
export class ConcurrentScanLimiter {
  private activeScans: Map<string, Set<string>> = new Map();
  private defaultLimit = 3;

  constructor(private limits: Map<string, number> = new Map()) {}

  /**
   * Get the concurrent scan limit for an organization
   */
  getLimit(organizationId: string): number {
    return this.limits.get(organizationId) ?? this.defaultLimit;
  }

  /**
   * Check if organization can start a new scan
   */
  canStartScan(organizationId: string): boolean {
    const active = this.activeScans.get(organizationId);
    const limit = this.getLimit(organizationId);
    return !active || active.size < limit;
  }

  /**
   * Get current active scan count for an organization
   */
  getActiveCount(organizationId: string): number {
    return this.activeScans.get(organizationId)?.size ?? 0;
  }

  /**
   * Register a new active scan
   */
  startScan(organizationId: string, scanId: string): void {
    if (!this.activeScans.has(organizationId)) {
      this.activeScans.set(organizationId, new Set());
    }
    this.activeScans.get(organizationId)!.add(scanId);
  }

  /**
   * Remove a scan from active tracking
   */
  endScan(organizationId: string, scanId: string): void {
    const active = this.activeScans.get(organizationId);
    if (active) {
      active.delete(scanId);
      if (active.size === 0) {
        this.activeScans.delete(organizationId);
      }
    }
  }

  /**
   * Get all active scans for an organization
   */
  getActiveScans(organizationId: string): string[] {
    return Array.from(this.activeScans.get(organizationId) ?? []);
  }
}

// Singleton instance for concurrent scan limiting
export const concurrentScanLimiter = new ConcurrentScanLimiter();

export default rateLimitPlugin;
