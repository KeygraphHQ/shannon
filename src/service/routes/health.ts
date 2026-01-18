/**
 * Health Routes - Health check and monitoring endpoints for Shannon Service
 * Implements Kubernetes probes, Prometheus metrics, and service info
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getHealthService } from '../services/health-service.js';
import { getMetricsService } from '../services/metrics-service.js';

// Service metadata from environment or defaults
const SERVICE_NAME = process.env.SERVICE_NAME || 'shannon-service';
const SERVICE_VERSION = process.env.SERVICE_VERSION || '1.0.0';
const BUILD_TIME = process.env.BUILD_TIME || new Date().toISOString();
const API_VERSIONS = ['v1'];

/**
 * Register health check routes
 * These endpoints are public (no authentication required)
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  const healthService = getHealthService();
  const metricsService = getMetricsService();

  /**
   * GET /health - Overall service health status
   * Returns 200 when healthy, 503 when unhealthy
   */
  app.get('/health', {
    schema: {
      tags: ['Health'],
      summary: 'Get overall service health',
      description: 'Returns comprehensive health status including all dependency checks',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['healthy', 'unhealthy', 'degraded'] },
            version: { type: 'string' },
            uptime: { type: 'number' },
            timestamp: { type: 'string', format: 'date-time' },
            dependencies: {
              type: 'object',
              properties: {
                database: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['healthy', 'unhealthy', 'degraded'] },
                    latencyMs: { type: 'number' },
                    message: { type: 'string' },
                  },
                },
                temporal: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['healthy', 'unhealthy', 'degraded'] },
                    latencyMs: { type: 'number' },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        503: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['unhealthy', 'degraded'] },
            version: { type: 'string' },
            uptime: { type: 'number' },
            timestamp: { type: 'string', format: 'date-time' },
            dependencies: { type: 'object' },
          },
        },
      },
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const health = await healthService.getHealth();

    const statusCode = health.status === 'healthy' ? 200 : 503;

    return reply.status(statusCode).send({
      status: health.status,
      version: health.version,
      uptime: health.uptime,
      timestamp: health.timestamp.toISOString(),
      dependencies: {
        database: {
          status: health.dependencies.database.status,
          latencyMs: health.dependencies.database.latencyMs,
          message: health.dependencies.database.message,
        },
        temporal: {
          status: health.dependencies.temporal.status,
          latencyMs: health.dependencies.temporal.latencyMs,
          message: health.dependencies.temporal.message,
        },
      },
    });
  });

  /**
   * GET /health/ready - Kubernetes readiness probe
   * Returns 200 if service is ready to accept traffic, 503 otherwise
   */
  app.get('/health/ready', {
    schema: {
      tags: ['Health'],
      summary: 'Kubernetes readiness probe',
      description: 'Returns 200 if all critical dependencies are healthy and service can accept traffic',
      response: {
        200: {
          type: 'object',
          properties: {
            ready: { type: 'boolean' },
            checks: {
              type: 'object',
              properties: {
                database: { type: 'boolean' },
                temporal: { type: 'boolean' },
              },
            },
          },
        },
        503: {
          type: 'object',
          properties: {
            ready: { type: 'boolean' },
            checks: {
              type: 'object',
              properties: {
                database: { type: 'boolean' },
                temporal: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const readiness = await healthService.checkReadiness();

    const statusCode = readiness.ready ? 200 : 503;

    return reply.status(statusCode).send(readiness);
  });

  /**
   * GET /health/live - Kubernetes liveness probe
   * Returns 200 if service process is alive
   */
  app.get('/health/live', {
    schema: {
      tags: ['Health'],
      summary: 'Kubernetes liveness probe',
      description: 'Returns 200 if service process is alive. Use for container restart decisions.',
      response: {
        200: {
          type: 'object',
          properties: {
            alive: { type: 'boolean' },
            uptime: { type: 'number' },
          },
        },
      },
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const liveness = healthService.checkLiveness();
    return reply.status(200).send(liveness);
  });

  /**
   * GET /metrics - Prometheus metrics endpoint
   * Returns metrics in Prometheus text format
   */
  app.get('/metrics', {
    schema: {
      tags: ['Health'],
      summary: 'Prometheus metrics',
      description: 'Returns all service metrics in Prometheus text exposition format',
      produces: ['text/plain'],
      response: {
        200: {
          type: 'string',
          description: 'Prometheus format metrics',
        },
      },
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const metrics = await metricsService.exportPrometheus();
    return reply
      .status(200)
      .header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
      .send(metrics);
  });

  /**
   * GET /api/v1/info - Service information
   * Returns version, build info, and supported API versions
   */
  app.get('/api/v1/info', {
    schema: {
      tags: ['Health'],
      summary: 'Service information',
      description: 'Returns service name, version, build time, and supported API versions',
      response: {
        200: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            version: { type: 'string' },
            buildTime: { type: 'string', format: 'date-time' },
            apiVersions: { type: 'array', items: { type: 'string' } },
            environment: { type: 'string' },
          },
        },
      },
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({
      name: SERVICE_NAME,
      version: SERVICE_VERSION,
      buildTime: BUILD_TIME,
      apiVersions: API_VERSIONS,
      environment: process.env.NODE_ENV || 'development',
    });
  });

  // Also register /info at root level for convenience
  app.get('/info', {
    schema: {
      tags: ['Health'],
      summary: 'Service information (alias)',
      description: 'Alias for /api/v1/info',
      response: {
        200: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            version: { type: 'string' },
            buildTime: { type: 'string', format: 'date-time' },
            apiVersions: { type: 'array', items: { type: 'string' } },
            environment: { type: 'string' },
          },
        },
      },
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({
      name: SERVICE_NAME,
      version: SERVICE_VERSION,
      buildTime: BUILD_TIME,
      apiVersions: API_VERSIONS,
      environment: process.env.NODE_ENV || 'development',
    });
  });
}

export default healthRoutes;
