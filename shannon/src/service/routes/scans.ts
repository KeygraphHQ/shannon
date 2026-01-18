/**
 * Scan Routes - REST API endpoints for scan lifecycle management
 * Implements User Story 1: Internal Service Communication
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  getScanService,
  ScanNotFoundError,
  ScanLimitExceededError,
  ScanCannotBeCancelledError,
  ScanCannotBeRetriedError,
  ProjectNotFoundError,
} from '../services/scan-service.js';
import {
  getProgressService,
  ScanNotFoundError as ProgressScanNotFoundError,
  ScanNotCompletedError,
} from '../services/progress-service.js';
import {
  CreateScanRequestSchema,
  PaginationQuerySchema,
  ScanStatusEnum,
  ERROR_TYPES,
} from '../types/api.js';

// Request type definitions
interface ScanIdParams {
  scanId: string;
}

interface ListScansQuery {
  status?: string;
  limit?: number;
  cursor?: string;
}

interface ResultsQuery {
  limit?: number;
  cursor?: string;
}

// Zod schema for path params
const ScanIdParamsSchema = z.object({
  scanId: z.string().cuid(),
});

// Status filter schema
const ListScansQuerySchema = PaginationQuerySchema.extend({
  status: ScanStatusEnum.optional(),
});

// Results query schema
const ResultsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

/**
 * Register scan routes with the Fastify app
 */
export async function scanRoutes(app: FastifyInstance): Promise<void> {
  const scanService = getScanService();
  const progressService = getProgressService();

  // POST /api/v1/scans - Create a new scan
  app.post<{
    Body: z.infer<typeof CreateScanRequestSchema>;
  }>(
    '/api/v1/scans',
    {
      schema: {
        description: 'Create a new scan',
        tags: ['Scans'],
        body: {
          type: 'object',
          required: ['targetUrl', 'projectId'],
          properties: {
            targetUrl: { type: 'string', format: 'uri' },
            projectId: { type: 'string' },
            config: {
              type: 'object',
              properties: {
                authMethod: { type: 'string', enum: ['form', 'api_token', 'basic', 'sso'] },
                phases: { type: 'array', items: { type: 'string' } },
                options: { type: 'object' },
              },
            },
            containerIsolation: {
              type: 'object',
              description: 'Container isolation configuration (Epic 006)',
              properties: {
                enabled: { type: 'boolean', default: false, description: 'Enable container isolation' },
                planId: { type: 'string', enum: ['free', 'pro', 'enterprise'], description: 'Resource plan' },
                image: { type: 'string', description: 'Override scanner image' },
                imageDigest: { type: 'string', description: 'Pin to specific image digest' },
              },
            },
          },
        },
        response: {
          201: {
            description: 'Scan created successfully',
            type: 'object',
            properties: {
              id: { type: 'string' },
              organizationId: { type: 'string' },
              projectId: { type: 'string' },
              targetUrl: { type: 'string' },
              status: { type: 'string' },
              workflowId: { type: 'string', nullable: true },
              parentScanId: { type: 'string', nullable: true },
              queuedAt: { type: 'string', format: 'date-time', nullable: true },
              startedAt: { type: 'string', format: 'date-time', nullable: true },
              completedAt: { type: 'string', format: 'date-time', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      // Validate request has organization context (set by auth middleware)
      if (!request.organizationId || !request.apiKeyId) {
        return reply.code(401).send({
          type: ERROR_TYPES.AUTH_MISSING_KEY,
          title: 'Unauthorized',
          status: 401,
          detail: 'API key authentication required',
          requestId: request.id,
          timestamp: new Date().toISOString(),
        });
      }

      // Check scope
      if (!request.scopes?.includes('scan:write')) {
        return reply.code(403).send({
          type: ERROR_TYPES.AUTH_INSUFFICIENT_SCOPE,
          title: 'Forbidden',
          status: 403,
          detail: 'API key does not have scan:write scope',
          requestId: request.id,
          timestamp: new Date().toISOString(),
        });
      }

      // Validate request body
      const parseResult = CreateScanRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          type: ERROR_TYPES.VALIDATION_FAILED,
          title: 'Validation Failed',
          status: 400,
          detail: 'Request validation failed',
          requestId: request.id,
          timestamp: new Date().toISOString(),
          errors: parseResult.error.issues.map((e) => ({
            code: 'INVALID_FIELD',
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      try {
        const scan = await scanService.createScan({
          organizationId: request.organizationId,
          apiKeyId: request.apiKeyId,
          request: parseResult.data,
        });

        return reply.code(201).send(scan);
      } catch (error) {
        return handleScanError(error, request, reply);
      }
    }
  );

  // GET /api/v1/scans - List scans with pagination
  app.get<{
    Querystring: ListScansQuery;
  }>(
    '/api/v1/scans',
    {
      schema: {
        description: 'List scans for organization',
        tags: ['Scans'],
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'] },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            cursor: { type: 'string' },
          },
        },
        response: {
          200: {
            description: 'List of scans',
            type: 'object',
            properties: {
              scans: { type: 'array', items: { type: 'object' } },
              nextCursor: { type: 'string', nullable: true },
              total: { type: 'integer' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      if (!request.organizationId) {
        return reply.code(401).send({
          type: ERROR_TYPES.AUTH_MISSING_KEY,
          title: 'Unauthorized',
          status: 401,
          detail: 'API key authentication required',
          requestId: request.id,
          timestamp: new Date().toISOString(),
        });
      }

      // Check scope
      if (!request.scopes?.includes('scan:read') && !request.scopes?.includes('scan:write')) {
        return reply.code(403).send({
          type: ERROR_TYPES.AUTH_INSUFFICIENT_SCOPE,
          title: 'Forbidden',
          status: 403,
          detail: 'API key does not have scan:read scope',
          requestId: request.id,
          timestamp: new Date().toISOString(),
        });
      }

      // Parse query parameters
      const parseResult = ListScansQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        return reply.code(400).send({
          type: ERROR_TYPES.VALIDATION_FAILED,
          title: 'Validation Failed',
          status: 400,
          detail: 'Invalid query parameters',
          requestId: request.id,
          timestamp: new Date().toISOString(),
          errors: parseResult.error.issues.map((e) => ({
            code: 'INVALID_PARAM',
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      try {
        const result = await scanService.listScans({
          organizationId: request.organizationId,
          status: parseResult.data.status,
          limit: parseResult.data.limit,
          cursor: parseResult.data.cursor,
        });

        return reply.send(result);
      } catch (error) {
        return handleScanError(error, request, reply);
      }
    }
  );

  // GET /api/v1/scans/:scanId - Get scan details
  app.get<{
    Params: ScanIdParams;
  }>(
    '/api/v1/scans/:scanId',
    {
      schema: {
        description: 'Get scan details',
        tags: ['Scans'],
        params: {
          type: 'object',
          required: ['scanId'],
          properties: {
            scanId: { type: 'string' },
          },
        },
        response: {
          200: {
            description: 'Scan details',
            type: 'object',
          },
        },
      },
    },
    async (request, reply) => {
      if (!request.organizationId) {
        return reply.code(401).send({
          type: ERROR_TYPES.AUTH_MISSING_KEY,
          title: 'Unauthorized',
          status: 401,
          detail: 'API key authentication required',
          requestId: request.id,
          timestamp: new Date().toISOString(),
        });
      }

      // Validate params
      const parseResult = ScanIdParamsSchema.safeParse(request.params);
      if (!parseResult.success) {
        return reply.code(400).send({
          type: ERROR_TYPES.VALIDATION_FAILED,
          title: 'Validation Failed',
          status: 400,
          detail: 'Invalid scan ID format',
          requestId: request.id,
          timestamp: new Date().toISOString(),
        });
      }

      try {
        const scan = await scanService.getScan(
          parseResult.data.scanId,
          request.organizationId
        );
        return reply.send(scan);
      } catch (error) {
        return handleScanError(error, request, reply);
      }
    }
  );

  // GET /api/v1/scans/:scanId/progress - Get real-time progress
  app.get<{
    Params: ScanIdParams;
  }>(
    '/api/v1/scans/:scanId/progress',
    {
      schema: {
        description: 'Get real-time scan progress',
        tags: ['Scans'],
        params: {
          type: 'object',
          required: ['scanId'],
          properties: {
            scanId: { type: 'string' },
          },
        },
        response: {
          200: {
            description: 'Current progress',
            type: 'object',
            properties: {
              scanId: { type: 'string' },
              status: { type: 'string' },
              phase: { type: 'string' },
              percentage: { type: 'integer', minimum: 0, maximum: 100 },
              agentStatuses: { type: 'array', items: { type: 'object' } },
              startedAt: { type: 'string', format: 'date-time', nullable: true },
              eta: { type: 'string', format: 'date-time', nullable: true },
              currentActivity: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
    async (request, reply) => {
      if (!request.organizationId) {
        return reply.code(401).send({
          type: ERROR_TYPES.AUTH_MISSING_KEY,
          title: 'Unauthorized',
          status: 401,
          detail: 'API key authentication required',
          requestId: request.id,
          timestamp: new Date().toISOString(),
        });
      }

      // Validate params
      const parseResult = ScanIdParamsSchema.safeParse(request.params);
      if (!parseResult.success) {
        return reply.code(400).send({
          type: ERROR_TYPES.VALIDATION_FAILED,
          title: 'Validation Failed',
          status: 400,
          detail: 'Invalid scan ID format',
          requestId: request.id,
          timestamp: new Date().toISOString(),
        });
      }

      try {
        const progress = await progressService.getScanProgress({
          scanId: parseResult.data.scanId,
          organizationId: request.organizationId,
        });
        return reply.send(progress);
      } catch (error) {
        return handleScanError(error, request, reply);
      }
    }
  );

  // GET /api/v1/scans/:scanId/results - Get scan results with pagination
  app.get<{
    Params: ScanIdParams;
    Querystring: ResultsQuery;
  }>(
    '/api/v1/scans/:scanId/results',
    {
      schema: {
        description: 'Get scan results',
        tags: ['Scans'],
        params: {
          type: 'object',
          required: ['scanId'],
          properties: {
            scanId: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
            cursor: { type: 'string' },
          },
        },
        response: {
          200: {
            description: 'Scan results',
            type: 'object',
            properties: {
              scanId: { type: 'string' },
              status: { type: 'string' },
              findings: { type: 'array', items: { type: 'object' } },
              summary: { type: 'object' },
              reportPaths: { type: 'object', nullable: true },
              nextCursor: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
    async (request, reply) => {
      if (!request.organizationId) {
        return reply.code(401).send({
          type: ERROR_TYPES.AUTH_MISSING_KEY,
          title: 'Unauthorized',
          status: 401,
          detail: 'API key authentication required',
          requestId: request.id,
          timestamp: new Date().toISOString(),
        });
      }

      // Validate params
      const paramsResult = ScanIdParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.code(400).send({
          type: ERROR_TYPES.VALIDATION_FAILED,
          title: 'Validation Failed',
          status: 400,
          detail: 'Invalid scan ID format',
          requestId: request.id,
          timestamp: new Date().toISOString(),
        });
      }

      // Validate query
      const queryResult = ResultsQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.code(400).send({
          type: ERROR_TYPES.VALIDATION_FAILED,
          title: 'Validation Failed',
          status: 400,
          detail: 'Invalid query parameters',
          requestId: request.id,
          timestamp: new Date().toISOString(),
        });
      }

      try {
        const results = await progressService.getScanResults({
          scanId: paramsResult.data.scanId,
          organizationId: request.organizationId,
          limit: queryResult.data.limit,
          cursor: queryResult.data.cursor,
        });
        return reply.send(results);
      } catch (error) {
        return handleScanError(error, request, reply);
      }
    }
  );

  // DELETE /api/v1/scans/:scanId - Cancel a scan
  app.delete<{
    Params: ScanIdParams;
  }>(
    '/api/v1/scans/:scanId',
    {
      schema: {
        description: 'Cancel a running scan',
        tags: ['Scans'],
        params: {
          type: 'object',
          required: ['scanId'],
          properties: {
            scanId: { type: 'string' },
          },
        },
        response: {
          200: {
            description: 'Scan cancelled',
            type: 'object',
          },
        },
      },
    },
    async (request, reply) => {
      if (!request.organizationId) {
        return reply.code(401).send({
          type: ERROR_TYPES.AUTH_MISSING_KEY,
          title: 'Unauthorized',
          status: 401,
          detail: 'API key authentication required',
          requestId: request.id,
          timestamp: new Date().toISOString(),
        });
      }

      // Check scope
      if (!request.scopes?.includes('scan:write')) {
        return reply.code(403).send({
          type: ERROR_TYPES.AUTH_INSUFFICIENT_SCOPE,
          title: 'Forbidden',
          status: 403,
          detail: 'API key does not have scan:write scope',
          requestId: request.id,
          timestamp: new Date().toISOString(),
        });
      }

      // Validate params
      const parseResult = ScanIdParamsSchema.safeParse(request.params);
      if (!parseResult.success) {
        return reply.code(400).send({
          type: ERROR_TYPES.VALIDATION_FAILED,
          title: 'Validation Failed',
          status: 400,
          detail: 'Invalid scan ID format',
          requestId: request.id,
          timestamp: new Date().toISOString(),
        });
      }

      try {
        const scan = await scanService.cancelScan(
          parseResult.data.scanId,
          request.organizationId
        );
        return reply.send(scan);
      } catch (error) {
        return handleScanError(error, request, reply);
      }
    }
  );

  // POST /api/v1/scans/:scanId/retry - Retry a failed scan
  app.post<{
    Params: ScanIdParams;
  }>(
    '/api/v1/scans/:scanId/retry',
    {
      schema: {
        description: 'Retry a failed scan',
        tags: ['Scans'],
        params: {
          type: 'object',
          required: ['scanId'],
          properties: {
            scanId: { type: 'string' },
          },
        },
        response: {
          201: {
            description: 'New scan created',
            type: 'object',
          },
        },
      },
    },
    async (request, reply) => {
      if (!request.organizationId || !request.apiKeyId) {
        return reply.code(401).send({
          type: ERROR_TYPES.AUTH_MISSING_KEY,
          title: 'Unauthorized',
          status: 401,
          detail: 'API key authentication required',
          requestId: request.id,
          timestamp: new Date().toISOString(),
        });
      }

      // Check scope
      if (!request.scopes?.includes('scan:write')) {
        return reply.code(403).send({
          type: ERROR_TYPES.AUTH_INSUFFICIENT_SCOPE,
          title: 'Forbidden',
          status: 403,
          detail: 'API key does not have scan:write scope',
          requestId: request.id,
          timestamp: new Date().toISOString(),
        });
      }

      // Validate params
      const parseResult = ScanIdParamsSchema.safeParse(request.params);
      if (!parseResult.success) {
        return reply.code(400).send({
          type: ERROR_TYPES.VALIDATION_FAILED,
          title: 'Validation Failed',
          status: 400,
          detail: 'Invalid scan ID format',
          requestId: request.id,
          timestamp: new Date().toISOString(),
        });
      }

      try {
        const scan = await scanService.retryScan(
          parseResult.data.scanId,
          request.organizationId,
          request.apiKeyId
        );
        return reply.code(201).send(scan);
      } catch (error) {
        return handleScanError(error, request, reply);
      }
    }
  );
}

/**
 * Handle service errors and return appropriate HTTP responses
 */
function handleScanError(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply
): FastifyReply {
  const requestId = request.id;
  const timestamp = new Date().toISOString();

  if (error instanceof ScanNotFoundError || error instanceof ProgressScanNotFoundError) {
    return reply.code(404).send({
      type: ERROR_TYPES.SCAN_NOT_FOUND,
      title: 'Not Found',
      status: 404,
      detail: error.message,
      requestId,
      timestamp,
    });
  }

  if (error instanceof ScanLimitExceededError) {
    return reply.code(429).send({
      type: ERROR_TYPES.SCAN_LIMIT_EXCEEDED,
      title: 'Rate Limit Exceeded',
      status: 429,
      detail: error.message,
      requestId,
      timestamp,
    });
  }

  if (error instanceof ScanCannotBeCancelledError) {
    return reply.code(400).send({
      type: ERROR_TYPES.VALIDATION_FAILED,
      title: 'Bad Request',
      status: 400,
      detail: error.message,
      requestId,
      timestamp,
    });
  }

  if (error instanceof ScanCannotBeRetriedError) {
    return reply.code(400).send({
      type: ERROR_TYPES.VALIDATION_FAILED,
      title: 'Bad Request',
      status: 400,
      detail: error.message,
      requestId,
      timestamp,
    });
  }

  if (error instanceof ProjectNotFoundError) {
    return reply.code(404).send({
      type: ERROR_TYPES.VALIDATION_FAILED,
      title: 'Not Found',
      status: 404,
      detail: error.message,
      requestId,
      timestamp,
    });
  }

  if (error instanceof ScanNotCompletedError) {
    return reply.code(400).send({
      type: ERROR_TYPES.VALIDATION_FAILED,
      title: 'Bad Request',
      status: 400,
      detail: error.message,
      requestId,
      timestamp,
    });
  }

  // Unknown error - log and return 500
  console.error('Unexpected error in scan routes:', error);
  return reply.code(500).send({
    type: ERROR_TYPES.INTERNAL_ERROR,
    title: 'Internal Server Error',
    status: 500,
    detail: 'An unexpected error occurred',
    requestId,
    timestamp,
  });
}

export default scanRoutes;
