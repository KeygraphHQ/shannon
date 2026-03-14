/**
 * `shannon status` command — show running workers and Temporal health.
 */

import { isTemporalReady, listRunningWorkers } from '../docker.js';

export function status(): void {
  // 1. Temporal health
  const temporalUp = isTemporalReady();
  console.log(`Temporal: ${temporalUp ? 'running' : 'not running'}`);
  if (temporalUp) {
    console.log('  Web UI: http://localhost:8233');
  }
  console.log('');

  // 2. Running workers
  const workers = listRunningWorkers();
  if (workers) {
    console.log('Workers:');
    console.log(workers);
  } else {
    console.log('Workers: none running');
  }
}
