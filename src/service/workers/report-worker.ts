/**
 * Report Worker - Background processor for report generation jobs
 * Listens for report events and processes report generation asynchronously
 */

import { getPrismaClient } from '../db.js';
import {
  getReportService,
  reportEvents,
  ReportServiceError,
} from '../services/report-service.js';

// Worker configuration
const POLL_INTERVAL_MS = parseInt(process.env.REPORT_WORKER_POLL_INTERVAL || '5000', 10);
const MAX_CONCURRENT_JOBS = parseInt(process.env.REPORT_WORKER_MAX_CONCURRENT || '3', 10);
const RETRY_DELAY_MS = parseInt(process.env.REPORT_WORKER_RETRY_DELAY || '10000', 10);
const MAX_RETRIES = parseInt(process.env.REPORT_WORKER_MAX_RETRIES || '3', 10);

// Track active jobs
const activeJobs = new Set<string>();
let isRunning = false;
let pollInterval: ReturnType<typeof setInterval> | null = null;

// Database report job type for queries
interface DbPendingJob {
  id: string;
  scanId: string;
  organizationId: string;
  format: string;
  status: string;
  createdAt: Date;
}

/**
 * Start the report worker
 * Sets up event listeners and polling for pending jobs
 */
export function startReportWorker(): void {
  if (isRunning) {
    console.log('[ReportWorker] Worker already running');
    return;
  }

  isRunning = true;
  console.log('[ReportWorker] Starting report worker');
  console.log(`[ReportWorker] Poll interval: ${POLL_INTERVAL_MS}ms`);
  console.log(`[ReportWorker] Max concurrent jobs: ${MAX_CONCURRENT_JOBS}`);

  // Listen for new report creation events
  reportEvents.on('report:created', async (job: { id: string }) => {
    console.log(`[ReportWorker] New report job created: ${job.id}`);
    // Try to process immediately if we have capacity
    if (activeJobs.size < MAX_CONCURRENT_JOBS) {
      await processJob(job.id);
    }
  });

  // Set up polling for pending jobs
  pollInterval = setInterval(async () => {
    await pollPendingJobs();
  }, POLL_INTERVAL_MS);

  // Process any pending jobs immediately on startup
  pollPendingJobs().catch((error) => {
    console.error('[ReportWorker] Error during initial poll:', error);
  });
}

/**
 * Stop the report worker
 */
export function stopReportWorker(): void {
  if (!isRunning) {
    return;
  }

  console.log('[ReportWorker] Stopping report worker');
  isRunning = false;

  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  // Remove event listeners
  reportEvents.removeAllListeners('report:created');
}

/**
 * Poll for pending jobs and process them
 */
async function pollPendingJobs(): Promise<void> {
  if (!isRunning) {
    return;
  }

  // Check if we have capacity for more jobs
  const availableSlots = MAX_CONCURRENT_JOBS - activeJobs.size;
  if (availableSlots <= 0) {
    return;
  }

  try {
    const prisma = await getPrismaClient();

    // Find pending jobs that aren't being processed
    const pendingJobs = await prisma.serviceReportJob.findMany({
      where: {
        status: 'PENDING',
        id: {
          notIn: Array.from(activeJobs),
        },
      },
      orderBy: { createdAt: 'asc' },
      take: availableSlots,
    });

    // Process each pending job
    for (const job of pendingJobs) {
      if (activeJobs.size >= MAX_CONCURRENT_JOBS) {
        break;
      }
      // Don't await - process concurrently
      processJob(job.id).catch((error) => {
        console.error(`[ReportWorker] Error processing job ${job.id}:`, error);
      });
    }
  } catch (error) {
    console.error('[ReportWorker] Error polling for pending jobs:', error);
  }
}

/**
 * Process a single report job
 */
async function processJob(jobId: string, retryCount = 0): Promise<void> {
  if (!isRunning || activeJobs.has(jobId)) {
    return;
  }

  activeJobs.add(jobId);
  console.log(`[ReportWorker] Processing job ${jobId} (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);

  const reportService = getReportService();

  try {
    await reportService.processReportJob(jobId);
    console.log(`[ReportWorker] Job ${jobId} completed successfully`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ReportWorker] Job ${jobId} failed:`, errorMessage);

    // Retry logic for transient errors
    if (retryCount < MAX_RETRIES && isRetryableError(error)) {
      console.log(`[ReportWorker] Scheduling retry for job ${jobId} in ${RETRY_DELAY_MS}ms`);
      activeJobs.delete(jobId);

      // Reset job status to PENDING for retry
      try {
        const prisma = await getPrismaClient();
        await prisma.serviceReportJob.update({
          where: { id: jobId },
          data: {
            status: 'PENDING',
            errorMessage: `Retry ${retryCount + 1}: ${errorMessage}`,
          },
        });
      } catch {
        console.error(`[ReportWorker] Failed to reset job ${jobId} for retry`);
      }

      // Schedule retry
      setTimeout(() => {
        processJob(jobId, retryCount + 1).catch((e) => {
          console.error(`[ReportWorker] Retry failed for job ${jobId}:`, e);
        });
      }, RETRY_DELAY_MS);
      return;
    }

    // Mark as permanently failed
    try {
      const prisma = await getPrismaClient();
      await prisma.serviceReportJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          errorMessage: `Failed after ${retryCount + 1} attempts: ${errorMessage}`,
          completedAt: new Date(),
        },
      });
    } catch {
      console.error(`[ReportWorker] Failed to mark job ${jobId} as failed`);
    }
  } finally {
    activeJobs.delete(jobId);
  }
}

/**
 * Determine if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  // Report service errors are generally not retryable (validation, not found, etc.)
  if (error instanceof ReportServiceError) {
    return false;
  }

  // Filesystem errors might be transient
  if (error.message.includes('ENOENT') || error.message.includes('EACCES')) {
    return true;
  }

  // Database connection errors might be transient
  if (
    error.message.includes('Connection') ||
    error.message.includes('timeout') ||
    error.message.includes('ETIMEDOUT')
  ) {
    return true;
  }

  return false;
}

/**
 * Get worker status
 */
export function getWorkerStatus(): {
  isRunning: boolean;
  activeJobs: number;
  activeJobIds: string[];
} {
  return {
    isRunning,
    activeJobs: activeJobs.size,
    activeJobIds: Array.from(activeJobs),
  };
}

/**
 * Manually trigger processing of a specific job
 * Useful for testing or manual intervention
 */
export async function triggerJobProcessing(jobId: string): Promise<void> {
  if (!isRunning) {
    throw new Error('Report worker is not running');
  }

  if (activeJobs.has(jobId)) {
    throw new Error(`Job ${jobId} is already being processed`);
  }

  await processJob(jobId);
}

export default {
  startReportWorker,
  stopReportWorker,
  getWorkerStatus,
  triggerJobProcessing,
};
