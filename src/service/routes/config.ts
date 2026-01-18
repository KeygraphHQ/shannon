/**
 * Config Routes - Configuration discovery endpoints for Shannon Service
 * Enables web UI to dynamically build forms based on service capabilities
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getConfigService } from '../services/config-service.js';

/**
 * Register configuration routes
 * These endpoints require API key authentication with config:read scope
 */
export async function configRoutes(app: FastifyInstance): Promise<void> {
  const configService = getConfigService();

  /**
   * GET /api/v1/config/auth-methods - Get supported authentication methods
   * Returns list of auth methods with their required fields for form generation
   */
  app.get('/api/v1/config/auth-methods', {
    schema: {
      tags: ['Configuration'],
      summary: 'Get supported authentication methods',
      description:
        'Returns all supported authentication methods with their required fields. Use this to dynamically generate auth configuration forms in the web UI.',
      security: [{ apiKey: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            methods: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'Unique method identifier' },
                  name: { type: 'string', description: 'Human-readable method name' },
                  description: { type: 'string', description: 'Method description' },
                  requiredFields: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        field: { type: 'string', description: 'Field name/key' },
                        label: { type: 'string', description: 'Display label' },
                        type: {
                          type: 'string',
                          enum: ['text', 'password', 'url', 'number', 'boolean', 'select'],
                          description: 'Input field type',
                        },
                        required: { type: 'boolean', description: 'Whether field is required' },
                        description: { type: 'string', description: 'Field help text' },
                        placeholder: { type: 'string', description: 'Input placeholder text' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        401: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            title: { type: 'string' },
            status: { type: 'number' },
            detail: { type: 'string' },
          },
        },
      },
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const authMethods = configService.getAuthMethods();
    return reply.status(200).send(authMethods);
  });

  /**
   * GET /api/v1/config/scan-options - Get configurable scan options
   * Returns all scan options with defaults, constraints, and valid ranges
   */
  app.get('/api/v1/config/scan-options', {
    schema: {
      tags: ['Configuration'],
      summary: 'Get configurable scan options',
      description:
        'Returns all configurable scan options with their default values, valid ranges, and descriptions. Use this to dynamically generate scan configuration forms.',
      security: [{ apiKey: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            options: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string', description: 'Option key/identifier' },
                  label: { type: 'string', description: 'Display label' },
                  description: { type: 'string', description: 'Option description' },
                  type: {
                    type: 'string',
                    enum: ['number', 'boolean', 'string', 'select'],
                    description: 'Option value type',
                  },
                  default: {
                    oneOf: [
                      { type: 'string' },
                      { type: 'number' },
                      { type: 'boolean' },
                    ],
                    description: 'Default value',
                  },
                  min: { type: 'number', description: 'Minimum value (for numbers)' },
                  max: { type: 'number', description: 'Maximum value (for numbers)' },
                  options: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        value: { type: 'string' },
                        label: { type: 'string' },
                      },
                    },
                    description: 'Valid options (for select type)',
                  },
                },
              },
            },
          },
        },
        401: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            title: { type: 'string' },
            status: { type: 'number' },
            detail: { type: 'string' },
          },
        },
      },
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const scanOptions = configService.getScanOptions();
    return reply.status(200).send(scanOptions);
  });

  /**
   * GET /api/v1/config/phases - Get scan phases
   * Returns all scan phases with descriptions and default enabled status
   */
  app.get('/api/v1/config/phases', {
    schema: {
      tags: ['Configuration'],
      summary: 'Get scan phases',
      description:
        'Returns all scan phases with their descriptions, execution order, and default enabled status. Use this to allow users to customize which phases to run.',
      security: [{ apiKey: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            phases: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'Phase identifier' },
                  name: { type: 'string', description: 'Phase display name' },
                  description: { type: 'string', description: 'Phase description' },
                  defaultEnabled: { type: 'boolean', description: 'Whether phase is enabled by default' },
                  order: { type: 'number', description: 'Execution order (1-based)' },
                  agents: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Agent IDs that run in this phase',
                  },
                },
              },
            },
          },
        },
        401: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            title: { type: 'string' },
            status: { type: 'number' },
            detail: { type: 'string' },
          },
        },
      },
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const phases = configService.getPhases();
    return reply.status(200).send(phases);
  });
}

export default configRoutes;
