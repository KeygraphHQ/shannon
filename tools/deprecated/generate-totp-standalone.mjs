#!/usr/bin/env node

import { createHmac } from 'crypto';

/**
 * Standalone TOTP generator that doesn't require external dependencies
 * Based on RFC 6238 (TOTP: Time-Based One-Time Password Algorithm)
 */

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--secret' && i + 1 < process.argv.length) {
      args.secret = process.argv[i + 1];
      i++; // Skip the next argument since it's the value
    } else if (process.argv[i] === '--help' || process.argv[i] === '-h') {
      args.help = true;
    }
  }
  return args;
}

function showHelp() {
  console.log(`
Usage: node generate-totp-standalone.mjs --secret <TOTP_SECRET>

Generate a Time-based One-Time Password (TOTP) from a secret key.
This standalone version doesn't require external dependencies.

Options:
  --secret <secret>  The base32-encoded TOTP secret key (required)
  --help, -h        Show this help message

Examples:
  node generate-totp-standalone.mjs --secret "JBSWY3DPEHPK3PXP"
  node generate-totp-standalone.mjs --secret "u4e2ewg3d6w7gya3p7plgkef6zgfzo23"

Output:
  A 6-digit TOTP code (e.g., 123456)
`);
}

// Base32 decoding function
function base32Decode(encoded) {
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

// HOTP implementation (RFC 4226)
function generateHOTP(secret, counter, digits = 6) {
  const key = base32Decode(secret);
  
  // Convert counter to 8-byte buffer (big-endian)
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  
  // Generate HMAC-SHA1
  const hmac = createHmac('sha1', key);
  hmac.update(counterBuffer);
  const hash = hmac.digest();
  
  // Dynamic truncation
  const offset = hash[hash.length - 1] & 0x0f;
  const code = (
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff)
  );
  
  // Generate digits
  const otp = (code % Math.pow(10, digits)).toString().padStart(digits, '0');
  return otp;
}

// TOTP implementation (RFC 6238)
function generateTOTP(secret, timeStep = 30, digits = 6) {
  const currentTime = Math.floor(Date.now() / 1000);
  const counter = Math.floor(currentTime / timeStep);
  return generateHOTP(secret, counter, digits);
}

function main() {
  const args = parseArgs();
  
  if (args.help) {
    showHelp();
    return;
  }
  
  if (!args.secret) {
    console.error('Error: --secret parameter is required');
    console.error('Use --help for usage information');
    process.exit(1);
  }
  
  try {
    const totpCode = generateTOTP(args.secret);
    console.log(totpCode);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();