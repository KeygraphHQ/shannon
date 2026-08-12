/**
 * `shannon status` command — show running scans and Temporal health.
 */

import { ensureDocker, isTemporalReady, listRunningWorkers } from '../docker.js';

export function status(): void {
  ensureDocker();

  // 1. Temporal health
  const temporalUp = isTemporalReady();
  console.log(`Temporal: ${temporalUp ? 'running' : 'not running'}`);
  if (temporalUp) {
    console.log('  Dashboard: http://localhost:8233');
  }
  console.log('');

  // 2. Running scans
  const workers = listRunningWorkers();
  if (workers) {
    console.log('Running scans:');
    console.log(workers);
  } else {
    console.log('No scans running');
  }
}
