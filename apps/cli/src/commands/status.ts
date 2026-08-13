/**
 * `shannon status` command — show running scans and Temporal health.
 */

import { ensureDocker, isTemporalReady, listRunningWorkerRows, listRunningWorkers } from '../docker.js';
import type { OutputFormat } from '../format.js';

const DASHBOARD_URL = 'http://localhost:8233';

export function status(format: OutputFormat = 'human'): void {
  ensureDocker();

  const temporalUp = isTemporalReady();

  if (format === 'json') {
    const payload = {
      temporal: { running: temporalUp, ...(temporalUp && { dashboard: DASHBOARD_URL }) },
      scans: listRunningWorkerRows(),
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  if (format === 'plain') {
    for (const worker of listRunningWorkerRows()) {
      process.stdout.write(`${worker.name}\t${worker.status}\t${worker.runningFor}\n`);
    }
    return;
  }

  // 1. Temporal health
  console.log(`Temporal: ${temporalUp ? 'running' : 'not running'}`);
  if (temporalUp) {
    console.log(`  Dashboard: ${DASHBOARD_URL}`);
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
