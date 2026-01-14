// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  RateLimiter,
  createApiRateLimiter,
  createScanRateLimiter,
  createWebhookRateLimiter,
} from '../rate-limiter.js';

describe('Rate Limiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('RateLimiter', () => {
    it('should allow requests within limit', () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 10,
      });

      for (let i = 0; i < 10; i++) {
        const result = limiter.isAllowed('client1');
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(9 - i);
      }
    });

    it('should block requests over limit', () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 5,
      });

      // Use up all requests
      for (let i = 0; i < 5; i++) {
        limiter.isAllowed('client1');
      }

      // Next request should be blocked
      const result = limiter.isAllowed('client1');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should reset after window expires', () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 5,
      });

      // Use up all requests
      for (let i = 0; i < 5; i++) {
        limiter.isAllowed('client1');
      }

      // Should be blocked
      expect(limiter.isAllowed('client1').allowed).toBe(false);

      // Advance time past window
      vi.advanceTimersByTime(61000);

      // Should be allowed again
      const result = limiter.isAllowed('client1');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it('should track clients separately', () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 2,
      });

      // Client 1 uses up requests
      limiter.isAllowed('client1');
      limiter.isAllowed('client1');
      expect(limiter.isAllowed('client1').allowed).toBe(false);

      // Client 2 should still be allowed
      expect(limiter.isAllowed('client2').allowed).toBe(true);
    });

    it('should provide correct reset time', () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 5,
      });

      const result = limiter.isAllowed('client1');
      expect(result.resetMs).toBe(60000);
    });

    it('should allow resetting a client', () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 1,
      });

      limiter.isAllowed('client1');
      expect(limiter.isAllowed('client1').allowed).toBe(false);

      limiter.reset('client1');
      expect(limiter.isAllowed('client1').allowed).toBe(true);
    });

    it('should return status for tracked clients', () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 5,
      });

      limiter.isAllowed('client1');
      limiter.isAllowed('client1');

      const status = limiter.getStatus('client1');
      expect(status).not.toBeNull();
      expect(status!.count).toBe(2);
      expect(status!.remaining).toBe(3);
    });

    it('should return null for unknown clients', () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 5,
      });

      const status = limiter.getStatus('unknown');
      expect(status).toBeNull();
    });

    it('should use custom key generator', () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 1,
        keyGenerator: (id) => `prefix_${id}`,
      });

      limiter.isAllowed('test');
      // Same client ID but different key due to generator
      expect(limiter.isAllowed('test').allowed).toBe(false);
    });
  });

  describe('createApiRateLimiter', () => {
    it('should create limiter with API defaults', () => {
      const limiter = createApiRateLimiter();

      // Should allow 60 requests
      for (let i = 0; i < 60; i++) {
        expect(limiter.isAllowed('client').allowed).toBe(true);
      }

      // 61st should be blocked
      expect(limiter.isAllowed('client').allowed).toBe(false);
    });
  });

  describe('createScanRateLimiter', () => {
    it('should create limiter with scan defaults (more restrictive)', () => {
      const limiter = createScanRateLimiter();

      // Should allow 10 requests
      for (let i = 0; i < 10; i++) {
        expect(limiter.isAllowed('client').allowed).toBe(true);
      }

      // 11th should be blocked
      expect(limiter.isAllowed('client').allowed).toBe(false);
    });
  });

  describe('createWebhookRateLimiter', () => {
    it('should create limiter with webhook defaults', () => {
      const limiter = createWebhookRateLimiter();

      // Should allow 100 requests
      for (let i = 0; i < 100; i++) {
        expect(limiter.isAllowed('webhook').allowed).toBe(true);
      }

      // 101st should be blocked
      expect(limiter.isAllowed('webhook').allowed).toBe(false);
    });
  });
});
