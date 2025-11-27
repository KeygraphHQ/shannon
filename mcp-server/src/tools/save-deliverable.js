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
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { DeliverableType, DELIVERABLE_FILENAMES, isQueueType } from '../types/deliverables.js';
import { createToolResult } from '../types/tool-responses.js';
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

/**
 * save_deliverable tool implementation
 *
 * @param {Object} args
 * @param {string} args.deliverable_type - Type of deliverable to save
 * @param {string} args.content - File content
 * @returns {Promise<Object>} Tool result
 */
export async function saveDeliverable(args) {
  try {
    const { deliverable_type, content } = args;

    // Validate queue JSON if applicable
    if (isQueueType(deliverable_type)) {
      const queueValidation = validateQueueJson(content);
      if (!queueValidation.valid) {
        const errorResponse = createValidationError(
          queueValidation.message,
          true,
          {
            deliverableType: deliverable_type,
            expectedFormat: '{"vulnerabilities": [...]}',
          }
        );
        return createToolResult(errorResponse);
      }
    }

    // Get filename and save file
    const filename = DELIVERABLE_FILENAMES[deliverable_type];
    const filepath = saveDeliverableFile(filename, content);

    // Success response
    const successResponse = {
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
}

/**
 * Tool definition for MCP server - created using SDK's tool() function
 */
export const saveDeliverableTool = tool(
  'save_deliverable',
  'Saves deliverable files with automatic validation. Queue files must have {"vulnerabilities": [...]} structure.',
  SaveDeliverableInputSchema.shape,
  saveDeliverable
);
