// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Tool Response Type Definitions
 *
 * Defines structured response formats for MCP tools to ensure
 * consistent error handling and success reporting.
 */

/**
 * @typedef {Object} ErrorResponse
 * @property {'error'} status
 * @property {string} message
 * @property {string} errorType - ValidationError, FileSystemError, CryptoError, etc.
 * @property {boolean} retryable
 * @property {Record<string, unknown>} [context]
 */

/**
 * @typedef {Object} SuccessResponse
 * @property {'success'} status
 * @property {string} message
 */

/**
 * @typedef {Object} SaveDeliverableResponse
 * @property {'success'} status
 * @property {string} message
 * @property {string} filepath
 * @property {string} deliverableType
 * @property {boolean} validated - true if queue JSON was validated
 */

/**
 * @typedef {Object} GenerateTotpResponse
 * @property {'success'} status
 * @property {string} message
 * @property {string} totpCode
 * @property {string} timestamp
 * @property {number} expiresIn - seconds until expiration
 */

/**
 * Helper to create tool result from response
 * MCP tools should return this format
 *
 * @param {ErrorResponse | SaveDeliverableResponse | GenerateTotpResponse} response
 * @returns {{ content: Array<{ type: string; text: string }>; isError: boolean }}
 */
export function createToolResult(response) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response, null, 2),
      },
    ],
    isError: response.status === 'error',
  };
}
