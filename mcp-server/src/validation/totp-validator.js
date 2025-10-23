/**
 * TOTP Validator
 *
 * Validates TOTP secrets and provides base32 decoding.
 * Ported from tools/generate-totp-standalone.mjs (lines 43-72).
 */

/**
 * Base32 decode function
 * Ported from generate-totp-standalone.mjs
 *
 * @param {string} encoded - Base32 encoded string
 * @returns {Buffer} Buffer containing decoded bytes
 */
export function base32Decode(encoded) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleanInput = encoded.toUpperCase().replace(/[^A-Z2-7]/g, '');

  if (cleanInput.length === 0) {
    return Buffer.alloc(0);
  }

  const output = [];
  let bits = 0;
  let value = 0;

  for (const char of cleanInput) {
    const index = alphabet.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid base32 character: ${char}`);
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

/**
 * Validate TOTP secret
 * Must be base32-encoded string
 *
 * @param {string} secret - Secret to validate
 * @returns {boolean} true if valid, throws Error if invalid
 */
export function validateTotpSecret(secret) {
  if (!secret || secret.length === 0) {
    throw new Error('TOTP secret cannot be empty');
  }

  // Check if it's valid base32 (only A-Z and 2-7, case-insensitive)
  const base32Regex = /^[A-Z2-7]+$/i;
  if (!base32Regex.test(secret.replace(/[^A-Z2-7]/gi, ''))) {
    throw new Error('TOTP secret must be base32-encoded (characters A-Z and 2-7)');
  }

  // Try to decode to ensure it's valid
  try {
    base32Decode(secret);
  } catch (error) {
    throw new Error(`Invalid TOTP secret: ${error instanceof Error ? error.message : String(error)}`);
  }

  return true;
}
