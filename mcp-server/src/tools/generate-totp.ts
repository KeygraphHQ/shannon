// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * generate_totp MCP Tool
 *
 * Generates 6-digit TOTP codes for authentication.
 * Replaces tools/generate-totp-standalone.mjs bash script.
 * Based on RFC 6238 (TOTP) and RFC 4226 (HOTP).
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { createHmac } from 'crypto';
import { z } from 'zod';
import { createToolResult, type ToolResult, type GenerateTotpResponse } from '../types/tool-responses.js';
import { base32Decode, validateTotpSecret } from '../validation/totp-validator.js';
import { createCryptoError, createGenericError } from '../utils/error-formatter.js';

/**
 * Input schema for generate_totp tool
 */
export const GenerateTotpInputSchema = z.object({
  secret: z
    .string()
    .min(1)
    .regex(/^[A-Z2-7]+$/i, 'Must be base32-encoded')
    .describe('Base32-encoded TOTP secret'),
});

export type GenerateTotpInput = z.infer<typeof GenerateTotpInputSchema>;

/**
 * Generate HOTP code (RFC 4226)
 * Ported from generate-totp-standalone.mjs (lines 74-99)
 */
function generateHOTP(secret: string, counter: number, digits: number = 6): string {
  const key = base32Decode(secret);

  // Convert counter to 8-byte buffer (big-endian)
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  // Generate HMAC-SHA1
  const hmac = createHmac('sha1', key);
  hmac.update(counterBuffer);
  const hash = hmac.digest();

  // Dynamic truncation
  const offset = hash[hash.length - 1]! & 0x0f;
  const code =
    ((hash[offset]! & 0x7f) << 24) |
    ((hash[offset + 1]! & 0xff) << 16) |
    ((hash[offset + 2]! & 0xff) << 8) |
    (hash[offset + 3]! & 0xff);

  // Generate digits
  const otp = (code % Math.pow(10, digits)).toString().padStart(digits, '0');
  return otp;
}

/**
 * Generate TOTP code (RFC 6238)
 * Ported from generate-totp-standalone.mjs (lines 101-106)
 */
function generateTOTP(secret: string, timeStep: number = 30, digits: number = 6): string {
  const currentTime = Math.floor(Date.now() / 1000);
  const counter = Math.floor(currentTime / timeStep);
  return generateHOTP(secret, counter, digits);
}

/**
 * Get seconds until TOTP code expires
 */
function getSecondsUntilExpiration(timeStep: number = 30): number {
  const currentTime = Math.floor(Date.now() / 1000);
  return timeStep - (currentTime % timeStep);
}

/**
 * generate_totp tool implementation
 */
export async function generateTotp(args: GenerateTotpInput): Promise<ToolResult> {
  try {
    const { secret } = args;

    // Validate secret (throws on error)
    validateTotpSecret(secret);

    // Generate TOTP code
    const totpCode = generateTOTP(secret);
    const expiresIn = getSecondsUntilExpiration();
    const timestamp = new Date().toISOString();

    // Success response
    const successResponse: GenerateTotpResponse = {
      status: 'success',
      message: 'TOTP code generated successfully',
      totpCode,
      timestamp,
      expiresIn,
    };

    return createToolResult(successResponse);
  } catch (error) {
    // Check if it's a validation/crypto error
    if (error instanceof Error && (error.message.includes('base32') || error.message.includes('TOTP'))) {
      const errorResponse = createCryptoError(error.message, false);
      return createToolResult(errorResponse);
    }

    // Generic error
    const errorResponse = createGenericError(error, false);
    return createToolResult(errorResponse);
  }
}

/**
 * Tool definition for MCP server - created using SDK's tool() function
 */
export const generateTotpTool = tool(
  'generate_totp',
  'Generates 6-digit TOTP code for authentication. Secret must be base32-encoded.',
  GenerateTotpInputSchema.shape,
  generateTotp
);
