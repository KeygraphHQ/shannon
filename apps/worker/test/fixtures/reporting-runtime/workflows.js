// Synthetic runtime fixtures only. No production assessment workflow is imported.
import { condition, defineQuery, proxyActivities, setHandler } from '@temporalio/workflow';

const activities = proxyActivities({
  startToCloseTimeout: '10 seconds',
  scheduleToCloseTimeout: '30 seconds',
  retry: {
    initialInterval: '200 milliseconds',
    maximumInterval: '200 milliseconds',
    backoffCoefficient: 1,
    maximumAttempts: 2,
  },
});
const readyQuery = defineQuery('reportingReady');

export async function reportingLifecycle(input) {
  await activities.beginAttempt(input);
  // Temporal records this workflow-selected timestamp before activity retries.
  const termination = { reason: input.reason, endedAt: new Date().toISOString() };
  return activities.finalizeReport({ ...input, termination });
}

export async function reportingRepair(input) {
  await activities.beginAttempt(input);
  return activities.repairReport(input);
}

export async function reportingWaiting(input) {
  let ready = false;
  setHandler(readyQuery, () => ready);
  await activities.beginAttempt(input);
  ready = true;
  await condition(() => false);
}

export async function reportingSnapshot(input) {
  return activities.publishSnapshot(input);
}

export async function reportingObservedCancellation(input) {
  return activities.observeCancellation(input);
}
