/**
 * Report storage path utilities.
 * Implements tenant-prefixed paths for multi-tenant isolation.
 */

/**
 * Storage path configuration.
 * All paths are prefixed with tenant ID for multi-tenant isolation.
 */
export const STORAGE_CONFIG = {
  // Base prefix for all tenant data
  TENANT_PREFIX: 'tenant',

  // Subdirectories
  REPORTS_DIR: 'reports',

  // File names
  PDF_FILENAME: 'report.pdf',
  HTML_FILENAME: 'report.html',
  JSON_FILENAME: 'report.json',
  CSV_FILENAME: 'findings.csv',
} as const;

/**
 * Generate the base storage path for a report.
 * Format: tenant-{orgId}/reports/{reportId}/
 */
export function getReportStoragePath(orgId: string, reportId: string): string {
  return `${STORAGE_CONFIG.TENANT_PREFIX}-${orgId}/${STORAGE_CONFIG.REPORTS_DIR}/${reportId}`;
}

/**
 * Generate paths for all report export formats.
 */
export function getReportFilePaths(orgId: string, reportId: string): {
  storagePath: string;
  pdfPath: string;
  htmlPath: string;
  jsonPath: string;
  csvPath: string;
} {
  const basePath = getReportStoragePath(orgId, reportId);

  return {
    storagePath: basePath,
    pdfPath: `${basePath}/${STORAGE_CONFIG.PDF_FILENAME}`,
    htmlPath: `${basePath}/${STORAGE_CONFIG.HTML_FILENAME}`,
    jsonPath: `${basePath}/${STORAGE_CONFIG.JSON_FILENAME}`,
    csvPath: `${basePath}/${STORAGE_CONFIG.CSV_FILENAME}`,
  };
}

/**
 * Validate a storage path belongs to the expected organization.
 * Prevents path traversal and cross-tenant access.
 */
export function validateStoragePath(path: string, expectedOrgId: string): boolean {
  // Normalize path
  const normalizedPath = path.replace(/\\/g, '/').replace(/\/+/g, '/');

  // Check for path traversal attempts
  if (normalizedPath.includes('..') || normalizedPath.includes('./')) {
    return false;
  }

  // Verify tenant prefix matches
  const expectedPrefix = `${STORAGE_CONFIG.TENANT_PREFIX}-${expectedOrgId}/`;
  return normalizedPath.startsWith(expectedPrefix);
}

/**
 * Extract organization ID from a storage path.
 * Returns null if path format is invalid.
 */
export function extractOrgIdFromPath(path: string): string | null {
  const normalizedPath = path.replace(/\\/g, '/');
  const prefix = `${STORAGE_CONFIG.TENANT_PREFIX}-`;

  if (!normalizedPath.startsWith(prefix)) {
    return null;
  }

  // Format: tenant-{orgId}/...
  const afterPrefix = normalizedPath.slice(prefix.length);
  const slashIndex = afterPrefix.indexOf('/');

  if (slashIndex === -1) {
    return afterPrefix; // Path is just the tenant ID
  }

  return afterPrefix.slice(0, slashIndex);
}

/**
 * Generate a unique filename with timestamp.
 * Used for downloaded files to prevent caching issues.
 */
export function generateDownloadFilename(
  reportTitle: string,
  format: 'pdf' | 'html' | 'json' | 'csv'
): string {
  // Sanitize title for filename use
  const sanitizedTitle = reportTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

  const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  return `${sanitizedTitle}-${timestamp}.${format}`;
}

/**
 * Get the content type for a report format.
 */
export function getContentType(format: 'pdf' | 'html' | 'json' | 'csv'): string {
  const contentTypes: Record<string, string> = {
    pdf: 'application/pdf',
    html: 'text/html',
    json: 'application/json',
    csv: 'text/csv',
  };

  return contentTypes[format] || 'application/octet-stream';
}

/**
 * Storage retention configuration.
 * Reports are retained for 12 months per FR requirements.
 */
export const RETENTION_CONFIG = {
  // Report retention period in days (12 months)
  REPORT_RETENTION_DAYS: 365,

  // Grace period for deleted reports before permanent deletion
  DELETION_GRACE_DAYS: 30,
} as const;

/**
 * Calculate the expiration date for a report.
 */
export function getReportExpirationDate(createdAt: Date): Date {
  const expirationDate = new Date(createdAt);
  expirationDate.setDate(expirationDate.getDate() + RETENTION_CONFIG.REPORT_RETENTION_DAYS);
  return expirationDate;
}

/**
 * Check if a report is within the retention period.
 */
export function isWithinRetentionPeriod(createdAt: Date): boolean {
  const expirationDate = getReportExpirationDate(createdAt);
  return new Date() < expirationDate;
}
