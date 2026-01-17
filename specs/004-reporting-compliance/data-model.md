# Data Model: Reporting & Compliance

**Feature**: 004-reporting-compliance
**Date**: 2026-01-17
**Status**: Complete

## Overview

This document defines the Prisma schema additions for the Reporting & Compliance feature. These models extend the existing schema in `web/prisma/schema.prisma`.

## Entity Relationship Diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│      Scan       │────▶│     Report      │────▶│   ReportShare   │
│   (existing)    │     │   (immutable)   │     │  (token-based)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │ ReportTemplate  │
                        │  (org-scoped)   │
                        └─────────────────┘

┌─────────────────┐     ┌─────────────────┐
│    Finding      │────▶│ComplianceMapping│
│   (existing)    │     │  (auto-mapped)  │
└─────────────────┘     └─────────────────┘

┌─────────────────┐     ┌─────────────────┐
│    Project      │────▶│ ReportSchedule  │
│   (existing)    │     │  (recurring)    │
└─────────────────┘     └─────────────────┘
```

## New Models

### Report

Generated security report (immutable after creation).

```prisma
// Report status enum
enum ReportStatus {
  GENERATING    // In progress
  COMPLETED     // Successfully generated
  FAILED        // Generation failed
}

// Report type enum
enum ReportType {
  EXECUTIVE     // Executive Summary template
  TECHNICAL     // Technical Detail template
  COMPLIANCE    // Compliance-Focused template
  CUSTOM        // Custom template
}

model Report {
  id               String       @id @default(cuid())
  organizationId   String       // Denormalized for query efficiency
  scanId           String
  templateId       String?      // Null for built-in templates
  type             ReportType
  status           ReportStatus @default(GENERATING)

  // Report metadata (immutable snapshot)
  title            String
  generatedAt      DateTime?
  generatedById    String       // User who triggered generation

  // Findings snapshot at generation time
  findingsCount    Int          @default(0)
  criticalCount    Int          @default(0)
  highCount        Int          @default(0)
  mediumCount      Int          @default(0)
  lowCount         Int          @default(0)
  riskScore        Int?         // 0-100

  // Compliance frameworks included (JSON array of framework IDs)
  frameworkIds     String[]     @default([])

  // Storage paths (tenant-prefixed)
  storagePath      String?      // tenant-{orgId}/reports/{reportId}/
  pdfPath          String?      // .../report.pdf
  htmlPath         String?      // .../report.html
  jsonPath         String?      // .../report.json

  // Template snapshot (JSON blob of template config at generation time)
  templateSnapshot Json?

  // Error handling
  errorMessage     String?

  // Soft delete (admin only, with audit log)
  deletedAt        DateTime?
  deletedById      String?

  createdAt        DateTime     @default(now())

  // Relations
  organization     Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  scan             Scan         @relation(fields: [scanId], references: [id], onDelete: Cascade)
  template         ReportTemplate? @relation(fields: [templateId], references: [id], onDelete: SetNull)
  shares           ReportShare[]
  accessLogs       ReportAccessLog[]

  @@index([organizationId])
  @@index([scanId])
  @@index([status])
  @@index([createdAt])
  @@index([organizationId, createdAt])
  @@index([deletedAt])
}
```

### ReportTemplate

Custom report template with organization branding.

```prisma
model ReportTemplate {
  id               String   @id @default(cuid())
  organizationId   String
  name             String
  description      String?

  // Branding
  logoUrl          String?
  primaryColor     String?  // Hex color
  secondaryColor   String?  // Hex color

  // Section configuration (JSON array of section IDs in order)
  // e.g., ["executive_summary", "risk_score", "findings", "compliance", "remediation"]
  sections         String[] @default([])

  // Custom content blocks (JSON)
  // { "header_text": "...", "footer_text": "...", "disclaimer": "..." }
  customContent    Json?

  // Org default flag
  isDefault        Boolean  @default(false)

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  createdById      String

  // Relations
  organization     Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  reports          Report[]

  @@unique([organizationId, name])
  @@index([organizationId])
  @@index([isDefault])
}
```

### ReportShare

Secure sharing of reports via token-based links.

```prisma
model ReportShare {
  id               String    @id @default(cuid())
  reportId         String
  tokenHash        String    @unique  // SHA-256 hash (token itself not stored)

  // Recipient info
  recipientEmail   String?            // Who it was shared with
  recipientName    String?
  message          String?            // Optional message from sender

  // Access control
  expiresAt        DateTime           // Default: 7 days from creation
  maxAccesses      Int?               // Optional limit (null = unlimited)
  accessCount      Int       @default(0)

  // Revocation
  revokedAt        DateTime?
  revokedById      String?

  // Watermark info (embedded in shared report)
  watermarkText    String?            // e.g., "Shared with john@example.com"

  createdAt        DateTime  @default(now())
  createdById      String

  // Relations
  report           Report    @relation(fields: [reportId], references: [id], onDelete: Cascade)
  accessLogs       ReportAccessLog[]

  @@index([reportId])
  @@index([expiresAt])
  @@index([tokenHash])
}
```

### ReportAccessLog

Audit trail for report access.

```prisma
model ReportAccessLog {
  id               String   @id @default(cuid())
  reportId         String
  shareId          String?  // Null if direct access by org member

  // Access details
  accessedAt       DateTime @default(now())
  accessedById     String?  // User ID if authenticated
  accessedByEmail  String?  // Email if via share link
  ipAddress        String?
  userAgent        String?

  // Access type
  accessType       String   // 'view', 'download_pdf', 'download_html', 'download_json', 'download_csv'

  // Relations
  report           Report      @relation(fields: [reportId], references: [id], onDelete: Cascade)
  share            ReportShare? @relation(fields: [shareId], references: [id], onDelete: SetNull)

  @@index([reportId])
  @@index([shareId])
  @@index([accessedAt])
  @@index([reportId, accessedAt])
}
```

### ReportSchedule

Automated report generation schedule.

```prisma
// Schedule frequency enum
enum ScheduleFrequency {
  DAILY
  WEEKLY
  MONTHLY
  CUSTOM     // Uses cronExpression
}

// Schedule status enum
enum ScheduleStatus {
  ACTIVE
  PAUSED
  FAILED     // Last run failed
}

model ReportSchedule {
  id                  String            @id @default(cuid())
  organizationId      String
  projectId           String

  // Schedule configuration
  name                String
  frequency           ScheduleFrequency
  cronExpression      String?           // For CUSTOM frequency
  timezone            String            @default("UTC")

  // Report configuration
  templateId          String?           // Null for default template
  reportType          ReportType        @default(EXECUTIVE)
  frameworkIds        String[]          @default([])

  // Recipients (JSON array of email addresses)
  recipients          String[]

  // Behavior when no new scans
  skipIfNoNewScans    Boolean           @default(true)

  // Status and tracking
  status              ScheduleStatus    @default(ACTIVE)
  temporalScheduleId  String?           // Temporal schedule handle

  // Last run info
  lastRunAt           DateTime?
  lastRunStatus       String?           // 'completed', 'skipped', 'failed'
  lastRunReportId     String?
  lastRunError        String?
  nextRunAt           DateTime?

  createdAt           DateTime          @default(now())
  updatedAt           DateTime          @updatedAt
  createdById         String

  // Relations
  organization        Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  project             Project           @relation(fields: [projectId], references: [id], onDelete: Cascade)
  template            ReportTemplate?   @relation(fields: [templateId], references: [id], onDelete: SetNull)
  runs                ScheduleRun[]

  @@index([organizationId])
  @@index([projectId])
  @@index([status])
  @@index([nextRunAt])
}

model ScheduleRun {
  id               String   @id @default(cuid())
  scheduleId       String

  // Run details
  startedAt        DateTime @default(now())
  completedAt      DateTime?
  status           String   // 'running', 'completed', 'skipped', 'failed'

  // Results
  reportId         String?  // Null if skipped or failed
  skipReason       String?  // 'no_new_scans', etc.
  errorMessage     String?

  // Relations
  schedule         ReportSchedule @relation(fields: [scheduleId], references: [id], onDelete: Cascade)

  @@index([scheduleId])
  @@index([startedAt])
}
```

### ComplianceMapping

Maps findings to compliance framework controls.

```prisma
model ComplianceMapping {
  id               String   @id @default(cuid())
  findingId        String

  // Framework reference
  frameworkId      String   // 'owasp-top-10-2021', 'pci-dss-4.0', etc.
  frameworkVersion String   // '2021', '4.0', etc.
  controlId        String   // 'A01', 'Req-6.2', etc.
  controlName      String   // Denormalized for display

  // Mapping confidence
  confidence       String   @default("auto") // 'auto', 'manual', 'verified'

  createdAt        DateTime @default(now())

  // Relations
  finding          Finding  @relation(fields: [findingId], references: [id], onDelete: Cascade)

  @@unique([findingId, frameworkId, controlId])
  @@index([findingId])
  @@index([frameworkId])
  @@index([controlId])
  @@index([frameworkId, controlId])
}
```

## Existing Model Extensions

### Organization (add relations)

```prisma
model Organization {
  // ... existing fields ...

  // NEW relations
  reports          Report[]
  reportTemplates  ReportTemplate[]
  reportSchedules  ReportSchedule[]
}
```

### Scan (add relation)

```prisma
model Scan {
  // ... existing fields ...

  // NEW relation
  reports          Report[]
}
```

### Finding (add relation)

```prisma
model Finding {
  // ... existing fields ...

  // NEW relation
  complianceMappings ComplianceMapping[]
}
```

### Project (add relation)

```prisma
model Project {
  // ... existing fields ...

  // NEW relation
  reportSchedules  ReportSchedule[]
}
```

## Validation Rules

| Entity | Rule | Implementation |
|--------|------|----------------|
| Report | Immutable after COMPLETED | Check status before any update |
| Report | Only org admin can delete | Role check + audit log |
| ReportShare | Token not stored | Only SHA-256 hash in database |
| ReportShare | Max 7 day expiration | Application-level default |
| ReportSchedule | Max 10 recipients | Zod validation on input |
| ComplianceMapping | Unique per finding+framework+control | Database constraint |

## State Transitions

### Report Status
```
GENERATING → COMPLETED (success)
GENERATING → FAILED (error)
```

### Schedule Status
```
ACTIVE → PAUSED (user paused)
PAUSED → ACTIVE (user resumed)
ACTIVE → FAILED (consecutive failures)
FAILED → ACTIVE (manual retry/fix)
```

## Indexes for Common Queries

| Query | Index |
|-------|-------|
| List reports for org | `organizationId, createdAt DESC` |
| List reports for scan | `scanId` |
| Find active schedules | `status, nextRunAt` |
| Compliance dashboard | `frameworkId, controlId` |
| Audit log by report | `reportId, accessedAt` |

## Migration Notes

1. Run after existing 002-security-scans migration
2. No data migration needed (new tables only)
3. Add foreign keys to existing tables (Organization, Scan, Finding, Project)
4. Seed compliance framework data separately (static TypeScript, not DB)
