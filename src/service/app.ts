/**
 * Shannon Service - Fastify Application Bootstrap
 * Configures plugins, middleware, and routes
 */

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

// Custom middleware
import { errorHandlerPlugin } from './middleware/error-handler.js';
import { authPlugin } from './middleware/auth.js';
import { correlationPlugin } from './middleware/correlation.js';
import { rateLimitPlugin } from './middleware/rate-limit.js';

// Routes
import { healthRoutes } from './routes/health.js';
import { scanRoutes } from './routes/scans.js';
import { authValidateRoutes } from './routes/auth-validate.js';
import { configRoutes } from './routes/config.js';
import { reportRoutes } from './routes/reports.js';

// Build options for the Fastify server
export interface BuildAppOptions {
  logger?: boolean;
  trustProxy?: boolean;
}

/**
 * Build and configure the Fastify application
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
    trustProxy: options.trustProxy ?? true,
    genReqId: () => `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
  });

  // Register core plugins
  await app.register(sensible);

  // Security: CORS
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: [
      'X-Request-ID',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],
  });

  // Security: Headers
  await app.register(helmet, {
    contentSecurityPolicy: false, // Disable for API service
  });

  // Rate limiting (global - per-tenant limits applied in auth middleware)
  await app.register(rateLimit, {
    max: 1000,
    timeWindow: '1 hour',
    keyGenerator: (request) => {
      // Use API key or IP for rate limiting
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        return authHeader.slice(7, 15); // Use key prefix
      }
      return request.ip;
    },
    errorResponseBuilder: (request, context) => ({
      type: 'https://shannon.dev/errors/rate-limit-exceeded',
      title: 'Rate Limit Exceeded',
      status: 429,
      detail: `You have exceeded the rate limit. Please retry after ${context.after}`,
      instance: request.url,
      requestId: request.id,
      timestamp: new Date().toISOString(),
    }),
  });

  // OpenAPI documentation
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Shannon Service API',
        description: 'REST API for Shannon penetration testing service',
        version: '1.0.0',
        contact: {
          name: 'Shannon Team',
        },
      },
      servers: [
        {
          url: process.env.API_BASE_URL || 'http://localhost:3100',
          description: 'Shannon Service',
        },
      ],
      components: {
        securitySchemes: {
          apiKey: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'API Key',
            description: 'API Key authentication',
          },
        },
      },
      security: [{ apiKey: [] }],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // Decorate request with organization context (set by auth middleware)
  app.decorateRequest('organizationId', null);
  app.decorateRequest('apiKeyId', null);
  app.decorateRequest('scopes', null);

  // Register custom middleware
  await app.register(correlationPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(authPlugin);
  await app.register(rateLimitPlugin);

  // Register routes
  // Health routes are public (no auth required) - registered before auth middleware applies
  await app.register(healthRoutes);

  // Scan routes (require API key auth)
  await app.register(scanRoutes);

  // Auth validation routes (require API key with auth:validate scope)
  await app.register(authValidateRoutes);

  // Config routes (require API key with config:read scope)
  await app.register(configRoutes);

  // Report routes (require API key with scan:read/scan:write scopes)
  await app.register(reportRoutes);

  return app;
}

// Type augmentation for Fastify request
declare module 'fastify' {
  interface FastifyRequest {
    organizationId: string | null;
    apiKeyId: string | null;
    scopes: string[] | null;
  }
}

export default buildApp;
