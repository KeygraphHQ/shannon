# API Contracts: Findings & Remediation Management

**Feature**: 003-findings-remediation
**Date**: 2026-01-17

## Base URL

```
/api/findings
```

All endpoints require authentication via Clerk. User must have access to the organization that owns the scan.

---

## Endpoints

### 1. List Findings (Cross-Scan)

**GET** `/api/findings`

List all findings across an organization's scans with filtering and pagination.

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| severity | string[] | No | Filter by severity: critical, high, medium, low, info |
| status | string[] | No | Filter by status: open, fixed, accepted_risk, false_positive |
| category | string[] | No | Filter by category: injection, xss, auth, authz, ssrf |
| scanId | string | No | Filter to specific scan |
| search | string | No | Search in title, description, CWE |
| cursor | string | No | Pagination cursor |
| limit | number | No | Results per page (default: 20, max: 100) |

#### Response

```typescript
interface ListFindingsResponse {
  findings: Finding[];
  nextCursor: string | null;
  total: number;
}

interface Finding {
  id: string;
  scanId: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  status: "open" | "fixed" | "accepted_risk" | "false_positive";
  cvss: number | null;
  cwe: string | null;
  remediation: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  scan: {
    id: string;
    targetUrl: string;
  };
}
```

#### Example

```bash
GET /api/findings?severity=critical&severity=high&status=open&limit=20
```

---

### 2. Get Finding Detail

**GET** `/api/findings/{findingId}`

Get a single finding with full details including evidence.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| findingId | string | Finding ID |

#### Response

```typescript
interface GetFindingResponse {
  id: string;
  scanId: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  status: "open" | "fixed" | "accepted_risk" | "false_positive";
  cvss: number | null;
  cwe: string | null;
  remediation: string | null;
  evidence: Evidence | null;
  createdAt: string;
  updatedAt: string;
  scan: {
    id: string;
    targetUrl: string;
    projectName: string;
  };
}

interface Evidence {
  steps?: string[];
  payloads?: string[];
  screenshots?: string[];
  proofOfImpact?: string;
  [key: string]: unknown;
}
```

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| 404 | FINDING_NOT_FOUND | Finding does not exist or unauthorized |

---

### 3. Update Finding Status

**PATCH** `/api/findings/{findingId}/status`

Update a finding's status with optional justification.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| findingId | string | Finding ID |

#### Request Body

```typescript
interface UpdateStatusRequest {
  status: "open" | "fixed" | "accepted_risk" | "false_positive";
  justification?: string; // Required for accepted_risk, false_positive
}
```

#### Response

```typescript
interface UpdateStatusResponse {
  id: string;
  status: string;
  updatedAt: string;
}
```

#### Validation

- `justification` required when status is `accepted_risk` or `false_positive`
- `justification` max length: 2000 characters

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| 400 | JUSTIFICATION_REQUIRED | Status requires justification |
| 404 | FINDING_NOT_FOUND | Finding does not exist or unauthorized |

---

### 4. Bulk Update Status

**POST** `/api/findings/bulk-status`

Update status for multiple findings at once.

#### Request Body

```typescript
interface BulkUpdateStatusRequest {
  findingIds: string[]; // Max 100 IDs
  status: "open" | "fixed" | "accepted_risk" | "false_positive";
  justification?: string; // Required for accepted_risk, false_positive
}
```

#### Response

```typescript
interface BulkUpdateStatusResponse {
  updated: number; // Count of updated findings
  findingIds: string[]; // IDs that were updated
}
```

#### Validation

- `findingIds` must contain 1-100 IDs
- All findings must belong to user's organization
- `justification` required when status is `accepted_risk` or `false_positive`

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| 400 | JUSTIFICATION_REQUIRED | Status requires justification |
| 400 | TOO_MANY_FINDINGS | More than 100 findings in request |
| 403 | UNAUTHORIZED_FINDINGS | Some findings not accessible |

---

### 5. List Finding Notes

**GET** `/api/findings/{findingId}/notes`

Get all notes for a finding.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| findingId | string | Finding ID |

#### Response

```typescript
interface ListNotesResponse {
  notes: FindingNote[];
}

interface FindingNote {
  id: string;
  findingId: string;
  content: string;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    imageUrl: string | null;
  };
}
```

---

### 6. Add Finding Note

**POST** `/api/findings/{findingId}/notes`

Add a note to a finding.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| findingId | string | Finding ID |

#### Request Body

```typescript
interface AddNoteRequest {
  content: string; // 1-10,000 characters
}
```

#### Response

```typescript
interface AddNoteResponse {
  id: string;
  findingId: string;
  content: string;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    imageUrl: string | null;
  };
}
```

#### Validation

- `content` must be 1-10,000 characters

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| 400 | CONTENT_TOO_LONG | Note exceeds 10,000 characters |
| 404 | FINDING_NOT_FOUND | Finding does not exist or unauthorized |

---

### 7. Get Finding Activity

**GET** `/api/findings/{findingId}/activity`

Get combined activity history (notes + status changes) for a finding.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| findingId | string | Finding ID |

#### Response

```typescript
interface GetActivityResponse {
  activities: ActivityEntry[];
}

type ActivityEntry = NoteActivity | StatusChangeActivity;

interface NoteActivity {
  type: "note";
  id: string;
  content: string;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    imageUrl: string | null;
  };
}

interface StatusChangeActivity {
  type: "status_change";
  id: string;
  previousStatus: string;
  newStatus: string;
  justification: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    imageUrl: string | null;
  } | null;
}
```

---

### 8. Get Findings Summary (Dashboard Widget)

**GET** `/api/findings/summary`

Get aggregated findings metrics for dashboard widget.

#### Response

```typescript
interface GetSummaryResponse {
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
  openCount: number; // Convenience field for open findings
}
```

---

## Server Actions (Alternative to API Routes)

For client components using server actions instead of fetch:

```typescript
// web/lib/actions/findings.ts

export async function listFindings(
  filters?: FindingFilters,
  pagination?: PaginationOptions
): Promise<ListFindingsResponse>;

export async function getFinding(
  findingId: string
): Promise<GetFindingResponse>;

export async function updateFindingStatus(
  findingId: string,
  status: string,
  justification?: string
): Promise<UpdateStatusResponse>;

export async function bulkUpdateFindingStatus(
  findingIds: string[],
  status: string,
  justification?: string
): Promise<BulkUpdateStatusResponse>;

export async function addFindingNote(
  findingId: string,
  content: string
): Promise<AddNoteResponse>;

export async function getFindingActivity(
  findingId: string
): Promise<GetActivityResponse>;

export async function getFindingsSummary(): Promise<GetSummaryResponse>;
```

---

## Error Response Format

All errors follow standard format:

```typescript
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
```

---

## Authentication

All endpoints require:
1. Valid Clerk session (via `auth()`)
2. User membership in organization that owns the scan/finding

Authorization is enforced at the server action/API route level via `hasOrgAccess(orgId)`.
