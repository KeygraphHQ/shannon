/**
 * `shannon build` command — build the worker Docker image from the repository.
 * Requires a clone (Dockerfile in the working directory).
 */

import { buildImage, canBuildImage, ensureDocker } from '../docker.js';
import { fail } from '../errors.js';

export function build(noCache: boolean, version: string): void {
  ensureDocker();

  if (!canBuildImage()) {
    fail(
      'Build is only available when running from the Shannon repository',
      '  (Dockerfile not found in current directory)',
    );
  }

  buildImage(noCache, version);
}
