/**
 * Security utilities for rate limiting, lockout, and protection mechanisms.
 */

// In-memory store for failed attempts (in production, use Redis)
// Key format: "2fa:{userId}" -> { count: number, lockedUntil: Date | null }
const failedAttempts = new Map<string, { count: number; lockedUntil: Date | null; attempts: Date[] }>();

const MAX_2FA_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const ATTEMPT_WINDOW_MS = 60 * 60 * 1000; // 1 hour sliding window

/**
 * Check if a user is locked out from 2FA attempts.
 */
export function isLockedOut(userId: string): { locked: boolean; remainingMs: number } {
  const key = `2fa:${userId}`;
  const record = failedAttempts.get(key);

  if (!record || !record.lockedUntil) {
    return { locked: false, remainingMs: 0 };
  }

  const now = new Date();
  if (record.lockedUntil > now) {
    return {
      locked: true,
      remainingMs: record.lockedUntil.getTime() - now.getTime(),
    };
  }

  // Lockout expired, reset
  failedAttempts.delete(key);
  return { locked: false, remainingMs: 0 };
}

/**
 * Record a failed 2FA attempt.
 * Returns true if the user is now locked out.
 */
export function recordFailedAttempt(userId: string): {
  locked: boolean;
  attemptsRemaining: number;
  lockedUntil: Date | null;
} {
  const key = `2fa:${userId}`;
  const now = new Date();
  let record = failedAttempts.get(key);

  if (!record) {
    record = { count: 0, lockedUntil: null, attempts: [] };
  }

  // Filter out attempts older than the window
  const windowStart = new Date(now.getTime() - ATTEMPT_WINDOW_MS);
  record.attempts = record.attempts.filter((a) => a > windowStart);

  // Add new attempt
  record.attempts.push(now);
  record.count = record.attempts.length;

  if (record.count >= MAX_2FA_ATTEMPTS) {
    // Lock the account
    record.lockedUntil = new Date(now.getTime() + LOCKOUT_DURATION_MS);
    failedAttempts.set(key, record);

    return {
      locked: true,
      attemptsRemaining: 0,
      lockedUntil: record.lockedUntil,
    };
  }

  failedAttempts.set(key, record);

  return {
    locked: false,
    attemptsRemaining: MAX_2FA_ATTEMPTS - record.count,
    lockedUntil: null,
  };
}

/**
 * Clear failed attempts after successful authentication.
 */
export function clearFailedAttempts(userId: string): void {
  const key = `2fa:${userId}`;
  failedAttempts.delete(key);
}

/**
 * Get the current lockout status for display purposes.
 */
export function getLockoutStatus(userId: string): {
  failedAttempts: number;
  maxAttempts: number;
  locked: boolean;
  lockedUntil: Date | null;
  remainingMinutes: number;
} {
  const key = `2fa:${userId}`;
  const record = failedAttempts.get(key);
  const lockoutCheck = isLockedOut(userId);

  if (!record) {
    return {
      failedAttempts: 0,
      maxAttempts: MAX_2FA_ATTEMPTS,
      locked: false,
      lockedUntil: null,
      remainingMinutes: 0,
    };
  }

  return {
    failedAttempts: record.count,
    maxAttempts: MAX_2FA_ATTEMPTS,
    locked: lockoutCheck.locked,
    lockedUntil: record.lockedUntil,
    remainingMinutes: Math.ceil(lockoutCheck.remainingMs / 60000),
  };
}

/**
 * Rate limiting for sensitive operations.
 * Uses a simple in-memory store (use Redis in production).
 */
const rateLimitStore = new Map<string, { count: number; resetAt: Date }>();

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetAt: Date } {
  const now = new Date();
  let record = rateLimitStore.get(key);

  // Clean up expired records
  if (record && record.resetAt < now) {
    record = undefined;
    rateLimitStore.delete(key);
  }

  if (!record) {
    const resetAt = new Date(now.getTime() + config.windowMs);
    rateLimitStore.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt,
    };
  }

  if (record.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: record.resetAt,
    };
  }

  record.count++;
  rateLimitStore.set(key, record);

  return {
    allowed: true,
    remaining: config.maxRequests - record.count,
    resetAt: record.resetAt,
  };
}

/**
 * Common rate limit configurations.
 */
export const RATE_LIMITS = {
  // 5 login attempts per 15 minutes
  LOGIN: { maxRequests: 5, windowMs: 15 * 60 * 1000 },
  // 3 password reset requests per hour
  PASSWORD_RESET: { maxRequests: 3, windowMs: 60 * 60 * 1000 },
  // 10 API calls per minute
  API: { maxRequests: 10, windowMs: 60 * 1000 },
  // 5 invitation sends per hour
  INVITATION: { maxRequests: 5, windowMs: 60 * 60 * 1000 },
} as const;

/**
 * Validate TOTP code format.
 */
export function isValidTOTPFormat(code: string): boolean {
  // TOTP codes are 6 digits
  return /^\d{6}$/.test(code);
}

/**
 * Validate backup/recovery code format.
 */
export function isValidBackupCodeFormat(code: string): boolean {
  // Backup codes are typically alphanumeric, various lengths
  // Clerk uses lowercase alphanumeric codes
  return /^[a-z0-9]{8,}$/i.test(code.replace(/-/g, ""));
}
