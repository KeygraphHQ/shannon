/**
 * `shannon update` command — pull the worker image matching the current CLI version.
 */

import { pullImage } from '../docker.js';

export function update(version: string): void {
  pullImage(version);
  console.log('Update complete.');
}
