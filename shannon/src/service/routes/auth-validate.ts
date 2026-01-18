/**
 * Auth Validation Routes - Credential validation endpoints
 * Implements POST /api/v1/auth/validate for testing credentials before scans
 *
 * SECURITY: Credentials are NEVER logged - only outcomes and error codes are recorded
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getValidationService, type Credentials } from '../services/validation-service.js';
import {
  ValidationRequestSchema,
  type AuthMethod,
  VALIDATION_ERROR_CODES,
} from '../types/api.js';

// Request body schema for OpenAPI documentation
const ValidationRequestBodySchema = {
  type: 'object',
  required: ['targetUrl', 'authMethod', 'credentials'],
  properties: {
    targetUrl: {
      type: 'string',
      format: 'uri',
      description: 'Target application URL to validate against',
    },
    authMethod: {
      type: 'string',
      enum: ['form', 'api_token', 'basic', 'sso'],
      description: 'Authentication method to use',
    },
    credentials: {
      type: 'object',
      description: 'Method-specific credentials (structure varies by authMethod)',
      additionalProperties: true,
    },
    totpSecret: {
      type: 'string',
      description: 'TOTP secret for 2FA (optional)',
    },
  },
} as const;

// Response schemas
const ValidationResultSchema = {
  type: 'object',
  properties: {
    valid: {
      type: 'boolean',
      description: 'Whether the credentials are valid',
    },
    validatedAt: {
      type: 'string',
      format: 'date-time',
      description: 'Timestamp when validation was performed',
    },
    error: {
      type: 'string',
      description: 'Error message if validation failed',
    },
    errorCode: {
      type: 'string',
      description: 'Machine-readable error code',
      enum: Object.keys(VALIDATION_ERROR_CODES),
    },
  },
} as const;

// Request interface for type safety
interface ValidateAuthBody {
  targetUrl: string;
  authMethod: AuthMethod;
  credentials: Credentials;
  totpSecret?: string;
}

/**
 * Register auth validation routes
 * These endpoints require API key authentication with auth:validate scope
 */
export async function authValidateRoutes(app: FastifyInstance): Promise<void> {
  const validationService = getValidationService();

  /**
   * POST /api/v1/auth/validate - Validate authentication credentials
   *
   * Tests provided credentials against target without starting a full scan.
   * Useful for verifying credentials before initiating a pentest.
   *
   * SECURITY NOTES:
   * - Credentials are NEVER logged (only outcomes and error codes)
   * - 60-second timeout to prevent hanging connections
   * - Rate limited to prevent credential stuffing attacks
   */
  app.post<{
    Body: ValidateAuthBody;
  }>('/api/v1/auth/validate', {
    schema: {
      tags: ['Auth Validation'],
      summary: 'Validate authentication credentials',
      description: `
Tests provided credentials against target application without starting a full scan.
Credentials are NOT stored or logged - only the validation outcome is recorded.

**Supported Auth Methods:**
- \`form\`: Form-based login (requires loginUrl, username, password, field selectors)
- \`api_token\`: API token/key authentication
- \`basic\`: HTTP Basic Authentication
- \`sso\`: Single Sign-On (requires provider, idpUrl, credentials)

**Timeout:** 60 seconds (returns timeout error if exceeded)
      `.trim(),
      security: [{ apiKey: [] }],
      body: ValidationRequestBodySchema,
      response: {
        200: {
          description: 'Validation result',
          ...ValidationResultSchema,
        },
        400: {
          description: 'Invalid request body',
          type: 'object',
          properties: {
            type: { type: 'string' },
            title: { type: 'string' },
            status: { type: 'number' },
            detail: { type: 'string' },
            requestId: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        401: {
          description: 'Missing or invalid API key',
          type: 'object',
          properties: {
            type: { type: 'string' },
            title: { type: 'string' },
            status: { type: 'number' },
            detail: { type: 'string' },
            requestId: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        403: {
          description: 'API key lacks auth:validate scope',
          type: 'object',
          properties: {
            type: { type: 'string' },
            title: { type: 'string' },
            status: { type: 'number' },
            detail: { type: 'string' },
            requestId: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        504: {
          description: 'Validation timed out',
          type: 'object',
          properties: {
            type: { type: 'string' },
            title: { type: 'string' },
            status: { type: 'number' },
            detail: { type: 'string' },
            requestId: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
      // Verify authentication
      if (!request.organizationId || !request.apiKeyId) {
        return reply.status(401).send({
          type: 'https://shannon.dev/errors/auth/missing-key',
          title: 'Authentication Required',
          status: 401,
          detail: 'API key required for this endpoint',
          requestId: request.id,
          timestamp: new Date().toISOString(),
        });
      }

      // Verify scope
      const scopes = request.scopes || [];
      if (!scopes.includes('auth:validate') && !scopes.includes('admin:*')) {
        return reply.status(403).send({
          type: 'https://shannon.dev/errors/auth/insufficient-scope',
          title: 'Insufficient Permissions',
          status: 403,
          detail: 'API key requires auth:validate scope',
          requestId: request.id,
          timestamp: new Date().toISOString(),
        });
      }
    },
  }, async (request, reply) => {
    const { targetUrl, authMethod, credentials, totpSecret } = request.body;

    // Validate request body with Zod
    const parseResult = ValidationRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      // Log validation error (NOT credentials)
      request.log.warn({
        requestId: request.id,
        errors: parseResult.error.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      }, 'Auth validation request failed schema validation');

      return reply.status(400).send({
        type: 'https://shannon.dev/errors/validation-failed',
        title: 'Validation Failed',
        status: 400,
        detail: 'Request body validation failed',
        requestId: request.id,
        timestamp: new Date().toISOString(),
        errors: parseResult.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
    }

    // Log validation attempt (WITHOUT credentials)
    request.log.info({
      requestId: request.id,
      organizationId: request.organizationId,
      targetUrl,
      authMethod,
      hasTotpSecret: !!totpSecret,
    }, 'Auth validation request received');

    try {
      // Perform validation
      const result = await validationService.validate({
        targetUrl,
        authMethod,
        credentials: credentials as Credentials,
        ...(totpSecret ? { totpSecret } : {}),
      });

      // Log outcome (NOT credentials)
      request.log.info({
        requestId: request.id,
        organizationId: request.organizationId,
        valid: result.valid,
        errorCode: result.errorCode,
      }, 'Auth validation completed');

      // Check for timeout error code
      if (result.errorCode === 'AUTH_TIMEOUT') {
        return reply.status(504).send({
          type: 'https://shannon.dev/errors/auth/timeout',
          title: 'Validation Timeout',
          status: 504,
          detail: result.error || 'Validation request timed out',
          requestId: request.id,
          timestamp: new Date().toISOString(),
        });
      }

      return reply.status(200).send({
        valid: result.valid,
        validatedAt: result.validatedAt.toISOString(),
        error: result.error,
        errorCode: result.errorCode,
      });
    } catch (error) {
      // Log error (NOT credentials)
      request.log.error({
        requestId: request.id,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      }, 'Auth validation failed unexpectedly');

      return reply.status(500).send({
        type: 'https://shannon.dev/errors/internal-error',
        title: 'Internal Server Error',
        status: 500,
        detail: 'An unexpected error occurred during validation',
        requestId: request.id,
        timestamp: new Date().toISOString(),
      });
    }
  });
}

export default authValidateRoutes;
