# Data Model: Running Security Scans

**Feature**: 002-security-scans
**Date**: 2026-01-17
**Status**: Complete

## Overview

This document defines the data model extensions required for the security scanning feature. All new entities follow multi-tenant isolation patterns with `organizationId` scoping.

## Entity Relationship Diagram

```
Organization (existing)
    │
    ├──< Project
    │       │
    │       ├──< Scan
    │       │       │
    │       │       └──1 ScanResult
    │       │
    │       ├──1 AuthenticationConfig
    │       │
    │       ├──< ScanSchedule
    │       │
    │       └──< CICDIntegration
    │
    └──< AuditLog (existing)
```

## New Entities

### Project

Represents a target application configured for security testing.

```prisma
model Project {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  description    String?
  targetUrl      String   // Base URL for scanning
  repositoryUrl  String?  // Optional: linked source code repo
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization        Organization          @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  authenticationConfig AuthenticationConfig?
  scans               Scan[]
  schedules           ScanSchedule[]
  integrations        CICDIntegration[]

  @@index([organizationId])
}
```

**Validation Rules**:
- `targetUrl` must be a valid HTTPS URL
- `name` required, 1-100 characters
- One project per unique `(organizationId, targetUrl)` combination recommended

---

### Scan

Represents a single security test execution.

```prisma
model Scan {
  id                String     @id @default(cuid())
  organizationId    String     // Denormalized for query efficiency
  projectId         String
  status            ScanStatus @default(PENDING)
  source            ScanSource @default(MANUAL)
  temporalWorkflowId String?   // Temporal workflow ID for tracking

  // Timing
  startedAt         DateTime?
  completedAt       DateTime?
  durationMs        Int?

  // Progress tracking (cached from Temporal)
  currentPhase      String?
  currentAgent      String?
  progressPercent   Int        @default(0)

  // Results summary (denormalized for list views)
  findingsCount     Int        @default(0)
  criticalCount     Int        @default(0)
  highCount         Int        @default(0)
  mediumCount       Int        @default(0)
  lowCount          Int        @default(0)

  // Error handling
  errorMessage      String?
  errorCode         String?

  // Metadata
  metadata          Json?      // PR info, schedule info, etc.
  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt

  organization      Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  project           Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  result            ScanResult?

  @@index([organizationId])
  @@index([projectId])
  @@index([status])
  @@index([createdAt])
}

enum ScanStatus {
  PENDING      // Queued, waiting for slot
  RUNNING      // Actively scanning
  COMPLETED    // Finished successfully
  FAILED       // Finished with error
  CANCELLED    // User cancelled
  TIMEOUT      // Exceeded max duration
}

enum ScanSource {
  MANUAL       // User-triggered via UI
  SCHEDULED    // Triggered by schedule
  CICD         // Triggered by CI/CD integration (PR)
  API          // Triggered via API
}
```

**Validation Rules**:
- `progressPercent` must be 0-100
- `durationMs` calculated as `completedAt - startedAt` on completion
- `temporalWorkflowId` required when status moves to RUNNING

**State Transitions**:
```
PENDING → RUNNING → COMPLETED
                  → FAILED
                  → TIMEOUT
        → CANCELLED (from PENDING or RUNNING)
```

---

### ScanResult

Contains the detailed results and deliverables from a completed scan.

```prisma
model ScanResult {
  id              String   @id @default(cuid())
  scanId          String   @unique

  // Report storage (S3/blob paths)
  reportHtmlPath  String?  // tenant-{orgId}/scans/{scanId}/report.html
  reportPdfPath   String?  // tenant-{orgId}/scans/{scanId}/report.pdf
  reportMdPath    String?  // tenant-{orgId}/scans/{scanId}/report.md
  rawOutputPath   String?  // tenant-{orgId}/scans/{scanId}/deliverables/

  // Metrics (from Temporal workflow)
  totalTokensUsed Int?
  totalCostUsd    Decimal? @db.Decimal(10, 4)
  agentMetrics    Json?    // Per-agent token counts, durations

  // Executive summary (cached for quick access)
  executiveSummary String?  @db.Text
  riskScore        Int?     // 0-100

  createdAt       DateTime @default(now())

  scan            Scan     @relation(fields: [scanId], references: [id], onDelete: Cascade)
}
```

**Validation Rules**:
- `riskScore` must be 0-100 if set
- Storage paths follow pattern: `tenant-{orgId}/scans/{scanId}/*`
- `totalCostUsd` precision: 4 decimal places (e.g., $0.0123)

---

### AuthenticationConfig

Stores encrypted authentication credentials for a project.

```prisma
model AuthenticationConfig {
  id             String     @id @default(cuid())
  projectId      String     @unique
  method         AuthMethod

  // Encrypted credentials (AES-256-GCM with org-derived key)
  encryptedCredentials String  // JSON encrypted: { username, password, token, etc. }

  // Non-sensitive config
  loginUrl       String?    // For form-based auth
  usernameSelector String?  // CSS selector for username field
  passwordSelector String?  // CSS selector for password field
  submitSelector   String?  // CSS selector for submit button
  successIndicator String?  // CSS selector to verify successful login
  totpEnabled    Boolean    @default(false)
  totpSelector   String?    // CSS selector for TOTP field

  // Validation state
  lastValidatedAt DateTime?
  validationStatus String?  // valid, invalid, untested

  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt

  project        Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)
}

enum AuthMethod {
  NONE          // No authentication required
  FORM          // Form-based login
  API_TOKEN     // Bearer token / API key
  BASIC         // HTTP Basic Auth
  SSO           // SSO redirect (limited support)
}
```

**Validation Rules**:
- `encryptedCredentials` format: `{iv}:{authTag}:{ciphertext}` (base64)
- For FORM method: `loginUrl`, `usernameSelector`, `passwordSelector`, `submitSelector` required
- For API_TOKEN: token stored in `encryptedCredentials`
- For BASIC: username/password stored in `encryptedCredentials`

**Security**:
- Credentials encrypted with org-specific derived key
- Never log or expose decrypted credentials
- Decrypt only at scan execution time

---

### ScanSchedule

Defines recurring scan schedules for a project.

```prisma
model ScanSchedule {
  id                  String          @id @default(cuid())
  projectId           String
  name                String          // e.g., "Weekly Production Scan"
  cronExpression      String          // e.g., "0 0 * * 1" (Monday midnight)
  timezone            String          @default("UTC")
  status              ScheduleStatus  @default(ACTIVE)

  // Temporal schedule ID
  temporalScheduleId  String?         @unique

  // Configuration
  notifyOnComplete    Boolean         @default(true)
  notifyEmails        String[]        // Additional emails beyond org members

  // Tracking
  lastRunAt           DateTime?
  nextRunAt           DateTime?
  totalRuns           Int             @default(0)

  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt

  project             Project         @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId])
  @@index([status])
}

enum ScheduleStatus {
  ACTIVE    // Schedule is running
  PAUSED    // Temporarily paused
  DELETED   // Soft deleted (for audit trail)
}
```

**Validation Rules**:
- `cronExpression` must be valid cron syntax (5-field)
- `timezone` must be valid IANA timezone
- Max 10 schedules per project

**Cron Presets**:
| Preset | Expression | Description |
|--------|------------|-------------|
| Daily | `0 0 * * *` | Midnight daily |
| Weekly | `0 0 * * 1` | Monday midnight |
| Biweekly | `0 0 1,15 * *` | 1st and 15th of month |

---

### CICDIntegration

Links a project to a CI/CD provider for automated PR scanning.

```prisma
model CICDIntegration {
  id                    String              @id @default(cuid())
  projectId             String
  provider              CICDProvider

  // GitHub-specific
  repositoryFullName    String?             // e.g., "owner/repo"
  installationId        Int?                // GitHub App installation ID

  // Configuration
  severityThreshold     SeverityLevel       @default(HIGH)  // Block PRs at this level and above
  autoComment           Boolean             @default(true)  // Post comment on PR
  failOpen              Boolean             @default(true)  // Allow PR if Shannon unreachable

  // Status
  status                IntegrationStatus   @default(ACTIVE)
  lastWebhookAt         DateTime?

  createdAt             DateTime            @default(now())
  updatedAt             DateTime            @updatedAt

  project               Project             @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([provider, repositoryFullName])
  @@index([projectId])
}

enum CICDProvider {
  GITHUB        // GitHub Actions (MVP)
  // GITLAB     // Post-MVP
  // AZURE_DEVOPS // Post-MVP
}

enum SeverityLevel {
  CRITICAL
  HIGH
  MEDIUM
  LOW
  INFO
}

enum IntegrationStatus {
  ACTIVE
  PAUSED
  ERROR         // Webhook delivery failures
  DISCONNECTED  // App uninstalled
}
```

**Validation Rules**:
- For GITHUB: `repositoryFullName` and `installationId` required
- One integration per `(provider, repositoryFullName)` pair
- `severityThreshold` defaults to HIGH (block critical and high findings)

---

## Schema Extensions

### Organization Extension

Add relation to projects:

```prisma
model Organization {
  // ... existing fields ...

  projects    Project[]
  scans       Scan[]      // For org-level queries
}
```

### Indexes for Performance

```prisma
// Scan listing with filters
@@index([organizationId, status, createdAt])

// Finding scans by temporal workflow
@@index([temporalWorkflowId])

// Schedule next-run lookup
@@index([status, nextRunAt])
```

---

## Data Retention

Per FR-020, scan data is retained for 12 months:

```sql
-- Scheduled cleanup job (monthly)
DELETE FROM "ScanResult"
WHERE "createdAt" < NOW() - INTERVAL '12 months';

DELETE FROM "Scan"
WHERE "createdAt" < NOW() - INTERVAL '12 months';
```

Note: Audit logs are retained longer (per constitution: 1+ year).

---

## Migration Strategy

1. **Phase 1**: Add Project, Scan, ScanResult models
2. **Phase 2**: Add AuthenticationConfig (after encryption utility ready)
3. **Phase 3**: Add ScanSchedule (after Temporal Schedules integration)
4. **Phase 4**: Add CICDIntegration (after GitHub App setup)

Each migration is backward compatible; no breaking changes to existing models.
