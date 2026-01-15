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
import { DeliverableType, DELIVERABLE_FILENAMES, isQueueType } from '../types/deliverables.js';
import { createToolResult, type ToolResult, type SaveDeliverableResponse } from '../types/tool-responses.js';
import { validateQueueJson } from '../validation/queue-validator.js';
import { saveDeliverableFile } from '../utils/file-operations.js';
import { createValidationError, createGenericError } from '../utils/error-formatter.js';

/**
 * Input schema for save_deliverable tool
 */
export const SaveDeliverableInputSchema = z.object({
  deliverable_type: z.nativeEnum(DeliverableType).describe('Type of deliverable to save'),
  content: z.string().min(1).describe('File content (markdown for analysis/evidence, JSON for queues)'),
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
      const { deliverable_type, content } = args;

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
