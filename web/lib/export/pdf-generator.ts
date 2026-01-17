/**
 * PDF Generator using Puppeteer + Marked
 * Converts markdown scan reports to professional PDF format
 */

import { Scan, ScanResult, Project } from "@prisma/client";

export interface ScanReportData {
  scan: Scan & {
    project: Pick<Project, "id" | "name" | "targetUrl">;
    result: ScanResult | null;
  };
  markdownContent?: string;
}

/**
 * Creates an HTML template for the scan report
 */
function createReportTemplate(data: ScanReportData, htmlContent: string): string {
  const { scan } = data;
  const riskScore = scan.result?.riskScore ?? 0;
  const riskLevel =
    riskScore >= 80 ? "Critical" :
    riskScore >= 60 ? "High" :
    riskScore >= 40 ? "Medium" : "Low";
  const riskColor =
    riskScore >= 80 ? "#dc2626" :
    riskScore >= 60 ? "#ea580c" :
    riskScore >= 40 ? "#ca8a04" : "#16a34a";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Security Scan Report - ${scan.project.name}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }
    .header {
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .logo {
      font-size: 24px;
      font-weight: bold;
      color: #4f46e5;
      margin-bottom: 20px;
    }
    .report-title {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .project-name {
      font-size: 18px;
      color: #6b7280;
    }
    .meta-info {
      display: flex;
      gap: 30px;
      margin-top: 20px;
      font-size: 14px;
      color: #6b7280;
    }
    .meta-item {
      display: flex;
      flex-direction: column;
    }
    .meta-label {
      font-weight: 600;
      color: #374151;
    }
    .summary-section {
      background: #f9fafb;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    .findings-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin: 20px 0;
    }
    .finding-card {
      padding: 16px;
      border-radius: 8px;
      text-align: center;
    }
    .finding-card.critical { background: #fef2f2; color: #dc2626; }
    .finding-card.high { background: #fff7ed; color: #ea580c; }
    .finding-card.medium { background: #fefce8; color: #ca8a04; }
    .finding-card.low { background: #eff6ff; color: #2563eb; }
    .finding-count {
      font-size: 32px;
      font-weight: 700;
    }
    .finding-label {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .risk-score {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 20px 0;
    }
    .risk-bar {
      flex: 1;
      height: 12px;
      background: #e5e7eb;
      border-radius: 6px;
      overflow: hidden;
    }
    .risk-fill {
      height: 100%;
      border-radius: 6px;
    }
    .risk-value {
      font-size: 18px;
      font-weight: 700;
    }
    .section {
      margin-bottom: 30px;
    }
    .section-title {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 16px;
      color: #111827;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 8px;
    }
    .content {
      font-size: 14px;
      line-height: 1.8;
    }
    .content h1 { font-size: 24px; margin: 24px 0 12px; }
    .content h2 { font-size: 20px; margin: 20px 0 10px; }
    .content h3 { font-size: 16px; margin: 16px 0 8px; }
    .content p { margin: 12px 0; }
    .content ul, .content ol { margin: 12px 0; padding-left: 24px; }
    .content li { margin: 4px 0; }
    .content code {
      background: #f3f4f6;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 13px;
    }
    .content pre {
      background: #1f2937;
      color: #f9fafb;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 16px 0;
    }
    .content pre code {
      background: transparent;
      padding: 0;
      color: inherit;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #9ca3af;
      text-align: center;
    }
    @media print {
      body { padding: 20px; }
      .page-break { page-break-before: always; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">Shannon Security</div>
    <h1 class="report-title">Security Scan Report</h1>
    <p class="project-name">${scan.project.name}</p>
    <div class="meta-info">
      <div class="meta-item">
        <span class="meta-label">Target URL</span>
        <span>${scan.project.targetUrl}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Scan Date</span>
        <span>${scan.completedAt ? new Date(scan.completedAt).toLocaleDateString() : new Date().toLocaleDateString()}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Duration</span>
        <span>${scan.durationMs ? formatDuration(scan.durationMs) : "N/A"}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Scan ID</span>
        <span>${scan.id}</span>
      </div>
    </div>
  </div>

  <div class="summary-section">
    <h2 class="section-title" style="border: none; padding: 0; margin-bottom: 16px;">Executive Summary</h2>

    <div class="findings-grid">
      <div class="finding-card critical">
        <div class="finding-count">${scan.criticalCount}</div>
        <div class="finding-label">Critical</div>
      </div>
      <div class="finding-card high">
        <div class="finding-count">${scan.highCount}</div>
        <div class="finding-label">High</div>
      </div>
      <div class="finding-card medium">
        <div class="finding-count">${scan.mediumCount}</div>
        <div class="finding-label">Medium</div>
      </div>
      <div class="finding-card low">
        <div class="finding-count">${scan.lowCount}</div>
        <div class="finding-label">Low</div>
      </div>
    </div>

    ${scan.result?.riskScore !== null && scan.result?.riskScore !== undefined ? `
    <div style="margin-top: 20px;">
      <div style="font-weight: 600; margin-bottom: 8px;">Risk Score: ${riskLevel}</div>
      <div class="risk-score">
        <div class="risk-bar">
          <div class="risk-fill" style="width: ${riskScore}%; background: ${riskColor};"></div>
        </div>
        <span class="risk-value" style="color: ${riskColor};">${riskScore}/100</span>
      </div>
    </div>
    ` : ""}

    ${scan.result?.executiveSummary ? `
    <div style="margin-top: 16px; font-size: 14px; color: #4b5563;">
      ${scan.result.executiveSummary}
    </div>
    ` : ""}
  </div>

  <div class="section">
    <h2 class="section-title">Detailed Findings</h2>
    <div class="content">
      ${htmlContent || "<p>No detailed findings available.</p>"}
    </div>
  </div>

  <div class="footer">
    <p>Generated by Shannon Security Platform</p>
    <p>Report generated on ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>
`;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Generates a PDF report from scan data
 * Uses Puppeteer for high-quality PDF generation
 */
export async function generatePdf(data: ScanReportData): Promise<Buffer> {
  // Dynamically import puppeteer to avoid issues if not installed
  let puppeteer;
  try {
    puppeteer = await import("puppeteer");
  } catch {
    throw new Error(
      "Puppeteer is not installed. Run: npm install puppeteer"
    );
  }

  // Parse markdown content if provided
  let htmlContent = "";
  if (data.markdownContent) {
    try {
      const { marked } = await import("marked");
      htmlContent = await marked(data.markdownContent);
    } catch {
      // If marked is not available, use raw content
      htmlContent = `<pre>${data.markdownContent}</pre>`;
    }
  }

  const html = createReportTemplate(data, htmlContent);

  const browser = await puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        right: "20mm",
        bottom: "20mm",
        left: "20mm",
      },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

/**
 * Generates HTML report (fallback if Puppeteer not available)
 */
export function generateHtml(data: ScanReportData, markdownHtml?: string): string {
  return createReportTemplate(data, markdownHtml || "");
}
