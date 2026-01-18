/**
 * Report Service - Business logic for async report generation
 * Handles report job creation, generation in multiple formats, and status tracking
 */

import { getPrismaClient } from '../db.js';
import type {
  ReportFormat,
  ReportJobStatus,
  CreateReportRequest,
  ReportJob,
} from '../types/api.js';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';

// Report output directory (relative to project root)
const REPORT_OUTPUT_DIR = process.env.REPORT_OUTPUT_DIR || './reports';

/**
 * SARIF schema version
 * @see https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 */
const SARIF_SCHEMA_VERSION = '2.1.0';
const SARIF_SCHEMA_URI = 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json';

// Severity to SARIF level mapping
const SEVERITY_TO_SARIF_LEVEL: Record<string, string> = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'note',
  info: 'note',
};

// Severity to SARIF security-severity mapping (CVSS-like scale 0-10)
const SEVERITY_TO_SECURITY_SEVERITY: Record<string, string> = {
  critical: '9.0',
  high: '7.5',
  medium: '5.5',
  low: '3.0',
  info: '1.0',
};

export interface ReportServiceConfig {
  outputDir?: string;
}

export interface CreateReportOptions {
  organizationId: string;
  scanId: string;
  request: CreateReportRequest;
}

// Event emitter for report progress updates
export const reportEvents = new EventEmitter();

// Database finding type
interface DbFinding {
  id: string;
  title: string;
  description: string;
  severity: string;
  category: string;
  status: string;
  cvss: number | null;
  cwe: string | null;
  remediation: string | null;
  evidence: unknown;
}

// Database scan type with included relations
interface DbScan {
  id: string;
  organizationId: string;
  project: {
    name: string;
    targetUrl: string;
  };
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  findings: DbFinding[];
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  findingsCount: number;
  result?: {
    executiveSummary: string | null;
    riskScore: number | null;
  } | null;
}

// Database report job type
interface DbReportJob {
  id: string;
  scanId: string;
  organizationId: string;
  format: string;
  template: string | null;
  status: string;
  progress: number;
  outputPath: string | null;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export class ReportService {
  private config: Required<ReportServiceConfig>;

  constructor(config: ReportServiceConfig = {}) {
    this.config = {
      outputDir: config.outputDir ?? REPORT_OUTPUT_DIR,
    };
  }

  /**
   * Create a new report generation job
   */
  async createReport(options: CreateReportOptions): Promise<ReportJob> {
    const { organizationId, scanId, request } = options;
    const prisma = await getPrismaClient();

    // Verify scan exists and belongs to organization
    const scan = await prisma.scan.findFirst({
      where: {
        id: scanId,
        organizationId,
      },
    });

    if (!scan) {
      throw new ReportScanNotFoundError(`Scan ${scanId} not found`);
    }

    // Verify scan is completed
    if (scan.status !== 'COMPLETED') {
      throw new ReportScanNotCompletedError(
        `Cannot generate report for scan in ${scan.status} status. Scan must be COMPLETED.`
      );
    }

    // Create report job
    const reportJob = await prisma.serviceReportJob.create({
      data: {
        scanId,
        organizationId,
        format: request.format,
        template: request.template || null,
        status: 'PENDING',
        progress: 0,
      },
    });

    // Emit event for background processing
    reportEvents.emit('report:created', reportJob);

    return this.mapToReportJob(reportJob);
  }

  /**
   * Get report job by ID
   */
  async getReportJob(jobId: string, organizationId: string): Promise<ReportJob> {
    const prisma = await getPrismaClient();

    const job = await prisma.serviceReportJob.findFirst({
      where: {
        id: jobId,
        organizationId,
      },
    });

    if (!job) {
      throw new ReportJobNotFoundError(`Report job ${jobId} not found`);
    }

    return this.mapToReportJob(job);
  }

  /**
   * List report jobs for a scan
   */
  async listReportJobsForScan(scanId: string, organizationId: string): Promise<ReportJob[]> {
    const prisma = await getPrismaClient();

    const jobs = await prisma.serviceReportJob.findMany({
      where: {
        scanId,
        organizationId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return jobs.map((job: DbReportJob) => this.mapToReportJob(job));
  }

  /**
   * Process a report job (called by background worker)
   */
  async processReportJob(jobId: string): Promise<void> {
    const prisma = await getPrismaClient();

    // Get job with scan data
    const job = await prisma.serviceReportJob.findUnique({
      where: { id: jobId },
      include: {
        scan: {
          include: {
            project: true,
            findings: true,
            result: true,
          },
        },
      },
    });

    if (!job) {
      throw new ReportJobNotFoundError(`Report job ${jobId} not found`);
    }

    // Update status to GENERATING
    await this.updateJobProgress(jobId, 'GENERATING', 10);

    try {
      // Generate report based on format
      const outputPath = await this.generateReport(job.scan as DbScan, job.format as ReportFormat, job.template);

      // Update job as completed
      await prisma.serviceReportJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          progress: 100,
          outputPath,
          completedAt: new Date(),
        },
      });

      reportEvents.emit('report:completed', { jobId, outputPath });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await prisma.serviceReportJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          errorMessage,
          completedAt: new Date(),
        },
      });

      reportEvents.emit('report:failed', { jobId, error: errorMessage });
      throw error;
    }
  }

  /**
   * Update job progress
   */
  private async updateJobProgress(
    jobId: string,
    status: ReportJobStatus,
    progress: number
  ): Promise<void> {
    const prisma = await getPrismaClient();

    await prisma.serviceReportJob.update({
      where: { id: jobId },
      data: { status, progress },
    });

    reportEvents.emit('report:progress', { jobId, status, progress });
  }

  /**
   * Generate report in the specified format
   */
  private async generateReport(
    scan: DbScan,
    format: ReportFormat,
    template?: string | null
  ): Promise<string> {
    // Ensure output directory exists
    const outputDir = path.join(this.config.outputDir, scan.organizationId, scan.id);
    await fs.mkdir(outputDir, { recursive: true });

    switch (format) {
      case 'PDF':
        return this.generatePdfReport(scan, outputDir, template);
      case 'HTML':
        return this.generateHtmlReport(scan, outputDir, template);
      case 'JSON':
        return this.generateJsonReport(scan, outputDir);
      case 'SARIF':
        return this.generateSarifReport(scan, outputDir);
      default:
        throw new ReportFormatNotSupportedError(`Unsupported report format: ${format}`);
    }
  }

  /**
   * Generate PDF report
   * Uses HTML generation + PDF conversion
   */
  private async generatePdfReport(
    scan: DbScan,
    outputDir: string,
    template?: string | null
  ): Promise<string> {
    const outputPath = path.join(outputDir, 'report.pdf');

    // Generate HTML content first
    const htmlContent = this.generateHtmlContent(scan, template);

    // For now, we'll save HTML and note that PDF conversion requires additional tooling
    // In production, you'd use puppeteer, wkhtmltopdf, or similar
    const htmlPath = path.join(outputDir, 'report-for-pdf.html');
    await fs.writeFile(htmlPath, htmlContent, 'utf-8');

    // Create a placeholder PDF info file until PDF tooling is added
    const pdfInfo = {
      status: 'html_generated',
      htmlPath,
      message: 'HTML content generated. PDF conversion requires puppeteer or similar tooling.',
      generatedAt: new Date().toISOString(),
    };
    await fs.writeFile(outputPath + '.info.json', JSON.stringify(pdfInfo, null, 2), 'utf-8');

    // Write the HTML as PDF placeholder (in production, convert to actual PDF)
    await fs.writeFile(outputPath, htmlContent, 'utf-8');

    return outputPath;
  }

  /**
   * Generate HTML report
   */
  private async generateHtmlReport(
    scan: DbScan,
    outputDir: string,
    template?: string | null
  ): Promise<string> {
    const outputPath = path.join(outputDir, 'report.html');
    const htmlContent = this.generateHtmlContent(scan, template);
    await fs.writeFile(outputPath, htmlContent, 'utf-8');
    return outputPath;
  }

  /**
   * Generate HTML content for a scan
   */
  private generateHtmlContent(scan: DbScan, template?: string | null): string {
    const findings = scan.findings || [];
    const critical = findings.filter((f: DbFinding) => f.severity === 'critical');
    const high = findings.filter((f: DbFinding) => f.severity === 'high');
    const medium = findings.filter((f: DbFinding) => f.severity === 'medium');
    const low = findings.filter((f: DbFinding) => f.severity === 'low');
    const info = findings.filter((f: DbFinding) => f.severity === 'info');

    const severityColors = {
      critical: '#dc2626',
      high: '#ea580c',
      medium: '#ca8a04',
      low: '#2563eb',
      info: '#6b7280',
    } as const;

    const generateFindingsSection = (title: string, items: DbFinding[], color: string) => {
      if (items.length === 0) return '';
      return `
        <div class="findings-section">
          <h3 style="color: ${color};">${title} (${items.length})</h3>
          ${items.map((f: DbFinding) => `
            <div class="finding" style="border-left: 4px solid ${color};">
              <h4>${this.escapeHtml(f.title)}</h4>
              <p class="category">Category: ${this.escapeHtml(f.category)}</p>
              <p>${this.escapeHtml(f.description)}</p>
              ${f.cwe ? `<p class="cwe">CWE: ${this.escapeHtml(f.cwe)}</p>` : ''}
              ${f.remediation ? `<div class="remediation"><strong>Remediation:</strong> ${this.escapeHtml(f.remediation)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      `;
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Security Assessment Report - ${this.escapeHtml(scan.project.name)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      max-width: 1200px;
      margin: 0 auto;
      padding: 40px 20px;
      color: #1f2937;
    }
    .header {
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 20px;
      margin-bottom: 40px;
    }
    .header h1 { margin: 0 0 10px 0; color: #111827; }
    .meta { color: #6b7280; font-size: 14px; }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }
    .summary-card {
      background: #f9fafb;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }
    .summary-card .count { font-size: 36px; font-weight: bold; }
    .summary-card .label { color: #6b7280; font-size: 14px; }
    .findings-section { margin-bottom: 40px; }
    .finding {
      background: #f9fafb;
      padding: 20px;
      margin-bottom: 15px;
      border-radius: 0 8px 8px 0;
    }
    .finding h4 { margin: 0 0 10px 0; }
    .finding .category { color: #6b7280; font-size: 14px; margin-bottom: 10px; }
    .finding .cwe { font-size: 12px; color: #6b7280; }
    .finding .remediation {
      background: #ecfdf5;
      padding: 10px;
      border-radius: 4px;
      margin-top: 10px;
      font-size: 14px;
    }
    .executive-summary {
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 40px;
    }
    .executive-summary h2 { margin-top: 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Security Assessment Report</h1>
    <div class="meta">
      <p><strong>Target:</strong> ${this.escapeHtml(scan.project.name)} (${this.escapeHtml(scan.project.targetUrl)})</p>
      <p><strong>Scan ID:</strong> ${scan.id}</p>
      <p><strong>Status:</strong> ${scan.status}</p>
      <p><strong>Completed:</strong> ${scan.completedAt ? new Date(scan.completedAt).toLocaleString() : 'N/A'}</p>
      ${template ? `<p><strong>Template:</strong> ${this.escapeHtml(template)}</p>` : ''}
    </div>
  </div>

  ${scan.result?.executiveSummary ? `
  <div class="executive-summary">
    <h2>Executive Summary</h2>
    <p>${this.escapeHtml(scan.result.executiveSummary)}</p>
    ${scan.result.riskScore !== null ? `<p><strong>Risk Score:</strong> ${scan.result.riskScore}/100</p>` : ''}
  </div>
  ` : ''}

  <div class="summary">
    <div class="summary-card">
      <div class="count" style="color: ${severityColors.critical}">${scan.criticalCount}</div>
      <div class="label">Critical</div>
    </div>
    <div class="summary-card">
      <div class="count" style="color: ${severityColors.high}">${scan.highCount}</div>
      <div class="label">High</div>
    </div>
    <div class="summary-card">
      <div class="count" style="color: ${severityColors.medium}">${scan.mediumCount}</div>
      <div class="label">Medium</div>
    </div>
    <div class="summary-card">
      <div class="count" style="color: ${severityColors.low}">${scan.lowCount}</div>
      <div class="label">Low</div>
    </div>
    <div class="summary-card">
      <div class="count">${scan.findingsCount}</div>
      <div class="label">Total</div>
    </div>
  </div>

  <h2>Findings</h2>
  ${generateFindingsSection('Critical', critical, severityColors.critical)}
  ${generateFindingsSection('High', high, severityColors.high)}
  ${generateFindingsSection('Medium', medium, severityColors.medium)}
  ${generateFindingsSection('Low', low, severityColors.low)}
  ${generateFindingsSection('Informational', info, severityColors.info)}

  ${findings.length === 0 ? '<p>No security findings were identified during this scan.</p>' : ''}

  <footer style="margin-top: 60px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
    <p>Generated by Shannon Security Scanner</p>
    <p>Report generated at: ${new Date().toISOString()}</p>
  </footer>
</body>
</html>`;
  }

  /**
   * Generate JSON report
   */
  private async generateJsonReport(scan: DbScan, outputDir: string): Promise<string> {
    const outputPath = path.join(outputDir, 'report.json');

    const report = {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      scan: {
        id: scan.id,
        organizationId: scan.organizationId,
        project: {
          name: scan.project.name,
          targetUrl: scan.project.targetUrl,
        },
        status: scan.status,
        startedAt: scan.startedAt,
        completedAt: scan.completedAt,
      },
      summary: {
        total: scan.findingsCount,
        critical: scan.criticalCount,
        high: scan.highCount,
        medium: scan.mediumCount,
        low: scan.lowCount,
        riskScore: scan.result?.riskScore ?? null,
      },
      executiveSummary: scan.result?.executiveSummary ?? null,
      findings: scan.findings.map((f: DbFinding) => ({
        id: f.id,
        title: f.title,
        description: f.description,
        severity: f.severity,
        category: f.category,
        status: f.status,
        cvss: f.cvss,
        cwe: f.cwe,
        remediation: f.remediation,
        evidence: f.evidence,
      })),
    };

    await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf-8');
    return outputPath;
  }

  /**
   * Generate SARIF report for security tool integration
   * @see https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
   */
  private async generateSarifReport(scan: DbScan, outputDir: string): Promise<string> {
    const outputPath = path.join(outputDir, 'report.sarif');

    // Build SARIF rules from unique finding categories
    const rulesMap = new Map<string, object>();
    for (const finding of scan.findings) {
      const ruleId = `shannon/${finding.category.toLowerCase().replace(/\s+/g, '-')}`;
      if (!rulesMap.has(ruleId)) {
        rulesMap.set(ruleId, {
          id: ruleId,
          name: finding.category,
          shortDescription: {
            text: `${finding.category} vulnerability`,
          },
          fullDescription: {
            text: `Security vulnerability in category: ${finding.category}`,
          },
          helpUri: finding.cwe
            ? `https://cwe.mitre.org/data/definitions/${finding.cwe.replace('CWE-', '')}.html`
            : 'https://owasp.org/www-project-top-ten/',
          properties: {
            'security-severity': SEVERITY_TO_SECURITY_SEVERITY[finding.severity] || '5.0',
          },
        });
      }
    }

    // Build SARIF results
    const results = scan.findings.map((f: DbFinding) => {
      const ruleId = `shannon/${f.category.toLowerCase().replace(/\s+/g, '-')}`;

      return {
        ruleId,
        level: SEVERITY_TO_SARIF_LEVEL[f.severity] || 'warning',
        message: {
          text: f.description,
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: {
                uri: scan.project.targetUrl,
                uriBaseId: 'TARGETROOT',
              },
            },
            logicalLocations: [
              {
                fullyQualifiedName: f.title,
              },
            ],
          },
        ],
        properties: {
          id: f.id,
          severity: f.severity,
          category: f.category,
          status: f.status,
          cvss: f.cvss,
          cwe: f.cwe,
          remediation: f.remediation,
        },
        fixes: f.remediation
          ? [
              {
                description: {
                  text: f.remediation,
                },
              },
            ]
          : undefined,
      };
    });

    const sarif = {
      $schema: SARIF_SCHEMA_URI,
      version: SARIF_SCHEMA_VERSION,
      runs: [
        {
          tool: {
            driver: {
              name: 'Shannon Security Scanner',
              version: '1.0.0',
              informationUri: 'https://shannon.dev',
              rules: Array.from(rulesMap.values()),
            },
          },
          originalUriBaseIds: {
            TARGETROOT: {
              uri: scan.project.targetUrl,
            },
          },
          results,
          invocations: [
            {
              executionSuccessful: scan.status === 'COMPLETED',
              startTimeUtc: scan.startedAt?.toISOString(),
              endTimeUtc: scan.completedAt?.toISOString(),
            },
          ],
          properties: {
            scanId: scan.id,
            organizationId: scan.organizationId,
            projectName: scan.project.name,
            summary: {
              total: scan.findingsCount,
              critical: scan.criticalCount,
              high: scan.highCount,
              medium: scan.mediumCount,
              low: scan.lowCount,
            },
          },
        },
      ],
    };

    await fs.writeFile(outputPath, JSON.stringify(sarif, null, 2), 'utf-8');
    return outputPath;
  }

  /**
   * Get report file for download
   */
  async getReportFile(jobId: string, organizationId: string): Promise<{
    path: string;
    format: ReportFormat;
    contentType: string;
  }> {
    const prisma = await getPrismaClient();

    const job = await prisma.serviceReportJob.findFirst({
      where: {
        id: jobId,
        organizationId,
      },
    });

    if (!job) {
      throw new ReportJobNotFoundError(`Report job ${jobId} not found`);
    }

    if (job.status !== 'COMPLETED') {
      throw new ReportNotReadyError(
        `Report is not ready. Current status: ${job.status}`
      );
    }

    if (!job.outputPath) {
      throw new ReportNotReadyError('Report output path is not set');
    }

    // Verify file exists
    try {
      await fs.access(job.outputPath);
    } catch {
      throw new ReportNotReadyError('Report file not found on disk');
    }

    const contentTypeMap: Record<string, string> = {
      PDF: 'application/pdf',
      HTML: 'text/html',
      JSON: 'application/json',
      SARIF: 'application/sarif+json',
    };

    return {
      path: job.outputPath,
      format: job.format as ReportFormat,
      contentType: contentTypeMap[job.format] || 'application/octet-stream',
    };
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const htmlEntities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return text.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
  }

  /**
   * Map database report job to API type
   */
  private mapToReportJob(job: DbReportJob): ReportJob {
    return {
      id: job.id,
      scanId: job.scanId,
      organizationId: job.organizationId,
      format: job.format as ReportFormat,
      template: job.template,
      status: job.status as ReportJobStatus,
      progress: job.progress,
      outputPath: job.outputPath,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    };
  }
}

// Custom error classes
export class ReportServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportServiceError';
  }
}

export class ReportScanNotFoundError extends ReportServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'ReportScanNotFoundError';
  }
}

export class ReportScanNotCompletedError extends ReportServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'ReportScanNotCompletedError';
  }
}

export class ReportJobNotFoundError extends ReportServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'ReportJobNotFoundError';
  }
}

export class ReportNotReadyError extends ReportServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'ReportNotReadyError';
  }
}

export class ReportFormatNotSupportedError extends ReportServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'ReportFormatNotSupportedError';
  }
}

// Singleton instance
let reportServiceInstance: ReportService | null = null;

export function getReportService(config?: ReportServiceConfig): ReportService {
  if (!reportServiceInstance) {
    reportServiceInstance = new ReportService(config);
  }
  return reportServiceInstance;
}

export default ReportService;
