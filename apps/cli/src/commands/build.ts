/**
 * `shannon build` command — build the worker Docker image locally.
 * Only available in local mode (running from cloned repository).
 */

import { buildImage } from '../docker.js';
import { isLocal } from '../mode.js';

export function build(noCache: boolean): void {
  if (!isLocal()) {
    console.error('ERROR: Build is only available when running from the Shannon repository');
    console.error('  (Dockerfile not found in current directory)');
    console.error('');
    console.error('For npx usage, run: shannon update');
    process.exit(1);
  }

  buildImage(noCache);
}
