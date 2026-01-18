/**
 * Vitest Package Configuration Schema
 * Location: {package}/vitest.config.ts
 *
 * Defines the test configuration for individual packages.
 */

import { defineConfig } from 'vitest/config';
import type { UserConfig } from 'vitest/config';

/**
 * Base configuration shared across packages
 */
export interface BaseTestConfig {
  /** Test discovery patterns */
  include: string[];
  /** Patterns to exclude from test discovery */
  exclude: string[];
  /** Test execution timeout in milliseconds (default: 30000) */
  testTimeout: number;
  /** Coverage configuration */
  coverage: CoverageConfig;
}

/**
 * Coverage configuration
 */
export interface CoverageConfig {
  /** Coverage provider */
  provider: 'v8';
  /** Report formats to generate */
  reporter: ('text' | 'html' | 'lcov' | 'json')[];
  /** Coverage thresholds (per clarification: 70-80%) */
  thresholds: {
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  };
  /** Files/patterns to exclude from coverage */
  exclude: string[];
}

/**
 * Shannon package configuration
 * Environment: Node.js (no DOM needed)
 */
export const shannonConfig: UserConfig = {
  test: {
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.spec.ts'],
    exclude: ['node_modules', 'dist'],
    environment: 'node',
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
      },
      exclude: [
        'node_modules',
        'dist',
        '__tests__',
        '**/*.d.ts',
        '**/types/**',
      ],
    },
  },
};

/**
 * GhostShell package configuration
 * Environment: happy-dom (for React component testing)
 */
export const ghostshellConfig: UserConfig = {
  test: {
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
    exclude: ['node_modules', '.next'],
    environment: 'happy-dom',
    testTimeout: 30000,
    setupFiles: ['./test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
      },
      exclude: [
        'node_modules',
        '.next',
        '__tests__',
        '**/*.d.ts',
        'app/**/layout.tsx',
        'app/**/loading.tsx',
        'app/**/error.tsx',
      ],
    },
  },
};
