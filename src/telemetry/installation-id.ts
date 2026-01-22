// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Installation ID - Persistent anonymous identifier for telemetry.
 *
 * Generates a UUID and persists it to ~/.shannon/telemetry-id
 * On subsequent runs, reads the existing ID from the file.
 * Handles errors gracefully by returning a random UUID.
 */

import { randomUUID } from 'crypto';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const SHANNON_DIR = '.shannon';
const TELEMETRY_ID_FILE = 'telemetry-id';

/**
 * Get the path to the telemetry ID file.
 * Returns ~/.shannon/telemetry-id
 */
function getTelemetryIdPath(): string {
  return join(homedir(), SHANNON_DIR, TELEMETRY_ID_FILE);
}

/**
 * Get the path to the Shannon config directory.
 * Returns ~/.shannon
 */
function getShannonDir(): string {
  return join(homedir(), SHANNON_DIR);
}

/**
 * Get or create a persistent installation ID.
 *
 * - If ~/.shannon/telemetry-id exists, reads and returns the ID
 * - If not, generates a new UUID, persists it, and returns it
 * - On any error, returns a random UUID (doesn't persist)
 *
 * @returns Promise<string> - The installation ID (UUID format)
 */
export async function getInstallationId(): Promise<string> {
  const filePath = getTelemetryIdPath();

  try {
    // Try to read existing ID
    const existingId = await readFile(filePath, 'utf-8');
    const trimmedId = existingId.trim();

    // Validate it looks like a UUID (basic check)
    if (trimmedId.length >= 32) {
      return trimmedId;
    }
  } catch {
    // File doesn't exist or can't be read - will create new ID
  }

  // Generate new ID
  const newId = randomUUID();

  try {
    // Ensure ~/.shannon directory exists
    await mkdir(getShannonDir(), { recursive: true });

    // Persist the new ID
    await writeFile(filePath, newId, 'utf-8');
  } catch {
    // Failed to persist - return the ID anyway (won't be persistent)
  }

  return newId;
}
