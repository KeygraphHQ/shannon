import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Exclude Temporal workflow files - they use non-standard imports
    exclude: ['src/temporal/**'],
  },
});
