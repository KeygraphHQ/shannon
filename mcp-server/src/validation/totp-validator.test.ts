import { describe, it, expect } from 'vitest';
import { validateTotpSecret, TOTP_MIN_SECRET_LENGTH } from './totp-validator.js';

describe('validateTotpSecret', () => {
  // A valid 32-char base32 secret (160 bits)
  const VALID_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
  // A short secret (only 16 chars = 80 bits, below minimum)
  const SHORT_SECRET = 'JBSWY3DPEHPK3PXP';

  it('accepts a secret with >= 32 base32 characters', () => {
    expect(VALID_SECRET.length).toBeGreaterThanOrEqual(TOTP_MIN_SECRET_LENGTH);
    expect(validateTotpSecret(VALID_SECRET)).toBe(true);
  });

  it('rejects a short secret (< 32 base32 chars)', () => {
    expect(SHORT_SECRET.length).toBeLessThan(TOTP_MIN_SECRET_LENGTH);
    expect(() => validateTotpSecret(SHORT_SECRET)).toThrow('too short');
  });

  it('rejects an 8-character secret', () => {
    expect(() => validateTotpSecret('JBSWY3DP')).toThrow('too short');
  });

  it('rejects an empty secret', () => {
    expect(() => validateTotpSecret('')).toThrow('empty');
  });

  it('mentions RFC 4226 in the error message for short secrets', () => {
    expect(() => validateTotpSecret(SHORT_SECRET)).toThrow('RFC 4226');
  });

  it('exports TOTP_MIN_SECRET_LENGTH as 32', () => {
    expect(TOTP_MIN_SECRET_LENGTH).toBe(32);
  });
});
