import { describe, it, expect } from 'vitest';
import { redactSensitive } from './error-handling.js';

describe('redactSensitive', () => {
  it('returns primitives unchanged', () => {
    expect(redactSensitive('hello')).toBe('hello');
    expect(redactSensitive(42)).toBe(42);
    expect(redactSensitive(null)).toBe(null);
    expect(redactSensitive(undefined)).toBe(undefined);
    expect(redactSensitive(true)).toBe(true);
  });

  it('redacts password fields', () => {
    const input = { username: 'admin', password: 's3cret' };
    const result = redactSensitive(input) as Record<string, unknown>;
    expect(result.username).toBe('admin');
    expect(result.password).toBe('[REDACTED]');
  });

  it('redacts token and apiKey fields', () => {
    const input = { token: 'abc123', apiKey: 'sk-test', other: 'visible' };
    const result = redactSensitive(input) as Record<string, unknown>;
    expect(result.token).toBe('[REDACTED]');
    expect(result.apiKey).toBe('[REDACTED]');
    expect(result.other).toBe('visible');
  });

  it('redacts api_key (underscore variant)', () => {
    const input = { api_key: 'sk-test' };
    const result = redactSensitive(input) as Record<string, unknown>;
    expect(result.api_key).toBe('[REDACTED]');
  });

  it('redacts secret and authorization', () => {
    const input = { secret: 'totp-secret', authorization: 'Bearer xyz' };
    const result = redactSensitive(input) as Record<string, unknown>;
    expect(result.secret).toBe('[REDACTED]');
    expect(result.authorization).toBe('[REDACTED]');
  });

  it('redacts totp_secret', () => {
    const input = { totp_secret: 'JBSWY3DPEHPK3PXP' };
    const result = redactSensitive(input) as Record<string, unknown>;
    expect(result.totp_secret).toBe('[REDACTED]');
  });

  it('redacts nested sensitive fields', () => {
    const input = {
      toolName: 'login',
      details: {
        credentials: 'user:pass',
        url: 'https://example.com',
      },
    };
    const result = redactSensitive(input) as Record<string, Record<string, unknown>>;
    expect(result.details!.credentials).toBe('[REDACTED]');
    expect(result.details!.url).toBe('https://example.com');
  });

  it('handles arrays', () => {
    const input = [{ password: 'secret' }, { name: 'safe' }];
    const result = redactSensitive(input) as Array<Record<string, unknown>>;
    expect(result[0]!.password).toBe('[REDACTED]');
    expect(result[1]!.name).toBe('safe');
  });

  it('is case-insensitive for key matching', () => {
    const input = { PASSWORD: 'secret', Token: 'abc', APIKEY: 'key' };
    const result = redactSensitive(input) as Record<string, unknown>;
    expect(result.PASSWORD).toBe('[REDACTED]');
    expect(result.Token).toBe('[REDACTED]');
    expect(result.APIKEY).toBe('[REDACTED]');
  });

  it('preserves non-sensitive fields', () => {
    const input = { toolName: 'nmap', errorCode: 'ECONNRESET', originalError: 'timeout' };
    const result = redactSensitive(input) as Record<string, unknown>;
    expect(result.toolName).toBe('nmap');
    expect(result.errorCode).toBe('ECONNRESET');
    expect(result.originalError).toBe('timeout');
  });
});
