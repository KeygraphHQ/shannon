#!/usr/bin/env node

// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * generate-totp CLI
 *
 * Generates 6-digit TOTP codes for authentication.
 * Replaces the MCP generate_totp tool.
 * Based on RFC 6238 (TOTP) and RFC 4226 (HOTP).
 *
 * Usage:
 *   generate-totp --secret JBSWY3DPEHPK3PXP
 */

import { createHmac } from 'node:crypto';

// === Base32 Decoding ===

function base32Decode(encoded: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleanInput = encoded.toUpperCase().replace(/[^A-Z2-7]/g, '');

  if (cleanInput.length === 0) {
    throw new Error('TOTP secret is empty after cleaning');
  }

  const output: number[] = [];
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

// === TOTP Generation (RFC 6238) ===

function generateHOTP(secret: string, counter: number, digits: number = 6): string {
  const key = base32Decode(secret);

  // Convert counter to 8-byte buffer (big-endian)
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  // Generate HMAC-SHA1
  const hmac = createHmac('sha1', key);
  hmac.update(counterBuffer);
  const hash = hmac.digest();

  // Dynamic truncation (SHA-1 always produces 20 bytes)
  const lastByte = hash[hash.length - 1] ?? 0;
  const offset = lastByte & 0x0f;
  const code =
    (((hash[offset] ?? 0) & 0x7f) << 24) |
    (((hash[offset + 1] ?? 0) & 0xff) << 16) |
    (((hash[offset + 2] ?? 0) & 0xff) << 8) |
    ((hash[offset + 3] ?? 0) & 0xff);

  return (code % 10 ** digits).toString().padStart(digits, '0');
}

function generateTOTP(secret: string, timeStep: number = 30, digits: number = 6): string {
  const counter = Math.floor(Date.now() / 1000 / timeStep);
  return generateHOTP(secret, counter, digits);
}

// === Argument Parsing ===

function parseSecret(argv: string[]): string {
  for (let i = 2; i < argv.length; i++) {
    const next = argv[i + 1];
    if (argv[i] === '--secret' && next) {
      return next;
    }
  }
  return '';
}

// === Main ===

function main(): void {
  const secret = parseSecret(process.argv);

  if (!secret) {
    console.log(JSON.stringify({ status: 'error', message: 'Missing required --secret argument', retryable: false }));
    process.exit(1);
  }

  const base32Regex = /^[A-Z2-7]+$/i;
  if (!base32Regex.test(secret)) {
    console.log(
      JSON.stringify({
        status: 'error',
        message: 'Secret must be base32-encoded (characters A-Z and 2-7)',
        retryable: false,
      }),
    );
    process.exit(1);
  }

  try {
    const totpCode = generateTOTP(secret);
    const expiresIn = 30 - (Math.floor(Date.now() / 1000) % 30);

    console.log(
      JSON.stringify({
        status: 'success',
        totpCode,
        expiresIn,
      }),
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(JSON.stringify({ status: 'error', message: `TOTP generation failed: ${msg}`, retryable: false }));
    process.exit(1);
  }
}

main();
