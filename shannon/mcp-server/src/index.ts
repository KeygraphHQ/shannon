// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Shannon Helper MCP Server
 *
 * In-process MCP server providing save_deliverable and generate_totp tools
 * for Shannon penetration testing agents.
 *
 * Replaces bash script invocations with native tool access.
 *
 * Uses factory pattern to create tools with targetDir captured in closure,
 * ensuring thread-safety when multiple workflows run in parallel.
 */

import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { createSaveDeliverableTool } from './tools/save-deliverable.js';
import { generateTotpTool } from './tools/generate-totp.js';

/**
 * Create Shannon Helper MCP Server with target directory context
 *
 * Each workflow should create its own MCP server instance with its targetDir.
 * The save_deliverable tool captures targetDir in a closure, preventing race
 * conditions when multiple workflows run in parallel.
 */
export function createShannonHelperServer(targetDir: string): ReturnType<typeof createSdkMcpServer> {
  // Create save_deliverable tool with targetDir in closure (no global variable)
  const saveDeliverableTool = createSaveDeliverableTool(targetDir);

  return createSdkMcpServer({
    name: 'shannon-helper',
    version: '1.0.0',
    tools: [saveDeliverableTool, generateTotpTool],
  });
}

// Export factory for direct usage if needed
export { createSaveDeliverableTool } from './tools/save-deliverable.js';
export { generateTotpTool } from './tools/generate-totp.js';

// Export types for external use
export * from './types/index.js';
