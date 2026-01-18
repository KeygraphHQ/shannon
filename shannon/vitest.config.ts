import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test discovery
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.spec.ts'],
    exclude: ['node_modules', 'dist'],

    // Environment
    environment: 'node',

    // Execution
    testTimeout: 30000, // 30 seconds per test

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules',
        'dist',
        '__tests__',
        '**/*.d.ts',
        '**/types/**',
      ],
      // Threshold enforcement for new/changed code (70% minimum)
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
});
