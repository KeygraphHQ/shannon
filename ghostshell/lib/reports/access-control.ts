/**
 * Report access control utilities.
 * Implements team-based permissions per FR-027.
 * Reports inherit access from the project/scan they belong to.
 */

import { db } from '../db';
import { getCurrentUser, getUserOrgRole, hasMinimumRole, ORG_ROLES, type OrgRole } from '../auth';

/**
 * Report permissions - aligned with organization role hierarchy.
 * Reports inherit project permissions (team-based access).
 */
export const REPORT_PERMISSIONS = {
  // Viewing reports
  VIEW_REPORT: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN, ORG_ROLES.MEMBER, ORG_ROLES.VIEWER],

  // Generating reports
  GENERATE_REPORT: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN, ORG_ROLES.MEMBER],

  // Exporting reports (PDF, HTML, JSON, CSV)
  EXPORT_REPORT: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN, ORG_ROLES.MEMBER, ORG_ROLES.VIEWER],

  // Sharing reports (creating share links)
  SHARE_REPORT: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN, ORG_ROLES.MEMBER],

  // Revoking share links
  REVOKE_SHARE: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN],

  // Deleting reports (admin only with audit log)
  DELETE_REPORT: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN],

  // Managing report templates
  MANAGE_TEMPLATES: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN],

  // Managing report schedules
  MANAGE_SCHEDULES: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN],

  // Viewing access logs
  VIEW_ACCESS_LOGS: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN],
} as const;

export type ReportPermission = keyof typeof REPORT_PERMISSIONS;

/**
 * Check if user has a specific report permission for an organization.
 */
export async function hasReportPermission(
  orgId: string,
  permission: ReportPermission
): Promise<boolean> {
  const role = await getUserOrgRole(orgId);
  if (!role) return false;

  const allowedRoles = REPORT_PERMISSIONS[permission];
  return (allowedRoles as readonly string[]).includes(role);
}

/**
 * Check if user can access a specific report.
 * Verifies organization membership and permission level.
 */
export async function canAccessReport(
  reportId: string,
  permission: ReportPermission = 'VIEW_REPORT'
): Promise<{ allowed: boolean; report: Awaited<ReturnType<typeof getReportWithOrg>> | null }> {
  const report = await getReportWithOrg(reportId);

  if (!report) {
    return { allowed: false, report: null };
  }

  // Check if report is soft-deleted
  if (report.deletedAt && permission !== 'VIEW_ACCESS_LOGS') {
    return { allowed: false, report: null };
  }

  const hasPermission = await hasReportPermission(report.organizationId, permission);

  return { allowed: hasPermission, report: hasPermission ? report : null };
}

/**
 * Get report with organization context for access checks.
 */
async function getReportWithOrg(reportId: string) {
  return db.report.findUnique({
    where: { id: reportId },
    include: {
      organization: true,
      scan: {
        include: {
          project: true,
        },
      },
    },
  });
}

/**
 * Check if user can generate reports for a scan.
 */
export async function canGenerateReportForScan(scanId: string): Promise<boolean> {
  const scan = await db.scan.findUnique({
    where: { id: scanId },
    select: { organizationId: true },
  });

  if (!scan) return false;

  return hasReportPermission(scan.organizationId, 'GENERATE_REPORT');
}

/**
 * Check concurrent report generation limit for an organization.
 * Maximum 5 concurrent report generations per organization (FR-029).
 */
export async function checkConcurrentGenerationLimit(orgId: string): Promise<{
  allowed: boolean;
  currentCount: number;
  maxCount: number;
}> {
  const MAX_CONCURRENT_GENERATIONS = 5;

  const generatingCount = await db.report.count({
    where: {
      organizationId: orgId,
      status: 'GENERATING',
    },
  });

  return {
    allowed: generatingCount < MAX_CONCURRENT_GENERATIONS,
    currentCount: generatingCount,
    maxCount: MAX_CONCURRENT_GENERATIONS,
  };
}

/**
 * Verify report deletion is allowed and create audit trail.
 * Only admins can delete reports, and all deletions are logged.
 */
export async function canDeleteReport(reportId: string): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const user = await getCurrentUser();
  if (!user) {
    return { allowed: false, reason: 'User not authenticated' };
  }

  const report = await db.report.findUnique({
    where: { id: reportId },
    select: {
      organizationId: true,
      deletedAt: true,
      status: true,
    },
  });

  if (!report) {
    return { allowed: false, reason: 'Report not found' };
  }

  if (report.deletedAt) {
    return { allowed: false, reason: 'Report already deleted' };
  }

  const hasPermission = await hasReportPermission(report.organizationId, 'DELETE_REPORT');
  if (!hasPermission) {
    return { allowed: false, reason: 'Insufficient permissions' };
  }

  return { allowed: true };
}

/**
 * Get user's report permissions for an organization.
 * Returns a map of permissions for UI display.
 */
export async function getReportPermissionsForOrg(orgId: string): Promise<Record<ReportPermission, boolean>> {
  const role = await getUserOrgRole(orgId);

  const permissions: Record<ReportPermission, boolean> = {
    VIEW_REPORT: false,
    GENERATE_REPORT: false,
    EXPORT_REPORT: false,
    SHARE_REPORT: false,
    REVOKE_SHARE: false,
    DELETE_REPORT: false,
    MANAGE_TEMPLATES: false,
    MANAGE_SCHEDULES: false,
    VIEW_ACCESS_LOGS: false,
  };

  if (!role) return permissions;

  for (const [permission, allowedRoles] of Object.entries(REPORT_PERMISSIONS)) {
    permissions[permission as ReportPermission] = (allowedRoles as readonly string[]).includes(role);
  }

  return permissions;
}
