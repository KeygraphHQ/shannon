/**
 * `shannon build` command — build the worker Docker image from the repository.
 * Requires a clone (Dockerfile in the working directory).
 */

import { buildImage, canBuildImage, ensureDocker } from '../docker.js';

export function build(noCache: boolean, version: string): void {
  ensureDocker();

  if (!canBuildImage()) {
    console.error('ERROR: Build is only available when running from the Shannon repository');
    console.error('  (Dockerfile not found in current directory)');
    process.exit(1);
  }

  buildImage(noCache, version);
}
