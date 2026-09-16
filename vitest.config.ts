import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Test discovery for the monorepo.
 *
 * Test files live beside their sources under each app's `src` directory. The worker's
 * `tsc` build copies `src` into `dist`, which would otherwise put a compiled copy of
 * every test file back in front of the runner — so `dist` is excluded here rather than
 * by narrowing the build's inputs, which keeps the tests inside the `check` typecheck.
 */
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/dist/**'],
  },
});
