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
import fs from 'node:fs';
import path from 'node:path';
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
  content: z.string().min(1).optional().describe('File content (markdown for analysis/evidence, JSON for queues). Optional if file_path is provided.'),
  file_path: z.string().optional().describe('Path to a file whose contents should be used as the deliverable content. Relative paths are resolved against the deliverables directory. Use this instead of content for large reports to avoid output token limits.'),
});

export type SaveDeliverableInput = z.infer<typeof SaveDeliverableInputSchema>;

/**
 * Check if a path is contained within a base directory.
 * Prevents path traversal attacks (e.g., ../../../etc/passwd).
 */
function isPathContained(basePath: string, targetPath: string): boolean {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget === resolvedBase || resolvedTarget.startsWith(resolvedBase + path.sep);
}

/**
 * Resolve deliverable content from either inline content or a file path.
 * Returns the content string on success, or a ToolResult error on failure.
 */
function resolveContent(
  args: SaveDeliverableInput,
  targetDir: string,
): string | ToolResult {
  if (args.content) {
    return args.content;
  }

  if (!args.file_path) {
    return createToolResult(createValidationError(
      'Either "content" or "file_path" must be provided',
      true,
      { deliverableType: args.deliverable_type },
    ));
  }

  const resolvedPath = path.isAbsolute(args.file_path)
    ? args.file_path
    : path.resolve(targetDir, args.file_path);

  // Security: Prevent path traversal outside targetDir
  if (!isPathContained(targetDir, resolvedPath)) {
    return createToolResult(createValidationError(
      `Path "${args.file_path}" resolves outside allowed directory`,
      false,
      { deliverableType: args.deliverable_type, allowedBase: targetDir },
    ));
  }

  try {
    return fs.readFileSync(resolvedPath, 'utf-8');
  } catch (readError) {
    return createToolResult(createValidationError(
      `Failed to read file at ${resolvedPath}: ${readError instanceof Error ? readError.message : String(readError)}`,
      true,
      { deliverableType: args.deliverable_type, filePath: resolvedPath },
    ));
  }
}

/**
 * Create save_deliverable handler with targetDir captured in closure.
 *
 * This factory pattern ensures each MCP server instance has its own targetDir,
 * preventing race conditions when multiple workflows run in parallel.
 */
function createSaveDeliverableHandler(targetDir: string) {
  return async function saveDeliverable(args: SaveDeliverableInput): Promise<ToolResult> {
    try {
      const { deliverable_type } = args;

      const contentOrError = resolveContent(args, targetDir);
      if (typeof contentOrError !== 'string') {
        return contentOrError;
      }
      const content = contentOrError;

      if (isQueueType(deliverable_type)) {
        const queueValidation = validateQueueJson(content);
        if (!queueValidation.valid) {
          return createToolResult(createValidationError(
            queueValidation.message ?? 'Invalid queue JSON',
            true,
            { deliverableType: deliverable_type, expectedFormat: '{"vulnerabilities": [...]}' },
          ));
        }
      }

      const filename = DELIVERABLE_FILENAMES[deliverable_type];
      const filepath = saveDeliverableFile(targetDir, filename, content);

      const successResponse: SaveDeliverableResponse = {
        status: 'success',
        message: `Deliverable saved successfully: ${filename}`,
        filepath,
        deliverableType: deliverable_type,
        validated: isQueueType(deliverable_type),
      };

      return createToolResult(successResponse);
    } catch (error) {
      return createToolResult(createGenericError(
        error,
        false,
        { deliverableType: args.deliverable_type },
      ));
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
    'Saves deliverable files with automatic validation. Queue files must have {"vulnerabilities": [...]} structure. For large reports, write the file to disk first then pass file_path instead of inline content to avoid output token limits.',
    SaveDeliverableInputSchema.shape,
    createSaveDeliverableHandler(targetDir)
  );
}
