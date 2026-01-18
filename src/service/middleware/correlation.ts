/**
 * Request Correlation ID Middleware
 * Adds correlation IDs to requests for distributed tracing
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// Header names for correlation IDs
export const CORRELATION_HEADERS = {
  REQUEST_ID: 'X-Request-ID',
  CORRELATION_ID: 'X-Correlation-ID',
  TRACE_ID: 'X-Trace-ID',
} as const;

/**
 * Generate a unique correlation ID
 */
export function generateCorrelationId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

/**
 * Extract correlation ID from request headers
 * Prefers X-Correlation-ID, falls back to X-Request-ID
 */
function extractCorrelationId(request: FastifyRequest): string | undefined {
  const headers = request.headers;

  return (
    (headers['x-correlation-id'] as string) ||
    (headers['x-request-id'] as string) ||
    (headers['x-trace-id'] as string)
  );
}

/**
 * Register correlation ID plugin
 */
export async function correlationPlugin(app: FastifyInstance): Promise<void> {
  // Add correlation ID to all requests
  app.addHook('onRequest', async (request, reply) => {
    // Use existing correlation ID or generate new one
    const correlationId = extractCorrelationId(request) || request.id;

    // Add correlation ID to request log context
    request.log = request.log.child({
      correlationId,
      requestId: request.id,
    });

    // Store correlation ID for later use
    request.correlationId = correlationId;
  });

  // Add correlation ID to response headers
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header(CORRELATION_HEADERS.REQUEST_ID, request.id);

    if (request.correlationId && request.correlationId !== request.id) {
      reply.header(CORRELATION_HEADERS.CORRELATION_ID, request.correlationId);
    }

    return payload;
  });

  // Log completed requests with timing
  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
        organizationId: request.organizationId,
      },
      'Request completed'
    );
  });
}

// Type augmentation for correlation ID
declare module 'fastify' {
  interface FastifyRequest {
    correlationId?: string;
  }
}

export default correlationPlugin;
