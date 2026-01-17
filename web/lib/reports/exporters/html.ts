/**
 * HTML exporter for reports.
 * Generates standalone HTML reports with embedded styles.
 */

import type { ReportData } from '../templates/types';
import { SEVERITY_COLORS } from '../templates/types';

/**
 * Render report data to HTML string.
 */
export function renderToHtml(data: ReportData): string {
  const severityBadge = (severity: string) => {
    const color = SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS] || '#6B7280';
    return `<span style="display: inline-block; padding: 2px 8px; border-radius: 4px; background: ${color}; color: white; font-size: 12px; font-weight: 600; text-transform: uppercase;">${severity}</span>`;
  };

  const getRiskColor = (score: number) => {
    if (score >= 80) return '#DC2626';
    if (score >= 60) return '#EA580C';
    if (score >= 40) return '#CA8A04';
    if (score >= 20) return '#2563EB';
    return '#10B981';
  };

  const formatDate = (date: Date | null | undefined) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const escapeHtml = (text: string | null | undefined): string => {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(data.metadata.title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      max-width: 1200px;
      margin: 0 auto;
      padding: 40px 20px;
      background: #f9fafb;
    }
    .report-container {
      background: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      padding: 40px;
    }
    .header {
      border-bottom: 3px solid #3b82f6;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      font-size: 28px;
      color: #111827;
      margin-bottom: 8px;
    }
    .header .subtitle {
      color: #6b7280;
      font-size: 14px;
    }
    .metadata {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      background: #f9fafb;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    .metadata-item label {
      display: block;
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 4px;
    }
    .metadata-item span {
      font-weight: 600;
      color: #111827;
    }
    .section {
      margin-bottom: 30px;
    }
    .section-title {
      font-size: 18px;
      font-weight: 600;
      color: #111827;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e5e7eb;
    }
    .risk-score {
      display: flex;
      align-items: center;
      gap: 24px;
      margin-bottom: 24px;
    }
    .risk-score-box {
      width: 100px;
      height: 100px;
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: white;
    }
    .risk-score-value {
      font-size: 36px;
      font-weight: 700;
    }
    .risk-score-label {
      font-size: 12px;
      opacity: 0.9;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    .summary-item {
      text-align: center;
      padding: 16px;
      background: #f9fafb;
      border-radius: 8px;
    }
    .summary-value {
      font-size: 32px;
      font-weight: 700;
    }
    .summary-label {
      font-size: 12px;
      color: #6b7280;
    }
    .findings-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 16px;
    }
    .findings-table th,
    .findings-table td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    .findings-table th {
      background: #f9fafb;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      color: #6b7280;
    }
    .finding-card {
      background: #f9fafb;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
      border-left: 4px solid;
    }
    .finding-title {
      font-weight: 600;
      margin-bottom: 8px;
    }
    .finding-description {
      color: #4b5563;
      font-size: 14px;
      margin-bottom: 12px;
    }
    .finding-meta {
      display: flex;
      gap: 16px;
      font-size: 12px;
      color: #6b7280;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #9ca3af;
      display: flex;
      justify-content: space-between;
    }
    @media print {
      body { background: white; padding: 0; }
      .report-container { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="report-container">
    <div class="header">
      <h1>${escapeHtml(data.metadata.title)}</h1>
      <div class="subtitle">${escapeHtml(data.project.name)} • ${escapeHtml(data.project.targetUrl)}</div>
    </div>

    <div class="metadata">
      <div class="metadata-item">
        <label>Organization</label>
        <span>${escapeHtml(data.organization.name)}</span>
      </div>
      <div class="metadata-item">
        <label>Generated</label>
        <span>${formatDate(data.metadata.generatedAt)}</span>
      </div>
      <div class="metadata-item">
        <label>Report Type</label>
        <span>${data.metadata.type}</span>
      </div>
      <div class="metadata-item">
        <label>Report ID</label>
        <span>${data.metadata.reportId}</span>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Risk Assessment</h2>
      <div class="risk-score">
        <div class="risk-score-box" style="background: ${getRiskColor(data.summary.riskScore)}">
          <div class="risk-score-value">${data.summary.riskScore}</div>
          <div class="risk-score-label">Risk Score</div>
        </div>
        <div>
          <p>Based on <strong>${data.summary.total}</strong> findings identified during the security assessment.</p>
          ${data.summary.critical > 0 ? `<p style="color: ${SEVERITY_COLORS.critical}; font-weight: 600;">${data.summary.critical} critical vulnerabilities require immediate attention.</p>` : ''}
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Findings Summary</h2>
      <div class="summary-grid">
        <div class="summary-item">
          <div class="summary-value" style="color: ${SEVERITY_COLORS.critical}">${data.summary.critical}</div>
          <div class="summary-label">Critical</div>
        </div>
        <div class="summary-item">
          <div class="summary-value" style="color: ${SEVERITY_COLORS.high}">${data.summary.high}</div>
          <div class="summary-label">High</div>
        </div>
        <div class="summary-item">
          <div class="summary-value" style="color: ${SEVERITY_COLORS.medium}">${data.summary.medium}</div>
          <div class="summary-label">Medium</div>
        </div>
        <div class="summary-item">
          <div class="summary-value" style="color: ${SEVERITY_COLORS.low}">${data.summary.low}</div>
          <div class="summary-label">Low</div>
        </div>
        <div class="summary-item">
          <div class="summary-value" style="color: #111827">${data.summary.total}</div>
          <div class="summary-label">Total</div>
        </div>
      </div>
    </div>

    ${data.scan.result?.executiveSummary ? `
    <div class="section">
      <h2 class="section-title">Executive Summary</h2>
      <p>${escapeHtml(data.scan.result.executiveSummary)}</p>
    </div>
    ` : ''}

    <div class="section">
      <h2 class="section-title">Findings Detail</h2>
      ${data.findings.map((finding) => `
        <div class="finding-card" style="border-left-color: ${SEVERITY_COLORS[finding.severity as keyof typeof SEVERITY_COLORS] || '#6b7280'}">
          <div style="margin-bottom: 8px">${severityBadge(finding.severity)}</div>
          <div class="finding-title">${escapeHtml(finding.title)}</div>
          <div class="finding-description">${escapeHtml(finding.description)}</div>
          <div class="finding-meta">
            <span>Category: ${escapeHtml(finding.category)}</span>
            ${finding.cwe ? `<span>CWE: ${escapeHtml(finding.cwe)}</span>` : ''}
            ${finding.cvss ? `<span>CVSS: ${finding.cvss.toFixed(1)}</span>` : ''}
            <span>Status: ${escapeHtml(finding.status)}</span>
          </div>
          ${finding.remediation ? `
          <div style="margin-top: 12px; padding: 12px; background: white; border-radius: 4px;">
            <strong style="font-size: 12px; color: #6b7280;">Remediation:</strong>
            <p style="margin-top: 4px; font-size: 14px;">${escapeHtml(finding.remediation)}</p>
          </div>
          ` : ''}
        </div>
      `).join('')}
    </div>

    <div class="footer">
      <span>Shannon Security Assessment</span>
      <span>Report ID: ${data.metadata.reportId}</span>
    </div>
  </div>
</body>
</html>`;

  return html;
}

/**
 * Get content type for HTML export.
 */
export function getHtmlContentType(): string {
  return 'text/html; charset=utf-8';
}

/**
 * Get file extension for HTML export.
 */
export function getHtmlExtension(): string {
  return 'html';
}
