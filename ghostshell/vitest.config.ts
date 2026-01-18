import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test discovery
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
    exclude: ['node_modules', '.next'],

    // Environment - happy-dom for faster React component testing
    environment: 'happy-dom',

    // Execution
    testTimeout: 30000, // 30 seconds per test

    // Setup files for Testing Library
    setupFiles: ['./test-setup.ts'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules',
        '.next',
        '__tests__',
        '**/*.d.ts',
        'app/**/layout.tsx',
        'app/**/loading.tsx',
        'app/**/error.tsx',
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
