// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * MCP client for OpenAI provider - manages Shannon helper tools (direct calls)
 * and Playwright MCP server (stdio protocol).
 */

import { createSaveDeliverableHandler, generateTotp } from '../../mcp-server/dist/index.js';
import type { DeliverableType } from '../../mcp-server/dist/types/deliverables.js';
import type { OpenAITool } from './openai-tools.js';

export interface StdioMcpConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
}

/**
 * Shannon helper tools - OpenAI format definitions.
 * Handlers are called directly (no MCP protocol).
 */
const DELIVERABLE_TYPES = [
  'CODE_ANALYSIS', 'RECON',
  'INJECTION_ANALYSIS', 'INJECTION_QUEUE', 'XSS_ANALYSIS', 'XSS_QUEUE',
  'AUTH_ANALYSIS', 'AUTH_QUEUE', 'AUTHZ_ANALYSIS', 'AUTHZ_QUEUE',
  'SSRF_ANALYSIS', 'SSRF_QUEUE',
  'INJECTION_EVIDENCE', 'XSS_EVIDENCE', 'AUTH_EVIDENCE', 'AUTHZ_EVIDENCE', 'SSRF_EVIDENCE',
];

export function getShannonHelperTools(targetDir: string): {
  tools: OpenAITool[];
  execute: (name: string, args: Record<string, unknown>) => Promise<string>;
} {
  const saveDeliverableHandler = createSaveDeliverableHandler(targetDir);

  const tools: OpenAITool[] = [
    {
      type: 'function',
      function: {
        name: 'save_deliverable',
        description: 'Saves deliverable files with automatic validation. Queue files must have {"vulnerabilities": [...]} structure.',
        parameters: {
          type: 'object',
          properties: {
            deliverable_type: {
              type: 'string',
              description: `Type of deliverable to save. One of: ${DELIVERABLE_TYPES.join(', ')}`,
            },
            content: {
              type: 'string',
              description: 'File content (markdown for analysis/evidence, JSON for queues)',
            },
          },
          required: ['deliverable_type', 'content'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'generate_totp',
        description: 'Generates 6-digit TOTP code for authentication. Secret must be base32-encoded.',
        parameters: {
          type: 'object',
          properties: {
            secret: {
              type: 'string',
              description: 'Base32-encoded TOTP secret',
            },
          },
          required: ['secret'],
        },
      },
    },
  ];

  async function execute(name: string, args: Record<string, unknown>): Promise<string> {
    if (name === 'save_deliverable') {
      const result = await saveDeliverableHandler({
        deliverable_type: args.deliverable_type as DeliverableType,
        content: args.content as string,
      });
      return result.content[0]?.text ?? JSON.stringify(result);
    }
    if (name === 'generate_totp') {
      const result = await generateTotp({ secret: args.secret as string });
      return result.content[0]?.text ?? JSON.stringify(result);
    }
    return JSON.stringify({ error: `Unknown Shannon helper tool: ${name}` });
  }

  return { tools, execute };
}

export interface PlaywrightMcpClient {
  tools: OpenAITool[];
  executeTool: (name: string, args: Record<string, unknown>) => Promise<string>;
  close: () => void;
}

/**
 * Create Playwright MCP client - spawns stdio process and connects via MCP protocol.
 * Uses dynamic import for @modelcontextprotocol/sdk to avoid loading when not in OpenAI mode.
 */
export async function createPlaywrightMcpClient(
  config: StdioMcpConfig
): Promise<PlaywrightMcpClient> {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: config.env,
  });

  const client = new Client({
    name: 'shannon-openai',
    version: '1.0.0',
  });

  await client.connect(transport);

  const mcpTools = await client.listTools();
  const tools = mcpTools.tools.map((t) => {
    const schema = (t.inputSchema as { type?: string; properties?: Record<string, unknown>; required?: string[] }) ?? {};
    return {
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description ?? '',
        parameters: {
          type: 'object' as const,
          properties: (schema.properties ?? {}) as Record<string, { type: string; description?: string; items?: { type: string } }>,
          required: schema.required,
        },
      },
    };
  }) as OpenAITool[];

  async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content;
    if (Array.isArray(content) && content.length > 0) {
      const part = content[0];
      if (part && 'text' in part) {
        return part.text;
      }
    }
    return JSON.stringify(content);
  }

  return {
    tools,
    executeTool,
    close: () => client.close(),
  };
}
