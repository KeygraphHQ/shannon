/**
 * Vitest Workspace Configuration Schema
 * Location: vitest.workspace.ts (repository root)
 *
 * Defines the workspace configuration for running tests across the monorepo.
 */

import { defineWorkspace } from 'vitest/config';

/**
 * Expected workspace configuration structure
 */
export const workspaceConfig = defineWorkspace([
  // Shannon package configuration
  'shannon/vitest.config.ts',
  // GhostShell package configuration
  'ghostshell/vitest.config.ts',
]);

/**
 * Type definition for workspace configuration
 */
export type WorkspaceConfig = ReturnType<typeof defineWorkspace>;
