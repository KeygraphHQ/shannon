# Data Model: Findings & Remediation Management

**Feature**: 003-findings-remediation
**Date**: 2026-01-17

## Entity Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Organization  │────<│      Scan       │────<│     Finding     │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                              ┌──────────────────────────┼──────────────────────────┐
                              │                          │                          │
                              ▼                          ▼                          ▼
                    ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
                    │   FindingNote   │       │    AuditLog     │       │      User       │
                    └─────────────────┘       │ (status changes)│       └─────────────────┘
                                              └─────────────────┘
```

---

## Entities

### Finding (EXISTING - Extended)

The Finding model already exists. This epic adds the `notes` relation and relies on existing `status` field.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String | PK, cuid() | Unique identifier |
| scanId | String | FK → Scan | Parent scan reference |
| title | String | Required | Vulnerability title |
| description | String | Required | Detailed description |
| severity | String | Required, enum-like | "critical", "high", "medium", "low", "info" |
| category | String | Required | "injection", "xss", "auth", "authz", "ssrf", etc. |
| **status** | String | Default: "open" | "open", "fixed", "accepted_risk", "false_positive" |
| cvss | Float | Optional | CVSS score (0.0-10.0) |
| cwe | String | Optional | CWE identifier (e.g., "CWE-89") |
| remediation | String | Optional | Remediation guidance text |
| evidence | Json | Optional | Exploitation evidence, payloads, screenshots |
| createdAt | DateTime | Auto | Creation timestamp |
| updatedAt | DateTime | Auto | Last update timestamp |

**Relations**:
- `scan` → Scan (many-to-one, cascade delete)
- `notes` → FindingNote[] (one-to-many, cascade delete) **NEW**

**Indexes** (existing):
- `[scanId]`
- `[severity]`
- `[status]`
- `[category]`
- `[scanId, severity]`
- `[scanId, status]`

**New Index** (for cross-scan queries):
- `[status, severity]` - Optimize dashboard widget queries

---

### FindingNote (NEW)

User-added comments on findings for collaboration and documentation.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String | PK, cuid() | Unique identifier |
| findingId | String | FK → Finding | Parent finding reference |
| userId | String | FK → User | Note author |
| content | String | Required, max 10,000 chars | Note text content |
| createdAt | DateTime | Auto | Creation timestamp |

**Relations**:
- `finding` → Finding (many-to-one, cascade delete)
- `user` → User (many-to-one, set null on delete)

**Indexes**:
- `[findingId]` - List notes for a finding
- `[findingId, createdAt]` - Chronological ordering

**Validation Rules**:
- `content` must be 1-10,000 characters
- `userId` must be a valid org member with access to the finding's scan

---

### AuditLog (EXISTING - Used for Status Changes)

Existing model used to track finding status changes.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | String | PK, cuid() | Unique identifier |
| organizationId | String | FK → Organization | Tenant scope |
| userId | String | FK → User, nullable | Actor (null if system) |
| action | String | Required | "finding.status_changed" |
| resourceType | String | Optional | "finding" |
| resourceId | String | Optional | Finding ID |
| metadata | Json | Optional | `{previousStatus, newStatus, justification, bulkOperation}` |
| ipAddress | String | Optional | Client IP for audit |
| createdAt | DateTime | Auto | Event timestamp |

**Metadata Schema for `finding.status_changed`**:
```typescript
interface FindingStatusChangeMetadata {
  previousStatus: "open" | "fixed" | "accepted_risk" | "false_positive";
  newStatus: "open" | "fixed" | "accepted_risk" | "false_positive";
  justification?: string;  // Required for accepted_risk, false_positive
  bulkOperation?: boolean; // True if part of bulk update
}
```

---

## State Transitions

### Finding Status State Machine

```
                    ┌──────────────────────────────────────────┐
                    │                                          │
                    ▼                                          │
              ┌──────────┐                                     │
     ┌───────>│   open   │<────────────────────────────────────┤
     │        └────┬─────┘                                     │
     │             │                                           │
     │             ├─────────────────┬─────────────────┐       │
     │             ▼                 ▼                 ▼       │
     │      ┌──────────┐     ┌─────────────┐   ┌──────────────┐│
     │      │  fixed   │     │accepted_risk│   │false_positive││
     │      └────┬─────┘     └──────┬──────┘   └──────┬───────┘│
     │           │                  │                 │        │
     │           │                  │                 │        │
     └───────────┴──────────────────┴─────────────────┴────────┘
              (can reopen any status back to "open")
```

**Transition Rules**:
| From | To | Requires Justification |
|------|-----|----------------------|
| open | fixed | No |
| open | accepted_risk | **Yes** |
| open | false_positive | **Yes** |
| fixed | open | No |
| accepted_risk | open | No |
| false_positive | open | No |
| fixed | accepted_risk | **Yes** |
| fixed | false_positive | **Yes** |
| accepted_risk | fixed | No |
| accepted_risk | false_positive | **Yes** |
| false_positive | fixed | No |
| false_positive | accepted_risk | **Yes** |

---

## Prisma Schema Changes

```prisma
// Add to existing Finding model
model Finding {
  // ... existing fields ...

  notes FindingNote[]  // NEW: Add relation
}

// NEW: Add FindingNote model
model FindingNote {
  id        String   @id @default(cuid())
  findingId String
  userId    String
  content   String   @db.VarChar(10000)
  createdAt DateTime @default(now())

  finding Finding @relation(fields: [findingId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([findingId])
  @@index([findingId, createdAt])
}

// Add to existing User model
model User {
  // ... existing fields ...

  findingNotes FindingNote[]  // NEW: Add relation
}
```

---

## Query Patterns

### Cross-Scan Findings List
```sql
SELECT f.*, s.targetUrl, s.id as scanId
FROM Finding f
JOIN Scan s ON f.scanId = s.id
WHERE s.organizationId = :orgId
  AND f.status IN (:statuses)
  AND f.severity IN (:severities)
  AND (f.title ILIKE :search OR f.description ILIKE :search)
ORDER BY f.createdAt DESC
LIMIT :limit + 1
```

### Dashboard Widget Aggregation
```sql
-- By severity (uses denormalized counts)
SELECT
  SUM(criticalCount) as critical,
  SUM(highCount) as high,
  SUM(mediumCount) as medium,
  SUM(lowCount) as low
FROM Scan
WHERE organizationId = :orgId;

-- By status (direct count)
SELECT status, COUNT(*) as count
FROM Finding f
JOIN Scan s ON f.scanId = s.id
WHERE s.organizationId = :orgId
GROUP BY status;
```

### Activity History
```sql
-- Notes
SELECT n.*, u.name, u.imageUrl
FROM FindingNote n
JOIN User u ON n.userId = u.id
WHERE n.findingId = :findingId
ORDER BY n.createdAt DESC;

-- Status changes
SELECT a.*, u.name, u.imageUrl
FROM AuditLog a
LEFT JOIN User u ON a.userId = u.id
WHERE a.resourceType = 'finding'
  AND a.resourceId = :findingId
  AND a.action = 'finding.status_changed'
ORDER BY a.createdAt DESC;
```

---

## Data Retention

| Entity | Retention | On Parent Delete |
|--------|-----------|------------------|
| Finding | With Scan | Cascade delete |
| FindingNote | With Finding | Cascade delete |
| AuditLog | 2 years minimum | Retained (per FR-017) |

**Audit Log Retention Implementation**:
- AuditLog entries persist even after Finding/Scan deletion
- `onDelete: SetNull` for user reference preserves log with null userId
- Background job (future) to purge logs older than 2 years
