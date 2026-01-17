/**
 * Finding types for Shannon web application.
 *
 * These types mirror the Prisma schema types and API contracts
 * for the Findings & Remediation Management feature.
 */

// Finding severity levels
export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";

// Finding status values
export type FindingStatus = "open" | "fixed" | "accepted_risk" | "false_positive";

// Statuses that require justification when transitioning to them
export const JUSTIFICATION_REQUIRED_STATUSES: FindingStatus[] = [
  "accepted_risk",
  "false_positive",
];

// Finding category types
export type FindingCategory =
  | "injection"
  | "xss"
  | "auth"
  | "authz"
  | "ssrf"
  | "other";

// Evidence data structure (from scans)
export interface Evidence {
  steps?: string[];
  payloads?: string[];
  screenshots?: string[];
  proofOfImpact?: string;
  [key: string]: unknown;
}

// Finding with minimal scan info (for list views)
export interface FindingListItem {
  id: string;
  scanId: string;
  title: string;
  description: string;
  severity: FindingSeverity;
  category: string;
  status: FindingStatus;
  cvss: number | null;
  cwe: string | null;
  createdAt: Date;
  updatedAt: Date;
  scan: {
    id: string;
    targetUrl: string;
  };
}

// Full finding detail (for detail views)
export interface FindingDetail extends FindingListItem {
  remediation: string | null;
  evidence: Evidence | null;
  scan: {
    id: string;
    targetUrl: string;
    projectName?: string;
  };
}

// Finding note with author info
export interface FindingNote {
  id: string;
  findingId: string;
  content: string;
  createdAt: Date;
  user: {
    id: string;
    name: string | null;
    avatarUrl: string | null;
  } | null;
}

// Activity entry types for timeline
export interface NoteActivity {
  type: "note";
  id: string;
  content: string;
  createdAt: Date;
  user: {
    id: string;
    name: string | null;
    avatarUrl: string | null;
  } | null;
}

export interface StatusChangeActivity {
  type: "status_change";
  id: string;
  previousStatus: FindingStatus;
  newStatus: FindingStatus;
  justification: string | null;
  createdAt: Date;
  user: {
    id: string;
    name: string | null;
    avatarUrl: string | null;
  } | null;
}

export type ActivityEntry = NoteActivity | StatusChangeActivity;

// Filter options for findings list
export interface FindingFilters {
  severity?: FindingSeverity | FindingSeverity[];
  status?: FindingStatus | FindingStatus[];
  category?: string | string[];
  scanId?: string;
  search?: string;
}

// Pagination options
export interface PaginationOptions {
  cursor?: string;
  limit?: number;
}

// List findings response
export interface ListFindingsResponse {
  findings: FindingListItem[];
  nextCursor: string | null;
  total: number;
}

// Findings summary for dashboard widget
export interface FindingsSummary {
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  byStatus: {
    open: number;
    fixed: number;
    accepted_risk: number;
    false_positive: number;
  };
  total: number;
  openCount: number;
}

// Status update response
export interface UpdateStatusResponse {
  id: string;
  status: FindingStatus;
  updatedAt: Date;
}

// Bulk status update response
export interface BulkUpdateStatusResponse {
  updated: number;
  findingIds: string[];
}

// Status change metadata stored in AuditLog
export interface FindingStatusChangeMetadata {
  previousStatus: FindingStatus;
  newStatus: FindingStatus;
  justification?: string | null;
  bulkOperation?: boolean;
}
