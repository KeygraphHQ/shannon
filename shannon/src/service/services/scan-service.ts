/**
 * Scan Service - Business logic for scan lifecycle management
 * Handles Temporal workflow integration, concurrent scan limits, and queuing
 */

import { getPrismaClient } from '../db.js';
import {
  startScanWorkflow,
  cancelWorkflow,
  checkTemporalHealth,
  generateWorkflowId,
  getWorkflowStatus,
  listOrgWorkflows,
} from '../temporal-client.js';
import type { PipelineInput } from '../../temporal/shared.js';
import type { CreateScanRequest, ScanJob, ScanStatus } from '../types/api.js';

// Default concurrent scan limit per organization
const DEFAULT_CONCURRENT_SCAN_LIMIT = 3;

// Type for database scan records (from Prisma queries)
interface ScanRecord {
  id: string;
  organizationId: string;
  projectId: string;
  project?: { targetUrl: string };
  status: string;
  temporalWorkflowId: string | null;
  parentScanId: string | null;
  queuedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  metadata?: unknown;
}

export interface ScanServiceConfig {
  concurrentScanLimit?: number;
}

export interface CreateScanOptions {
  organizationId: string;
  apiKeyId: string;
  request: CreateScanRequest;
}

export interface ListScansOptions {
  organizationId: string;
  status?: ScanStatus | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}

export interface ListScansResult {
  scans: ScanJob[];
  nextCursor: string | null;
  total: number;
}

export class ScanService {
  private config: Required<ScanServiceConfig>;

  constructor(config: ScanServiceConfig = {}) {
    this.config = {
      concurrentScanLimit: config.concurrentScanLimit ?? DEFAULT_CONCURRENT_SCAN_LIMIT,
    };
  }

  /**
   * Create a new scan
   * Handles concurrent limit enforcement and queuing when Temporal unavailable
   */
  async createScan(options: CreateScanOptions): Promise<ScanJob> {
    const { organizationId, apiKeyId, request } = options;
    const prisma = await getPrismaClient();

    // Check concurrent scan limit
    const runningScans = await this.getRunningScansCount(organizationId);
    if (runningScans >= this.config.concurrentScanLimit) {
      throw new ScanLimitExceededError(
        `Organization has reached the maximum concurrent scan limit of ${this.config.concurrentScanLimit}`
      );
    }

    // Verify project belongs to organization
    const project = await prisma.project.findFirst({
      where: {
        id: request.projectId,
        organizationId,
      },
    });

    if (!project) {
      throw new ProjectNotFoundError(`Project ${request.projectId} not found or does not belong to organization`);
    }

    // Check Temporal availability
    const temporalAvailable = await checkTemporalHealth();

    // Create scan record
    const scan = await prisma.scan.create({
      data: {
        organizationId,
        projectId: request.projectId,
        status: temporalAvailable ? 'RUNNING' : 'PENDING',
        source: 'API',
        apiKeyId,
        queuedAt: temporalAvailable ? null : new Date(),
        metadata: request.config ? { config: request.config } : null,
      },
      include: {
        project: true,
      },
    });

    // Start Temporal workflow if available
    if (temporalAvailable) {
      try {
        const workflowId = generateWorkflowId(organizationId, scan.id);
        const workflowInput: PipelineInput = {
          webUrl: request.targetUrl,
          repoPath: project.repositoryUrl || '',
          scanId: scan.id,
          organizationId,
          workflowId,
        };

        await startScanWorkflow(workflowInput, workflowId);

        // Update scan with workflow ID
        await prisma.scan.update({
          where: { id: scan.id },
          data: {
            temporalWorkflowId: workflowId,
            startedAt: new Date(),
          },
        });
      } catch (error) {
        // If workflow start fails, mark scan as queued for retry
        await prisma.scan.update({
          where: { id: scan.id },
          data: {
            status: 'PENDING',
            queuedAt: new Date(),
            errorMessage: error instanceof Error ? error.message : 'Failed to start workflow',
          },
        });
      }
    }

    // Fetch updated scan
    const updatedScan = await prisma.scan.findUnique({
      where: { id: scan.id },
      include: { project: true },
    });

    return this.mapToScanJob(updatedScan!);
  }

  /**
   * Get a single scan by ID
   */
  async getScan(scanId: string, organizationId: string): Promise<ScanJob> {
    const prisma = await getPrismaClient();

    const scan = await prisma.scan.findFirst({
      where: {
        id: scanId,
        organizationId,
      },
      include: { project: true },
    });

    if (!scan) {
      throw new ScanNotFoundError(`Scan ${scanId} not found`);
    }

    return this.mapToScanJob(scan);
  }

  /**
   * List scans for an organization with pagination
   */
  async listScans(options: ListScansOptions): Promise<ListScansResult> {
    const { organizationId, status, limit = 20, cursor } = options;
    const prisma = await getPrismaClient();

    // Build where clause
    const where: Record<string, unknown> = { organizationId };
    if (status) {
      where.status = status;
    }

    // Cursor-based pagination
    const cursorObj = cursor ? { id: cursor } : undefined;

    const [scans, total] = await Promise.all([
      prisma.scan.findMany({
        where,
        include: { project: true },
        orderBy: { createdAt: 'desc' },
        take: limit + 1, // Fetch one extra to check if there are more
        cursor: cursorObj,
        skip: cursor ? 1 : 0, // Skip cursor item itself
      }),
      prisma.scan.count({ where }),
    ]);

    // Determine if there are more results
    const hasMore = scans.length > limit;
    const resultScans = hasMore ? scans.slice(0, limit) : scans;
    const nextCursor = hasMore ? resultScans[resultScans.length - 1].id : null;

    return {
      scans: resultScans.map((s: ScanRecord) => this.mapToScanJob(s)),
      nextCursor,
      total,
    };
  }

  /**
   * Cancel a running or queued scan
   */
  async cancelScan(scanId: string, organizationId: string): Promise<ScanJob> {
    const prisma = await getPrismaClient();

    const scan = await prisma.scan.findFirst({
      where: {
        id: scanId,
        organizationId,
      },
    });

    if (!scan) {
      throw new ScanNotFoundError(`Scan ${scanId} not found`);
    }

    // Check if scan can be cancelled
    if (!['PENDING', 'RUNNING'].includes(scan.status)) {
      throw new ScanCannotBeCancelledError(
        `Scan cannot be cancelled - current status: ${scan.status}`
      );
    }

    // Cancel Temporal workflow if running
    if (scan.temporalWorkflowId && scan.status === 'RUNNING') {
      try {
        await cancelWorkflow(scan.temporalWorkflowId);
      } catch (error) {
        // Log but don't fail if workflow cancellation fails
        console.error('Failed to cancel Temporal workflow:', error);
      }
    }

    // Update scan status
    const updatedScan = await prisma.scan.update({
      where: { id: scanId },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
      },
      include: { project: true },
    });

    return this.mapToScanJob(updatedScan);
  }

  /**
   * Retry a failed scan
   * Creates a new scan with the same configuration, linking to parent
   */
  async retryScan(scanId: string, organizationId: string, apiKeyId: string): Promise<ScanJob> {
    const prisma = await getPrismaClient();

    const parentScan = await prisma.scan.findFirst({
      where: {
        id: scanId,
        organizationId,
      },
      include: { project: true },
    });

    if (!parentScan) {
      throw new ScanNotFoundError(`Scan ${scanId} not found`);
    }

    // Only failed scans can be retried
    if (parentScan.status !== 'FAILED') {
      throw new ScanCannotBeRetriedError(
        `Only failed scans can be retried - current status: ${parentScan.status}`
      );
    }

    // Extract config from parent scan metadata
    const parentConfig = parentScan.metadata as { config?: Record<string, unknown> } | null;

    // Create new scan linked to parent
    return this.createScan({
      organizationId,
      apiKeyId,
      request: {
        targetUrl: parentScan.project.targetUrl,
        projectId: parentScan.projectId,
        config: parentConfig?.config,
      },
    });
  }

  /**
   * Sync scan status with Temporal workflow status
   * Called periodically or on-demand to ensure database reflects actual state
   */
  async syncScanStatus(scanId: string): Promise<ScanJob> {
    const prisma = await getPrismaClient();

    const scan = await prisma.scan.findUnique({
      where: { id: scanId },
      include: { project: true },
    });

    if (!scan || !scan.temporalWorkflowId) {
      throw new ScanNotFoundError(`Scan ${scanId} not found or has no workflow`);
    }

    // Only sync if scan is in a non-terminal state
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(scan.status)) {
      return this.mapToScanJob(scan);
    }

    const workflowStatus = await getWorkflowStatus(scan.temporalWorkflowId);

    // Map Temporal status to scan status
    let newStatus: ScanStatus = scan.status as ScanStatus;
    let completedAt: Date | null = null;

    switch (workflowStatus) {
      case 'COMPLETED':
        newStatus = 'COMPLETED';
        completedAt = new Date();
        break;
      case 'FAILED':
        newStatus = 'FAILED';
        completedAt = new Date();
        break;
      case 'CANCELED':
        newStatus = 'CANCELLED';
        completedAt = new Date();
        break;
      case 'RUNNING':
        newStatus = 'RUNNING';
        break;
    }

    // Update if status changed
    if (newStatus !== scan.status || completedAt) {
      const updatedScan = await prisma.scan.update({
        where: { id: scanId },
        data: {
          status: newStatus,
          completedAt,
        },
        include: { project: true },
      });
      return this.mapToScanJob(updatedScan);
    }

    return this.mapToScanJob(scan);
  }

  /**
   * Process queued scans when Temporal becomes available
   */
  async processQueuedScans(organizationId?: string): Promise<number> {
    const prisma = await getPrismaClient();

    // Check Temporal availability first
    const temporalAvailable = await checkTemporalHealth();
    if (!temporalAvailable) {
      return 0;
    }

    // Build where clause
    const where: Record<string, unknown> = {
      status: 'PENDING',
      queuedAt: { not: null },
    };
    if (organizationId) {
      where.organizationId = organizationId;
    }

    // Find queued scans
    const queuedScans = await prisma.scan.findMany({
      where,
      include: { project: true },
      orderBy: { queuedAt: 'asc' },
      take: 10, // Process in batches
    });

    let processedCount = 0;

    for (const scan of queuedScans) {
      // Check concurrent limit before processing each scan
      const runningScans = await this.getRunningScansCount(scan.organizationId);
      if (runningScans >= this.config.concurrentScanLimit) {
        continue; // Skip this org, they're at limit
      }

      try {
        const workflowId = generateWorkflowId(scan.organizationId, scan.id);
        const workflowInput: PipelineInput = {
          webUrl: scan.project.targetUrl,
          repoPath: scan.project.repositoryUrl || '',
          scanId: scan.id,
          organizationId: scan.organizationId,
          workflowId,
        };

        await startScanWorkflow(workflowInput, workflowId);

        await prisma.scan.update({
          where: { id: scan.id },
          data: {
            status: 'RUNNING',
            temporalWorkflowId: workflowId,
            startedAt: new Date(),
            queuedAt: null,
            errorMessage: null,
          },
        });

        processedCount++;
      } catch (error) {
        console.error(`Failed to process queued scan ${scan.id}:`, error);
      }
    }

    return processedCount;
  }

  /**
   * Get count of running scans for an organization
   */
  async getRunningScansCount(organizationId: string): Promise<number> {
    const prisma = await getPrismaClient();

    return prisma.scan.count({
      where: {
        organizationId,
        status: 'RUNNING',
      },
    });
  }

  /**
   * Get concurrent scan limit for organization
   */
  getConcurrentScanLimit(): number {
    return this.config.concurrentScanLimit;
  }

  /**
   * Map database scan to API ScanJob type
   */
  private mapToScanJob(scan: {
    id: string;
    organizationId: string;
    projectId: string;
    project?: { targetUrl: string };
    status: string;
    temporalWorkflowId: string | null;
    parentScanId: string | null;
    queuedAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    metadata?: unknown;
  }): ScanJob {
    return {
      id: scan.id,
      organizationId: scan.organizationId,
      projectId: scan.projectId,
      targetUrl: scan.project?.targetUrl || '',
      status: scan.status as ScanStatus,
      workflowId: scan.temporalWorkflowId,
      parentScanId: scan.parentScanId,
      queuedAt: scan.queuedAt,
      startedAt: scan.startedAt,
      completedAt: scan.completedAt,
      createdAt: scan.createdAt,
      updatedAt: scan.updatedAt,
    };
  }
}

// Custom error classes
export class ScanServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScanServiceError';
  }
}

export class ScanNotFoundError extends ScanServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'ScanNotFoundError';
  }
}

export class ScanLimitExceededError extends ScanServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'ScanLimitExceededError';
  }
}

export class ScanCannotBeCancelledError extends ScanServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'ScanCannotBeCancelledError';
  }
}

export class ScanCannotBeRetriedError extends ScanServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'ScanCannotBeRetriedError';
  }
}

export class ProjectNotFoundError extends ScanServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectNotFoundError';
  }
}

// Singleton instance
let scanServiceInstance: ScanService | null = null;

export function getScanService(config?: ScanServiceConfig): ScanService {
  if (!scanServiceInstance) {
    scanServiceInstance = new ScanService(config);
  }
  return scanServiceInstance;
}

export default ScanService;
