/**
 * Error Formatting Utilities
 *
 * Helper functions for creating structured error responses.
 */

/**
 * @typedef {Object} ErrorResponse
 * @property {'error'} status
 * @property {string} message
 * @property {string} errorType
 * @property {boolean} retryable
 * @property {Record<string, unknown>} [context]
 */

/**
 * Create a validation error response
 *
 * @param {string} message
 * @param {boolean} [retryable=true]
 * @param {Record<string, unknown>} [context]
 * @returns {ErrorResponse}
 */
export function createValidationError(message, retryable = true, context) {
  return {
    status: 'error',
    message,
    errorType: 'ValidationError',
    retryable,
    context,
  };
}

/**
 * Create a file system error response
 *
 * @param {string} message
 * @param {boolean} [retryable=false]
 * @param {Record<string, unknown>} [context]
 * @returns {ErrorResponse}
 */
export function createFileSystemError(message, retryable = false, context) {
  return {
    status: 'error',
    message,
    errorType: 'FileSystemError',
    retryable,
    context,
  };
}

/**
 * Create a crypto error response
 *
 * @param {string} message
 * @param {boolean} [retryable=false]
 * @param {Record<string, unknown>} [context]
 * @returns {ErrorResponse}
 */
export function createCryptoError(message, retryable = false, context) {
  return {
    status: 'error',
    message,
    errorType: 'CryptoError',
    retryable,
    context,
  };
}

/**
 * Create a generic error response
 *
 * @param {unknown} error
 * @param {boolean} [retryable=false]
 * @param {Record<string, unknown>} [context]
 * @returns {ErrorResponse}
 */
export function createGenericError(error, retryable = false, context) {
  const message = error instanceof Error ? error.message : String(error);
  const errorType = error instanceof Error ? error.constructor.name : 'UnknownError';

  return {
    status: 'error',
    message,
    errorType,
    retryable,
    context,
  };
}
