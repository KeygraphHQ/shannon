/**
 * RFC 7807 Problem Details Error Handler
 * Implements standard error response format for HTTP APIs
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { ERROR_TYPES, ProblemDetail } from '../types/api.js';

// Error type for Fastify errors with additional properties
interface FastifyErrorLike {
  message: string;
  statusCode?: number;
  validation?: Array<{
    instancePath?: string;
    params?: { missingProperty?: string };
    message?: string;
  }>;
}

/**
 * Custom error class for service errors
 */
export class ServiceError extends Error {
  constructor(
    public readonly type: keyof typeof ERROR_TYPES,
    public readonly title: string,
    public readonly status: number,
    public readonly detail: string,
    public readonly errors?: Array<{ code: string; field?: string; message: string }>
  ) {
    super(detail);
    this.name = 'ServiceError';
  }
}

/**
 * Create a problem detail response
 */
export function createProblemDetail(
  request: FastifyRequest,
  type: keyof typeof ERROR_TYPES,
  title: string,
  status: number,
  detail: string,
  errors?: Array<{ code: string; field?: string; message: string }>
): ProblemDetail {
  return {
    type: ERROR_TYPES[type],
    title,
    status,
    detail,
    instance: request.url,
    requestId: request.id,
    timestamp: new Date(),
    errors,
  };
}

/**
 * Convert Zod validation errors to problem detail format
 */
function zodErrorToProblemDetail(
  request: FastifyRequest,
  error: ZodError
): ProblemDetail {
  const errors = error.errors.map((err) => ({
    code: 'VALIDATION_ERROR',
    field: err.path.join('.'),
    message: err.message,
  }));

  return createProblemDetail(
    request,
    'VALIDATION_FAILED',
    'Validation Failed',
    400,
    'Request validation failed. See errors for details.',
    errors
  );
}

/**
 * Register the error handler plugin
 */
export async function errorHandlerPlugin(app: FastifyInstance): Promise<void> {
  // Set error handler
  app.setErrorHandler(async (error: Error, request, reply) => {
    request.log.error({ err: error }, 'Request error');

    // Handle ServiceError
    if (error instanceof ServiceError) {
      const problemDetail = createProblemDetail(
        request,
        error.type,
        error.title,
        error.status,
        error.detail,
        error.errors
      );

      return reply
        .status(error.status)
        .header('Content-Type', 'application/problem+json')
        .send(problemDetail);
    }

    // Handle Zod validation errors
    if (error instanceof ZodError) {
      const problemDetail = zodErrorToProblemDetail(request, error);

      return reply
        .status(400)
        .header('Content-Type', 'application/problem+json')
        .send(problemDetail);
    }

    // Cast to error-like for additional properties
    const fastifyError = error as unknown as FastifyErrorLike;

    // Handle Fastify validation errors
    if (fastifyError.validation) {
      const validationErrors: Array<{ code: string; field?: string; message: string }> =
        fastifyError.validation.map((v) => {
          const field = v.instancePath?.replace(/^\//, '') || v.params?.missingProperty;
          return {
            code: 'VALIDATION_ERROR',
            ...(field ? { field } : {}),
            message: v.message || 'Invalid value',
          };
        });

      const problemDetail = createProblemDetail(
        request,
        'VALIDATION_FAILED',
        'Validation Failed',
        400,
        'Request validation failed. See errors for details.',
        validationErrors
      );

      return reply
        .status(400)
        .header('Content-Type', 'application/problem+json')
        .send(problemDetail);
    }

    // Handle rate limit errors (from @fastify/rate-limit)
    if (fastifyError.statusCode === 429) {
      const problemDetail = createProblemDetail(
        request,
        'RATE_LIMIT_EXCEEDED',
        'Rate Limit Exceeded',
        429,
        fastifyError.message || 'You have exceeded the rate limit. Please try again later.'
      );

      return reply
        .status(429)
        .header('Content-Type', 'application/problem+json')
        .send(problemDetail);
    }

    // Handle other HTTP errors
    if (fastifyError.statusCode && fastifyError.statusCode >= 400 && fastifyError.statusCode < 500) {
      const problemDetail = createProblemDetail(
        request,
        'VALIDATION_FAILED',
        fastifyError.message || 'Bad Request',
        fastifyError.statusCode,
        fastifyError.message || 'The request could not be processed.'
      );

      return reply
        .status(fastifyError.statusCode)
        .header('Content-Type', 'application/problem+json')
        .send(problemDetail);
    }

    // Handle unknown errors as internal server errors
    const problemDetail = createProblemDetail(
      request,
      'INTERNAL_ERROR',
      'Internal Server Error',
      500,
      'An unexpected error occurred. Please try again later.'
    );

    return reply
      .status(500)
      .header('Content-Type', 'application/problem+json')
      .send(problemDetail);
  });

  // Set not found handler
  app.setNotFoundHandler((request, reply) => {
    const problemDetail = createProblemDetail(
      request,
      'SCAN_NOT_FOUND',
      'Not Found',
      404,
      `The requested resource '${request.url}' was not found.`
    );

    return reply
      .status(404)
      .header('Content-Type', 'application/problem+json')
      .send(problemDetail);
  });
}

// Pre-built error factories for common cases
export const errors = {
  missingApiKey: (request: FastifyRequest) =>
    new ServiceError(
      'AUTH_MISSING_KEY',
      'Missing API Key',
      401,
      'Authorization header with API key is required.'
    ),

  invalidApiKey: (request: FastifyRequest) =>
    new ServiceError(
      'AUTH_INVALID_KEY',
      'Invalid API Key',
      401,
      'The provided API key is invalid or has been revoked.'
    ),

  expiredApiKey: (request: FastifyRequest) =>
    new ServiceError(
      'AUTH_EXPIRED_KEY',
      'Expired API Key',
      401,
      'The provided API key has expired.'
    ),

  insufficientScope: (required: string) =>
    new ServiceError(
      'AUTH_INSUFFICIENT_SCOPE',
      'Insufficient Scope',
      403,
      `This action requires the '${required}' scope.`
    ),

  orgMismatch: () =>
    new ServiceError(
      'AUTH_ORG_MISMATCH',
      'Organization Mismatch',
      403,
      'The requested resource belongs to a different organization.'
    ),

  scanLimitExceeded: (limit: number) =>
    new ServiceError(
      'SCAN_LIMIT_EXCEEDED',
      'Concurrent Scan Limit Exceeded',
      429,
      `You have reached the maximum of ${limit} concurrent scans.`,
      [{ code: 'SCAN_LIMIT_EXCEEDED', message: `Maximum ${limit} concurrent scans allowed` }]
    ),

  scanNotFound: (scanId: string) =>
    new ServiceError(
      'SCAN_NOT_FOUND',
      'Scan Not Found',
      404,
      `Scan with ID '${scanId}' was not found.`
    ),

  temporalUnavailable: () =>
    new ServiceError(
      'TEMPORAL_UNAVAILABLE',
      'Temporal Unavailable',
      503,
      'The scan orchestration service is temporarily unavailable. Your request has been queued.'
    ),
};

export default errorHandlerPlugin;
