# Data Model: Shannon Service Architecture

**Feature**: 005-shannon-service
**Date**: 2026-01-18
**Status**: Complete

## Overview

This document defines the data model for the Shannon Service layer. It extends the existing Prisma schema (`ghostshell/prisma/schema.prisma`) with service-specific entities while maintaining compatibility with the existing Organization, User, and Scan models.

## Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   Organization  │       │     APIKey      │       │      Scan       │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id              │◄──────│ organizationId  │       │ id              │
│ name            │       │ id              │       │ organizationId  │──┐
│ slug            │       │ name            │       │ targetUrl       │  │
│ plan            │       │ keyPrefix       │       │ status          │  │
└─────────────────┘       │ keyHash         │       │ workflowId      │  │
         ▲                │ scopes[]        │       │ parentScanId    │──┘
         │                │ expiresAt       │       │ config          │
         │                │ revokedAt       │       └─────────────────┘
         │                └─────────────────┘                │
         │                                                   │
         │                                                   ▼
         │                ┌─────────────────┐       ┌─────────────────┐
         │                │   ReportJob     │       │  ScanProgress   │
         │                ├─────────────────┤       ├─────────────────┤
         │                │ id              │       │ (Temporal Query)│
         └────────────────│ scanId          │       │ phase           │
                          │ format          │       │ percentage      │
                          │ status          │       │ agentStatuses   │
                          │ outputPath      │       │ eta             │
                          └─────────────────┘       └─────────────────┘
```

## Entity Definitions

### APIKey (NEW)

Authentication credential for service access, scoped to a single organization.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `String` | PK, cuid() | Unique identifier |
| `organizationId` | `String` | FK → Organization | Owner organization |
| `name` | `String` | Required | Human-readable name (e.g., "Production Web App") |
| `keyPrefix` | `String` | Unique | First 8 chars of key for identification |
| `keyHash` | `String` | Unique | SHA-256 hash of full key (never store plaintext) |
| `scopes` | `String[]` | Default: ["scan:read", "scan:write"] | Allowed operations |
| `lastUsedAt` | `DateTime?` | Optional | Last successful authentication |
| `expiresAt` | `DateTime?` | Optional | Expiration date (null = never) |
| `revokedAt` | `DateTime?` | Optional | Revocation date (null = active) |
| `createdAt` | `DateTime` | Default: now() | Creation timestamp |
| `createdBy` | `String` | FK → User | User who created the key |

**Indexes**: `organizationId`, `keyHash`, `keyPrefix`

**Validation Rules**:
- Key is active if: `revokedAt IS NULL AND (expiresAt IS NULL OR expiresAt > NOW())`
- `keyPrefix` must be exactly 8 characters
- `keyHash` must be 64 characters (SHA-256 hex)

**Prisma Schema**:
```prisma
model APIKey {
  id             String    @id @default(cuid())
  organizationId String
  name           String
  keyPrefix      String    @unique
  keyHash        String    @unique
  scopes         String[]  @default(["scan:read", "scan:write"])
  lastUsedAt     DateTime?
  expiresAt      DateTime?
  revokedAt      DateTime?
  createdAt      DateTime  @default(now())
  createdBy      String

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@index([keyHash])
  @@index([keyPrefix])
}
```

---

### Scan (EXTEND existing)

The existing Scan model needs additional fields to support the service layer.

**New Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `parentScanId` | `String?` | FK → Scan (self) | Reference to original scan if this is a retry |
| `queuedAt` | `DateTime?` | Optional | When scan was queued (if Temporal unavailable) |
| `apiKeyId` | `String?` | FK → APIKey | API key that initiated the scan |

**State Machine**:

| Status | Description | Valid Transitions |
|--------|-------------|-------------------|
| `QUEUED` | Waiting for execution slot | → `RUNNING`, `CANCELLED` |
| `RUNNING` | Temporal workflow active | → `COMPLETED`, `FAILED`, `CANCELLED` |
| `COMPLETED` | Finished successfully | (terminal) |
| `FAILED` | Failed with error | (terminal, allows retry) |
| `CANCELLED` | User cancelled | (terminal) |

**Prisma Schema Extension**:
```prisma
model Scan {
  // ... existing fields ...

  // New service layer fields
  parentScanId String?
  queuedAt     DateTime?
  apiKeyId     String?

  parentScan   Scan?   @relation("ScanRetry", fields: [parentScanId], references: [id])
  retries      Scan[]  @relation("ScanRetry")
  apiKey       APIKey? @relation(fields: [apiKeyId], references: [id], onDelete: SetNull)

  @@index([parentScanId])
  @@index([apiKeyId])
}
```

---

### ReportJob (NEW)

Async report generation job with status tracking.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `String` | PK, cuid() | Unique identifier |
| `scanId` | `String` | FK → Scan | Source scan for report |
| `organizationId` | `String` | FK → Organization | Owner organization (denormalized for queries) |
| `format` | `String` | Enum: PDF, HTML, JSON, SARIF | Report output format |
| `template` | `String?` | Optional | Report template name |
| `status` | `String` | Enum: PENDING, GENERATING, COMPLETED, FAILED | Current status |
| `progress` | `Int` | Default: 0, Range: 0-100 | Generation progress percentage |
| `outputPath` | `String?` | Optional | Path to generated report file |
| `errorMessage` | `String?` | Optional | Error details if failed |
| `createdAt` | `DateTime` | Default: now() | Job creation time |
| `completedAt` | `DateTime?` | Optional | Job completion time |

**Indexes**: `scanId`, `organizationId`, `status`

**Prisma Schema**:
```prisma
model ReportJob {
  id             String    @id @default(cuid())
  scanId         String
  organizationId String
  format         String    // PDF, HTML, JSON, SARIF
  template       String?
  status         String    @default("PENDING") // PENDING, GENERATING, COMPLETED, FAILED
  progress       Int       @default(0)
  outputPath     String?
  errorMessage   String?
  createdAt      DateTime  @default(now())
  completedAt    DateTime?

  scan         Scan         @relation(fields: [scanId], references: [id], onDelete: Cascade)
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([scanId])
  @@index([organizationId])
  @@index([status])
}
```

---

### ScanProgress (Runtime Query Object)

Real-time progress snapshot queried from Temporal workflow. **Not persisted in database**.

| Field | Type | Description |
|-------|------|-------------|
| `scanId` | `String` | Scan identifier |
| `status` | `String` | Current scan status |
| `phase` | `String` | Current phase: pre-recon, recon, vuln, exploit, report |
| `percentage` | `Int` | Overall progress (0-100) |
| `agentStatuses` | `AgentStatus[]` | Per-agent status array |
| `startedAt` | `DateTime` | When scan started |
| `eta` | `DateTime?` | Estimated completion time |
| `currentActivity` | `String?` | Human-readable current activity |

**AgentStatus** (nested object):
| Field | Type | Description |
|-------|------|-------------|
| `agentId` | `String` | Agent identifier |
| `name` | `String` | Agent display name |
| `status` | `String` | pending, running, completed, failed, skipped |
| `startedAt` | `DateTime?` | When agent started |
| `completedAt` | `DateTime?` | When agent completed |

---

### ValidationRequest (Request DTO)

Auth validation request payload. **Not persisted** (ephemeral per spec clarification).

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `targetUrl` | `String` | Required, URL format | Target application URL |
| `authMethod` | `String` | Enum | Auth type: form, api_token, basic, sso |
| `credentials` | `Object` | Required | Method-specific credentials |
| `totpSecret` | `String?` | Optional | TOTP secret for 2FA |

**Credentials by Auth Method**:

| Method | Required Fields |
|--------|-----------------|
| `form` | `loginUrl`, `usernameField`, `passwordField`, `username`, `password` |
| `api_token` | `headerName`, `token` |
| `basic` | `username`, `password` |
| `sso` | `provider`, `idpUrl`, `credentials` |

---

### ValidationResult (Response DTO)

Auth validation response. **Not persisted**.

| Field | Type | Description |
|-------|------|-------------|
| `valid` | `Boolean` | Whether validation succeeded |
| `validatedAt` | `DateTime` | When validation was performed |
| `error` | `String?` | Error message if failed |
| `errorCode` | `String?` | Machine-readable error code |

**Error Codes**:
| Code | Description |
|------|-------------|
| `AUTH_INVALID_CREDENTIALS` | Username/password incorrect |
| `AUTH_TARGET_UNREACHABLE` | Cannot connect to target |
| `AUTH_TOTP_INVALID` | TOTP code rejected |
| `AUTH_SSO_FAILED` | SSO flow failed |
| `AUTH_TIMEOUT` | Validation timed out |

---

## TypeScript Type Definitions

```typescript
// src/service/types/api.ts

export type ScanStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type ReportFormat = 'PDF' | 'HTML' | 'JSON' | 'SARIF';

export type ReportJobStatus = 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED';

export type AuthMethod = 'form' | 'api_token' | 'basic' | 'sso';

export interface APIKeyScope {
  'scan:read': boolean;
  'scan:write': boolean;
  'auth:validate': boolean;
  'config:read': boolean;
  'admin:*': boolean;
}

export interface ScanProgress {
  scanId: string;
  status: ScanStatus;
  phase: string;
  percentage: number;
  agentStatuses: AgentStatus[];
  startedAt: Date;
  eta?: Date;
  currentActivity?: string;
}

export interface AgentStatus {
  agentId: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: Date;
  completedAt?: Date;
}

export interface ValidationRequest {
  targetUrl: string;
  authMethod: AuthMethod;
  credentials: Record<string, string>;
  totpSecret?: string;
}

export interface ValidationResult {
  valid: boolean;
  validatedAt: Date;
  error?: string;
  errorCode?: string;
}
```

---

## Migration Strategy

1. **Add APIKey model** - New table, no data migration needed
2. **Extend Scan model** - Add nullable fields (`parentScanId`, `queuedAt`, `apiKeyId`)
3. **Add ReportJob model** - New table, no data migration needed
4. **Add indexes** - Performance optimization for service queries
5. **Update Organization relations** - Add `apiKeys` and `reportJobs` relations

**Migration Order**:
1. `npx prisma migrate dev --name add_api_key_model`
2. `npx prisma migrate dev --name extend_scan_for_service`
3. `npx prisma migrate dev --name add_report_job_model`
