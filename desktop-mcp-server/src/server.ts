/**
 * Shannon MCP Server
 *
 * Registers all tools, resources, and prompts with the MCP server.
 * This is the core server setup that wires everything together.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourceTemplatesRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { PathResolver } from './infrastructure/path-resolver.js';
import { TemporalBridge } from './infrastructure/temporal-client.js';

// Tools
import { startScan, type StartScanInput } from './tools/start-scan.js';
import { queryProgress } from './tools/query-progress.js';
import { stopScan, type StopScanInput } from './tools/stop-scan.js';
import { listScans, type ListScansInput } from './tools/list-scans.js';
import { listConfigs } from './tools/list-configs.js';
import { validateConfig } from './tools/validate-config.js';
import { getReport, type GetReportInput } from './tools/get-report.js';

// Resources
import { listAuditLogResources, readAuditLogResource } from './resources/audit-logs.js';
import { listConfigResources, readConfigResource } from './resources/configs.js';
import { listDeliverableResources, readDeliverableResource } from './resources/deliverables.js';

// Prompts
import { START_PENTEST_PROMPT, buildStartPentestPrompt } from './prompts/start-pentest.js';
import { ANALYZE_RESULTS_PROMPT, buildAnalyzeResultsPrompt } from './prompts/analyze-results.js';

export function createShannonServer(): Server {
  const server = new Server(
    {
      name: 'shannon',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  const paths = new PathResolver();
  const temporal = new TemporalBridge();

  // === Tool Registration ===

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'start_scan',
        description:
          'Start a new Shannon pentest pipeline workflow. Validates the target URL, repo, and config, ensures Docker infrastructure is running, then submits the workflow to Temporal.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            url: {
              type: 'string',
              description: 'Target URL to scan (e.g., https://example.com)',
            },
            repo: {
              type: 'string',
              description: 'Repository folder name under ./repos/ directory',
            },
            config: {
              type: 'string',
              description: 'Config file name in configs/ or absolute path (optional)',
            },
            output: {
              type: 'string',
              description: 'Custom output directory for audit logs (optional)',
            },
            pipeline_testing: {
              type: 'boolean',
              description: 'Use minimal prompts for fast iteration (optional)',
            },
            workflow_id: {
              type: 'string',
              description: 'Custom workflow ID (optional, auto-generated if omitted)',
            },
          },
          required: ['url', 'repo'],
        },
      },
      {
        name: 'query_progress',
        description:
          'Check the status and progress of a running or completed Shannon workflow. Returns current phase, completed agents, metrics, and cost.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            workflow_id: {
              type: 'string',
              description: 'Workflow ID to query (e.g., example.com_shannon-1234567890)',
            },
          },
          required: ['workflow_id'],
        },
      },
      {
        name: 'stop_scan',
        description:
          'Cancel or terminate a running Shannon workflow. Use force=true to immediately terminate instead of graceful cancellation.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            workflow_id: {
              type: 'string',
              description: 'Workflow ID to stop',
            },
            reason: {
              type: 'string',
              description: 'Reason for stopping (logged in Temporal)',
            },
            force: {
              type: 'boolean',
              description: 'Force terminate instead of graceful cancel (default: false)',
            },
          },
          required: ['workflow_id'],
        },
      },
      {
        name: 'list_scans',
        description:
          'List recent and active Shannon workflow executions. Combines data from Temporal and audit-logs.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            status: {
              type: 'string',
              enum: ['running', 'completed', 'failed', 'all'],
              description: 'Filter by workflow status (default: all)',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 10, max: 50)',
            },
          },
        },
      },
      {
        name: 'list_configs',
        description:
          'List available Shannon YAML configuration files with a summary of their contents (auth type, rules count).',
        inputSchema: {
          type: 'object' as const,
          properties: {},
        },
      },
      {
        name: 'validate_config',
        description:
          'Validate a Shannon YAML configuration file against the JSON Schema. Reports any errors found.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            config: {
              type: 'string',
              description: 'Config file name in configs/ or absolute path',
            },
          },
          required: ['config'],
        },
      },
      {
        name: 'get_report',
        description:
          'Retrieve the final pentest report or a specific deliverable from a completed scan.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            workflow_id: {
              type: 'string',
              description: 'Workflow ID of the completed scan',
            },
            deliverable: {
              type: 'string',
              description: 'Specific deliverable filename to read (optional, defaults to main report)',
            },
          },
          required: ['workflow_id'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'start_scan':
        return await startScan(args as unknown as StartScanInput, paths, temporal);

      case 'query_progress':
        return await queryProgress((args as Record<string, string>)['workflow_id']!, paths, temporal);

      case 'stop_scan':
        return await stopScan(args as unknown as StopScanInput, temporal);

      case 'list_scans':
        return await listScans(args as unknown as ListScansInput, paths, temporal);

      case 'list_configs':
        return await listConfigs(paths);

      case 'validate_config':
        return await validateConfig((args as Record<string, string>)['config']!, paths);

      case 'get_report':
        return await getReport(args as unknown as GetReportInput, paths);

      default:
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
          isError: true,
        };
    }
  });

  // === Resource Registration ===

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [
      {
        uriTemplate: 'shannon://audit-logs/{workflowId}/{path}',
        name: 'Audit Log File',
        description: 'Access audit log files for a specific workflow',
        mimeType: 'text/plain',
      },
      {
        uriTemplate: 'shannon://configs/{filename}',
        name: 'Config File',
        description: 'Access Shannon YAML configuration files',
        mimeType: 'text/yaml',
      },
      {
        uriTemplate: 'shannon://deliverables/{workflowId}/{filename}',
        name: 'Deliverable',
        description: 'Access deliverable files from completed scans',
        mimeType: 'text/plain',
      },
    ],
  }));

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const auditResources = await listAuditLogResources(paths);
    const configResources = await listConfigResources(paths);

    return {
      resources: [...auditResources, ...configResources],
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    // Parse the URI
    const parsed = new URL(uri);
    const pathParts = parsed.pathname.split('/').filter(Boolean);

    if (parsed.protocol === 'shannon:') {
      const resourceType = parsed.hostname;

      if (resourceType === 'audit-logs' && pathParts.length >= 1) {
        const workflowId = pathParts[0]!;
        const filePath = pathParts.slice(1).join('/');
        const content = await readAuditLogResource(paths, workflowId, filePath || 'session.json');

        if (content === null) {
          throw new Error(`Resource not found: ${uri}`);
        }

        return {
          contents: [{ uri, text: content, mimeType: 'text/plain' }],
        };
      }

      if (resourceType === 'configs' && pathParts.length >= 1) {
        const filename = pathParts[0]!;
        const content = await readConfigResource(paths, filename);

        if (content === null) {
          throw new Error(`Resource not found: ${uri}`);
        }

        return {
          contents: [{ uri, text: content, mimeType: 'text/yaml' }],
        };
      }

      if (resourceType === 'deliverables' && pathParts.length >= 2) {
        const workflowId = pathParts[0]!;
        const filename = pathParts[1]!;
        const content = await readDeliverableResource(paths, workflowId, filename);

        if (content === null) {
          throw new Error(`Resource not found: ${uri}`);
        }

        return {
          contents: [{ uri, text: content, mimeType: 'text/plain' }],
        };
      }
    }

    throw new Error(`Unknown resource URI: ${uri}`);
  });

  // === Prompt Registration ===

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      START_PENTEST_PROMPT,
      ANALYZE_RESULTS_PROMPT,
    ],
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'start-pentest': {
        const url = args?.['url'];
        if (!url) {
          throw new Error('url argument is required for start-pentest prompt');
        }
        return {
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: buildStartPentestPrompt(url, args?.['repo']),
              },
            },
          ],
        };
      }

      case 'analyze-results': {
        const workflowId = args?.['workflow_id'];
        if (!workflowId) {
          throw new Error('workflow_id argument is required for analyze-results prompt');
        }
        return {
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: buildAnalyzeResultsPrompt(workflowId),
              },
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  });

  // Cleanup on server close
  server.onclose = async () => {
    await temporal.disconnect();
  };

  return server;
}
