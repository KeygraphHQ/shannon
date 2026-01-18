/**
 * Progress Service - Real-time scan progress tracking via Temporal workflow queries
 * Provides progress snapshots and agent status for running scans
 */

import { getPrismaClient } from '../db.js';
import { getWorkflowProgress, getWorkflowStatus } from '../temporal-client.js';
import type { PipelineProgress } from '../../temporal/shared.js';
import type { ScanProgress, AgentStatus, ScanStatus } from '../types/api.js';

export interface GetProgressOptions {
  scanId: string;
  organizationId: string;
}

export interface GetResultsOptions {
  scanId: string;
  organizationId: string;
  limit?: number | undefined;
  cursor?: string | undefined;
}

export interface ScanResults {
  scanId: string;
  status: ScanStatus;
  findings: ScanFinding[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  reportPaths: {
    html: string | null;
    pdf: string | null;
    json: string | null;
  } | null;
  nextCursor: string | null;
}

export interface ScanFinding {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  status: string;
  cvss: number | null;
  cwe: string | null;
  remediation: string | null;
}

// Type for database finding records (from Prisma queries)
interface FindingRecord {
  id: string;
  title: string;
  description: string;
  severity: string;
  category: string;
  status: string;
  cvss: number | null;
  cwe: string | null;
  remediation: string | null;
}

export class ProgressService {
  /**
   * Get real-time progress for a scan by querying the Temporal workflow
   */
  async getScanProgress(options: GetProgressOptions): Promise<ScanProgress> {
    const { scanId, organizationId } = options;
    const prisma = await getPrismaClient();

    // Verify scan exists and belongs to organization
    const scan = await prisma.scan.findFirst({
      where: {
        id: scanId,
        organizationId,
      },
    });

    if (!scan) {
      throw new ProgressServiceError(`Scan ${scanId} not found`);
    }

    // For completed/failed/cancelled scans, return cached progress from DB
    if (['COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT'].includes(scan.status)) {
      return this.buildProgressFromDatabase(scan);
    }

    // For pending scans without a workflow, return queued status
    if (!scan.temporalWorkflowId) {
      return {
        scanId: scan.id,
        status: scan.status as ScanStatus,
        phase: 'queued',
        percentage: 0,
        agentStatuses: [],
        startedAt: null,
        eta: null,
        currentActivity: 'Waiting for execution slot...',
      };
    }

    // Query Temporal for live progress
    try {
      const progress = await getWorkflowProgress(scan.temporalWorkflowId);
      return this.mapTemporalProgress(scanId, progress);
    } catch (error) {
      // If query fails, fall back to database progress
      console.error(`Failed to query Temporal progress for scan ${scanId}:`, error);
      return this.buildProgressFromDatabase(scan);
    }
  }

  /**
   * Get results for a completed scan
   */
  async getScanResults(options: GetResultsOptions): Promise<ScanResults> {
    const { scanId, organizationId, limit = 50, cursor } = options;
    const prisma = await getPrismaClient();

    // Verify scan exists, belongs to organization, and is completed
    const scan = await prisma.scan.findFirst({
      where: {
        id: scanId,
        organizationId,
      },
      include: {
        result: true,
      },
    });

    if (!scan) {
      throw new ScanNotFoundError(`Scan ${scanId} not found`);
    }

    if (scan.status !== 'COMPLETED') {
      throw new ScanNotCompletedError(
        `Scan results are not available - current status: ${scan.status}`
      );
    }

    // Fetch findings with pagination
    const cursorObj = cursor ? { id: cursor } : undefined;

    const findings = await prisma.finding.findMany({
      where: { scanId },
      orderBy: [
        { severity: 'asc' }, // Critical first
        { createdAt: 'desc' },
      ],
      take: limit + 1,
      cursor: cursorObj,
      skip: cursor ? 1 : 0,
    });

    // Determine pagination
    const hasMore = findings.length > limit;
    const resultFindings = hasMore ? findings.slice(0, limit) : findings;
    const nextCursor = hasMore ? resultFindings[resultFindings.length - 1].id : null;

    return {
      scanId: scan.id,
      status: scan.status as ScanStatus,
      findings: resultFindings.map((f: FindingRecord) => ({
        id: f.id,
        title: f.title,
        description: f.description,
        severity: f.severity as ScanFinding['severity'],
        category: f.category,
        status: f.status,
        cvss: f.cvss,
        cwe: f.cwe,
        remediation: f.remediation,
      })),
      summary: {
        total: scan.findingsCount,
        critical: scan.criticalCount,
        high: scan.highCount,
        medium: scan.mediumCount,
        low: scan.lowCount,
        info: scan.findingsCount - scan.criticalCount - scan.highCount - scan.mediumCount - scan.lowCount,
      },
      reportPaths: scan.result
        ? {
            html: scan.result.reportHtmlPath,
            pdf: scan.result.reportPdfPath,
            json: null, // JSON path from deliverables
          }
        : null,
      nextCursor,
    };
  }

  /**
   * Estimate completion time based on current progress and historical data
   */
  private estimateCompletionTime(
    startedAt: Date | null,
    percentage: number
  ): Date | null {
    if (!startedAt || percentage <= 0) {
      return null;
    }

    const elapsedMs = Date.now() - startedAt.getTime();
    const estimatedTotalMs = (elapsedMs / percentage) * 100;
    const remainingMs = estimatedTotalMs - elapsedMs;

    // Cap ETA at 4 hours max
    const maxRemainingMs = 4 * 60 * 60 * 1000;
    const cappedRemainingMs = Math.min(remainingMs, maxRemainingMs);

    return new Date(Date.now() + cappedRemainingMs);
  }

  /**
   * Build progress response from database (for completed/failed scans)
   */
  private buildProgressFromDatabase(scan: {
    id: string;
    status: string;
    currentPhase: string | null;
    currentAgent: string | null;
    progressPercent: number;
    startedAt: Date | null;
    completedAt: Date | null;
    errorMessage: string | null;
  }): ScanProgress {
    let percentage = scan.progressPercent;

    // Override percentage based on terminal status
    if (scan.status === 'COMPLETED') {
      percentage = 100;
    } else if (scan.status === 'FAILED' || scan.status === 'CANCELLED' || scan.status === 'TIMEOUT') {
      // Keep the last progress percentage
    }

    return {
      scanId: scan.id,
      status: scan.status as ScanStatus,
      phase: scan.currentPhase || 'unknown',
      percentage,
      agentStatuses: [], // Historical agent statuses not stored in DB
      startedAt: scan.startedAt,
      eta: null, // No ETA for completed scans
      currentActivity: this.getActivityDescription(scan.status, scan.currentAgent, scan.errorMessage),
    };
  }

  /**
   * Map Temporal workflow progress to API response format
   */
  private mapTemporalProgress(scanId: string, progress: PipelineProgress): ScanProgress {
    // Map Temporal agent metrics to agent statuses
    const agentStatuses: AgentStatus[] = [];

    // Add completed agents
    for (const agentId of progress.completedAgents) {
      const metrics = progress.agentMetrics[agentId];
      agentStatuses.push({
        agentId,
        name: this.formatAgentName(agentId),
        status: 'completed',
        startedAt: null, // Not tracked in current implementation
        completedAt: metrics ? new Date() : null, // Approximate
      });
    }

    // Add current agent if running
    if (progress.currentAgent) {
      agentStatuses.push({
        agentId: progress.currentAgent,
        name: this.formatAgentName(progress.currentAgent),
        status: 'running',
        startedAt: null,
        completedAt: null,
      });
    }

    // Add failed agent if any
    if (progress.failedAgent) {
      agentStatuses.push({
        agentId: progress.failedAgent,
        name: this.formatAgentName(progress.failedAgent),
        status: 'failed',
        startedAt: null,
        completedAt: null,
      });
    }

    // Calculate percentage based on completed agents
    const totalAgents = this.getTotalAgentCount();
    const percentage = Math.round((progress.completedAgents.length / totalAgents) * 100);

    // Map Temporal status to scan status
    let status: ScanStatus;
    switch (progress.status) {
      case 'running':
        status = 'RUNNING';
        break;
      case 'completed':
        status = 'COMPLETED';
        break;
      case 'failed':
        status = 'FAILED';
        break;
      default:
        status = 'RUNNING';
    }

    return {
      scanId,
      status,
      phase: progress.currentPhase || 'initializing',
      percentage,
      agentStatuses,
      startedAt: new Date(progress.startTime),
      eta: this.estimateCompletionTime(new Date(progress.startTime), percentage),
      currentActivity: this.getActivityDescription(
        progress.status,
        progress.currentAgent,
        progress.error
      ),
    };
  }

  /**
   * Format agent ID to human-readable name
   */
  private formatAgentName(agentId: string): string {
    // Convert kebab-case to Title Case
    return agentId
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Get total agent count for percentage calculation
   */
  private getTotalAgentCount(): number {
    // Based on session-manager.ts agent queue
    // pre-recon-code + recon + 5 vuln + 5 exploit + report = 13 agents
    return 13;
  }

  /**
   * Generate activity description based on status
   */
  private getActivityDescription(
    status: string,
    currentAgent: string | null,
    error: string | null
  ): string {
    switch (status) {
      case 'running':
        return currentAgent
          ? `Running ${this.formatAgentName(currentAgent)}...`
          : 'Processing...';
      case 'completed':
        return 'Scan completed successfully';
      case 'failed':
        return error ? `Failed: ${error}` : 'Scan failed';
      case 'PENDING':
        return 'Waiting in queue...';
      case 'CANCELLED':
        return 'Scan was cancelled';
      case 'TIMEOUT':
        return 'Scan timed out';
      default:
        return 'Unknown status';
    }
  }
}

// Custom error classes
export class ProgressServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProgressServiceError';
  }
}

export class ScanNotFoundError extends ProgressServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'ScanNotFoundError';
  }
}

export class ScanNotCompletedError extends ProgressServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'ScanNotCompletedError';
  }
}

// Singleton instance
let progressServiceInstance: ProgressService | null = null;

export function getProgressService(): ProgressService {
  if (!progressServiceInstance) {
    progressServiceInstance = new ProgressService();
  }
  return progressServiceInstance;
}

export default ProgressService;
