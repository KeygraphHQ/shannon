// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * save_deliverable MCP Tool
 *
 * Saves deliverable files with automatic validation.
 * Replaces tools/save_deliverable.js bash script.
 *
 * Uses factory pattern to capture targetDir in closure, avoiding race conditions
 * when multiple workflows run in parallel.
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import * as fs from 'fs';
import * as nodePath from 'path';
import { DeliverableType, DELIVERABLE_FILENAMES, isQueueType } from '../types/deliverables.js';
import { createToolResult, type ToolResult, type SaveDeliverableResponse } from '../types/tool-responses.js';
import { validateQueueJson } from '../validation/queue-validator.js';
import { saveDeliverableFile } from '../utils/file-operations.js';
import { createValidationError, createGenericError } from '../utils/error-formatter.js';

/**
 * Input schema for save_deliverable tool
 * Accepts either inline content OR a file_path to read content from (for large reports).
 */
export const SaveDeliverableInputSchema = z.object({
  deliverable_type: z.nativeEnum(DeliverableType).describe('Type of deliverable to save'),
  content: z.string().optional().describe('File content (markdown for analysis/evidence, JSON for queues). Optional if file_path is provided.'),
  file_path: z.string().optional().describe('Path to a file to read content from. Use this for large reports to avoid output token limits.'),
});

export type SaveDeliverableInput = z.infer<typeof SaveDeliverableInputSchema>;

/**
 * Create save_deliverable handler with targetDir captured in closure
 *
 * This factory pattern ensures each MCP server instance has its own targetDir,
 * preventing race conditions when multiple workflows run in parallel.
 */
function createSaveDeliverableHandler(targetDir: string) {
  return async function saveDeliverable(args: SaveDeliverableInput): Promise<ToolResult> {
    try {
      const { deliverable_type } = args;

      // Resolve content: either from inline content or by reading file_path
      let content: string;
      if (args.file_path) {
        const resolvedPath = nodePath.isAbsolute(args.file_path)
          ? args.file_path
          : nodePath.join(targetDir, args.file_path);
        if (!fs.existsSync(resolvedPath)) {
          const errorResponse = createGenericError(
            new Error(`File not found: ${resolvedPath}`),
            true,
            { deliverableType: deliverable_type }
          );
          return createToolResult(errorResponse);
        }
        content = fs.readFileSync(resolvedPath, 'utf-8');
      } else if (args.content) {
        content = args.content;
      } else {
        const errorResponse = createGenericError(
          new Error('Either content or file_path must be provided'),
          true,
          { deliverableType: deliverable_type }
        );
        return createToolResult(errorResponse);
      }

      // Validate queue JSON if applicable
      if (isQueueType(deliverable_type)) {
        const queueValidation = validateQueueJson(content);
        if (!queueValidation.valid) {
          const errorResponse = createValidationError(
            queueValidation.message ?? 'Invalid queue JSON',
            true,
            {
              deliverableType: deliverable_type,
              expectedFormat: '{"vulnerabilities": [...]}',
            }
          );
          return createToolResult(errorResponse);
        }
      }

      // Get filename and save file (targetDir captured from closure)
      const filename = DELIVERABLE_FILENAMES[deliverable_type];
      const filepath = saveDeliverableFile(targetDir, filename, content);

      // Success response
      const successResponse: SaveDeliverableResponse = {
        status: 'success',
        message: `Deliverable saved successfully: ${filename}`,
        filepath,
        deliverableType: deliverable_type,
        validated: isQueueType(deliverable_type),
      };

      return createToolResult(successResponse);
    } catch (error) {
      const errorResponse = createGenericError(
        error,
        false,
        { deliverableType: args.deliverable_type }
      );

      return createToolResult(errorResponse);
    }
  };
}

/**
 * Factory function to create save_deliverable tool with targetDir in closure
 *
 * Each MCP server instance should call this with its own targetDir to ensure
 * deliverables are saved to the correct workflow's directory.
 */
export function createSaveDeliverableTool(targetDir: string) {
  return tool(
    'save_deliverable',
    'Saves deliverable files with automatic validation. Queue files must have {"vulnerabilities": [...]} structure.',
    SaveDeliverableInputSchema.shape,
    createSaveDeliverableHandler(targetDir)
  );
}
