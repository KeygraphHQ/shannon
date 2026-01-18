// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Queue Validator
 *
 * Validates JSON structure for vulnerability queue files.
 * Ported from tools/save_deliverable.js (lines 56-75).
 */

import type { VulnerabilityQueue } from '../types/deliverables.js';

export interface ValidationResult {
  valid: boolean;
  message?: string;
  data?: VulnerabilityQueue;
}

/**
 * Validate JSON structure for queue files
 * Queue files must have a 'vulnerabilities' array
 */
export function validateQueueJson(content: string): ValidationResult {
  try {
    const parsed = JSON.parse(content) as unknown;

    // Type guard for the parsed result
    if (typeof parsed !== 'object' || parsed === null) {
      return {
        valid: false,
        message: `Invalid queue structure: Expected an object. Got: ${typeof parsed}`,
      };
    }

    const obj = parsed as Record<string, unknown>;

    // Queue files must have a 'vulnerabilities' array
    if (!('vulnerabilities' in obj)) {
      return {
        valid: false,
        message: `Invalid queue structure: Missing 'vulnerabilities' property. Expected: {"vulnerabilities": [...]}`,
      };
    }

    if (!Array.isArray(obj.vulnerabilities)) {
      return {
        valid: false,
        message: `Invalid queue structure: 'vulnerabilities' must be an array. Expected: {"vulnerabilities": [...]}`,
      };
    }

    return {
      valid: true,
      data: parsed as VulnerabilityQueue,
    };
  } catch (error) {
    return {
      valid: false,
      message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
