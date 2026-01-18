import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  // Shannon package - Node.js environment
  {
    test: {
      name: 'shannon',
      root: './shannon',
      include: ['__tests__/**/*.test.ts', '__tests__/**/*.spec.ts'],
      exclude: ['node_modules', 'dist'],
      environment: 'node',
      testTimeout: 30000,
    },
  },
  // GhostShell package - happy-dom environment for React
  {
    test: {
      name: 'ghostshell',
      root: './ghostshell',
      include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
      exclude: ['node_modules', '.next'],
      environment: 'happy-dom',
      testTimeout: 30000,
      setupFiles: ['./test-setup.ts'],
    },
  },
]);
