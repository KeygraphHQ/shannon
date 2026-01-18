/**
 * Report Routes - API endpoints for async report generation
 * Implements POST /api/v1/scans/{scanId}/reports, GET /api/v1/reports/{jobId}/status,
 * GET /api/v1/reports/{jobId}/download
 */

import { FastifyInstance } from 'fastify';
import * as fs from 'fs/promises';
import {
  getReportService,
  ReportScanNotFoundError,
  ReportScanNotCompletedError,
  ReportJobNotFoundError,
  ReportNotReadyError,
} from '../services/report-service.js';
import {
  CreateReportRequestSchema,
  ERROR_TYPES,
  type CreateReportRequest,
} from '../types/api.js';

// Route parameter types
interface ScanIdParams {
  scanId: string;
}

interface JobIdParams {
  jobId: string;
}

/**
 * Report routes registration
 */
export async function reportRoutes(fastify: FastifyInstance): Promise<void> {
  const reportService = getReportService();

  // POST /api/v1/scans/:scanId/reports - Create a report generation job
  fastify.post<{
    Params: ScanIdParams;
    Body: CreateReportRequest;
  }>(
    '/api/v1/scans/:scanId/reports',
    {
      schema: {
        description: 'Request async report generation for a completed scan',
        tags: ['Reports'],
        security: [{ apiKey: [] }],
        params: {
          type: 'object',
          required: ['scanId'],
          properties: {
            scanId: { type: 'string', description: 'Scan ID' },
          },
        },
        body: {
          type: 'object',
          required: ['format'],
          properties: {
            format: {
              type: 'string',
              enum: ['PDF', 'HTML', 'JSON', 'SARIF'],
              description: 'Report output format',
            },
            template: {
              type: 'string',
              description: 'Optional template name',
            },
          },
        },
        response: {
          202: {
            description: 'Report generation started',
            type: 'object',
            properties: {
              id: { type: 'string' },
              scanId: { type: 'string' },
              organizationId: { type: 'string' },
              format: { type: 'string' },
              template: { type: 'string', nullable: true },
              status: { type: 'string' },
              progress: { type: 'number' },
              outputPath: { type: 'string', nullable: true },
              errorMessage: { type: 'string', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
              completedAt: { type: 'string', format: 'date-time', nullable: true },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { scanId } = request.params;

      // Verify authentication
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

      // Verify scan:write scope
      if (!request.scopes?.includes('scan:write') && !request.scopes?.includes('admin:*')) {
        return reply.code(403).send({
          type: ERROR_TYPES.AUTH_INSUFFICIENT_SCOPE,
          title: 'Forbidden',
          status: 403,
          detail: 'Insufficient permissions. Required scope: scan:write',
          requestId: request.id,
          timestamp: new Date().toISOString(),
        });
      }

      // Validate request body
      const parseResult = CreateReportRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          type: ERROR_TYPES.VALIDATION_FAILED,
          title: 'Validation Failed',
          status: 400,
          detail: `Invalid request: ${parseResult.error.message}`,
          requestId: request.id,
          timestamp: new Date().toISOString(),
          errors: parseResult.error.errors.map((e) => ({
            code: 'INVALID_FIELD',
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      try {
        const reportJob = await reportService.createReport({
          organizationId: request.organizationId,
          scanId,
          request: parseResult.data,
        });

        return reply.code(202).send(reportJob);
      } catch (error) {
        if (error instanceof ReportScanNotFoundError) {
          return reply.code(404).send({
            type: ERROR_TYPES.SCAN_NOT_FOUND,
            title: 'Not Found',
            status: 404,
            detail: error.message,
            requestId: request.id,
            timestamp: new Date().toISOString(),
          });
        }
        if (error instanceof ReportScanNotCompletedError) {
          return reply.code(400).send({
            type: ERROR_TYPES.VALIDATION_FAILED,
            title: 'Bad Request',
            status: 400,
            detail: error.message,
            requestId: request.id,
            timestamp: new Date().toISOString(),
          });
        }
        throw error;
      }
    }
  );

  // GET /api/v1/reports/:jobId/status - Get report generation status
  fastify.get<{
    Params: JobIdParams;
  }>(
    '/api/v1/reports/:jobId/status',
    {
      schema: {
        description: 'Get the status of a report generation job',
        tags: ['Reports'],
        security: [{ apiKey: [] }],
        params: {
          type: 'object',
          required: ['jobId'],
          properties: {
            jobId: { type: 'string', description: 'Report job ID' },
          },
        },
        response: {
          200: {
            description: 'Report job status',
            type: 'object',
            properties: {
              id: { type: 'string' },
              scanId: { type: 'string' },
              organizationId: { type: 'string' },
              format: { type: 'string' },
              template: { type: 'string', nullable: true },
              status: { type: 'string', enum: ['PENDING', 'GENERATING', 'COMPLETED', 'FAILED'] },
              progress: { type: 'number', minimum: 0, maximum: 100 },
              outputPath: { type: 'string', nullable: true },
              errorMessage: { type: 'string', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
              completedAt: { type: 'string', format: 'date-time', nullable: true },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { jobId } = request.params;

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

      // Verify scan:read scope
      if (!request.scopes?.includes('scan:read') && !request.scopes?.includes('admin:*')) {
        return reply.code(403).send({
          type: ERROR_TYPES.AUTH_INSUFFICIENT_SCOPE,
          title: 'Forbidden',
          status: 403,
          detail: 'Insufficient permissions. Required scope: scan:read',
          requestId: request.id,
          timestamp: new Date().toISOString(),
        });
      }

      try {
        const reportJob = await reportService.getReportJob(jobId, request.organizationId);
        return reply.send(reportJob);
      } catch (error) {
        if (error instanceof ReportJobNotFoundError) {
          return reply.code(404).send({
            type: ERROR_TYPES.SCAN_NOT_FOUND,
            title: 'Not Found',
            status: 404,
            detail: error.message,
            requestId: request.id,
            timestamp: new Date().toISOString(),
          });
        }
        throw error;
      }
    }
  );

  // GET /api/v1/reports/:jobId/download - Download generated report
  fastify.get<{
    Params: JobIdParams;
  }>(
    '/api/v1/reports/:jobId/download',
    {
      schema: {
        description: 'Download a generated report file',
        tags: ['Reports'],
        security: [{ apiKey: [] }],
        params: {
          type: 'object',
          required: ['jobId'],
          properties: {
            jobId: { type: 'string', description: 'Report job ID' },
          },
        },
        response: {
          200: {
            description: 'Report file',
            content: {
              'application/pdf': {
                schema: { type: 'string', format: 'binary' },
              },
              'text/html': {
                schema: { type: 'string' },
              },
              'application/json': {
                schema: { type: 'object' },
              },
              'application/sarif+json': {
                schema: { type: 'object' },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { jobId } = request.params;

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

      // Verify scan:read scope
      if (!request.scopes?.includes('scan:read') && !request.scopes?.includes('admin:*')) {
        return reply.code(403).send({
          type: ERROR_TYPES.AUTH_INSUFFICIENT_SCOPE,
          title: 'Forbidden',
          status: 403,
          detail: 'Insufficient permissions. Required scope: scan:read',
          requestId: request.id,
          timestamp: new Date().toISOString(),
        });
      }

      try {
        const reportFile = await reportService.getReportFile(jobId, request.organizationId);

        // Read file content
        const content = await fs.readFile(reportFile.path);

        // Set appropriate headers
        const fileExtension = reportFile.format.toLowerCase();
        const filename = `report-${jobId}.${fileExtension === 'sarif' ? 'sarif.json' : fileExtension}`;

        return reply
          .header('Content-Type', reportFile.contentType)
          .header('Content-Disposition', `attachment; filename="${filename}"`)
          .send(content);
      } catch (error) {
        if (error instanceof ReportJobNotFoundError) {
          return reply.code(404).send({
            type: ERROR_TYPES.SCAN_NOT_FOUND,
            title: 'Not Found',
            status: 404,
            detail: error.message,
            requestId: request.id,
            timestamp: new Date().toISOString(),
          });
        }
        if (error instanceof ReportNotReadyError) {
          return reply.code(400).send({
            type: ERROR_TYPES.VALIDATION_FAILED,
            title: 'Bad Request',
            status: 400,
            detail: error.message,
            requestId: request.id,
            timestamp: new Date().toISOString(),
          });
        }
        throw error;
      }
    }
  );

  // GET /api/v1/scans/:scanId/reports - List report jobs for a scan
  fastify.get<{
    Params: ScanIdParams;
  }>(
    '/api/v1/scans/:scanId/reports',
    {
      schema: {
        description: 'List all report jobs for a scan',
        tags: ['Reports'],
        security: [{ apiKey: [] }],
        params: {
          type: 'object',
          required: ['scanId'],
          properties: {
            scanId: { type: 'string', description: 'Scan ID' },
          },
        },
        response: {
          200: {
            description: 'List of report jobs',
            type: 'object',
            properties: {
              reports: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    scanId: { type: 'string' },
                    organizationId: { type: 'string' },
                    format: { type: 'string' },
                    template: { type: 'string', nullable: true },
                    status: { type: 'string' },
                    progress: { type: 'number' },
                    outputPath: { type: 'string', nullable: true },
                    errorMessage: { type: 'string', nullable: true },
                    createdAt: { type: 'string', format: 'date-time' },
                    completedAt: { type: 'string', format: 'date-time', nullable: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { scanId } = request.params;

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

      // Verify scan:read scope
      if (!request.scopes?.includes('scan:read') && !request.scopes?.includes('admin:*')) {
        return reply.code(403).send({
          type: ERROR_TYPES.AUTH_INSUFFICIENT_SCOPE,
          title: 'Forbidden',
          status: 403,
          detail: 'Insufficient permissions. Required scope: scan:read',
          requestId: request.id,
          timestamp: new Date().toISOString(),
        });
      }

      const reports = await reportService.listReportJobsForScan(scanId, request.organizationId);
      return reply.send({ reports });
    }
  );
}

export default reportRoutes;
