#!/usr/bin/env node

/**
 * Shannon Desktop MCP Server
 *
 * Entry point for the STDIO-based MCP server that integrates
 * Shannon pentest workflows with Claude Desktop.
 *
 * Usage:
 *   node dist/index.js
 *
 * Environment:
 *   SHANNON_ROOT - Path to Shannon installation (auto-detected if omitted)
 *   ANTHROPIC_API_KEY - Anthropic API key (passed to Docker containers)
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createShannonServer } from './server.js';

async function main(): Promise<void> {
  const server = createShannonServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Shannon MCP server failed to start:', error);
  process.exit(1);
});
