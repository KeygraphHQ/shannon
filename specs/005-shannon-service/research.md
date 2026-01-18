# Research: Shannon Service Architecture

**Feature**: 005-shannon-service
**Date**: 2026-01-18
**Status**: Complete

## Research Tasks

This document resolves all "NEEDS CLARIFICATION" items from the Technical Context and researches best practices for key technology decisions.

---

## 1. HTTP Framework Selection

**Question**: Which HTTP framework for the service layer - Express or Fastify?

### Decision: **Fastify**

### Rationale

1. **Performance**: Fastify is ~2x faster than Express for JSON serialization, critical for <500ms p95 target
2. **TypeScript-first**: Built-in TypeScript support with proper type inference for routes
3. **Schema validation**: Native JSON Schema support for request/response validation (integrates with Zod)
4. **Hooks system**: Clean middleware pattern for auth, rate limiting, error handling
5. **OpenAPI integration**: `@fastify/swagger` auto-generates OpenAPI from route schemas
6. **Modern async**: Built on async/await, no callback patterns

### Alternatives Considered

| Framework | Pros | Cons | Why Rejected |
|-----------|------|------|--------------|
| Express | Most popular, extensive middleware ecosystem | Callback-based, slower, manual TypeScript | Performance concerns, dated patterns |
| Hono | Ultra-fast, edge-ready | Smaller ecosystem, less mature | Less battle-tested for long-running services |
| NestJS | Full framework, enterprise patterns | Heavy, opinionated, learning curve | Over-engineering for this scope |

### Implementation Notes

```typescript
// Recommended Fastify plugins
@fastify/cors          // CORS for web app
@fastify/helmet        // Security headers
@fastify/rate-limit    // Per-tenant rate limiting
@fastify/swagger       // OpenAPI generation
@fastify/sensible      // Useful utilities (httpErrors, etc.)
```

---

## 2. Service-to-Service Authentication

**Question**: How should the web app authenticate to the Shannon service?

### Decision: **Internal API Key with Organization Context**

### Rationale

1. **Simplicity**: API keys are simple to implement and well-understood
2. **Stateless**: No session management required, each request is independent
3. **Multi-tenant ready**: API key includes organization binding
4. **Audit trail**: API key usage is logged with correlation IDs
5. **No external dependency**: Unlike mTLS, doesn't require certificate management

### Authentication Flow

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│   Web App   │         │   Shannon    │         │   Database   │
│  (Next.js)  │         │   Service    │         │ (PostgreSQL) │
└──────┬──────┘         └──────┬───────┘         └──────┬───────┘
       │                       │                        │
       │  POST /api/v1/scans   │                        │
       │  Authorization: Bearer│sk_live_xxx             │
       │──────────────────────►│                        │
       │                       │                        │
       │                       │  SELECT * FROM APIKey  │
       │                       │  WHERE key_hash = ?    │
       │                       │───────────────────────►│
       │                       │                        │
       │                       │  {org_id, scopes}      │
       │                       │◄───────────────────────│
       │                       │                        │
       │                       │  Validate: org active, │
       │                       │  key not revoked,      │
       │                       │  scope allows action   │
       │                       │                        │
       │  200 OK / 401 / 403   │                        │
       │◄──────────────────────│                        │
```

### API Key Format

```
sk_live_org123_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
│   │    │      └── 32-char random hex
│   │    └── Organization ID prefix
│   └── Environment (live/test)
└── Prefix for identification
```

### Alternatives Considered

| Method | Pros | Cons | Why Rejected |
|--------|------|------|--------------|
| mTLS | Strongest auth, mutual verification | Complex certificate management, rotation | Over-engineering for internal service |
| JWT | Stateless, contains claims | Requires token refresh, more complex | API keys simpler for service-to-service |
| OAuth2 client credentials | Standard, supports scopes | Requires token endpoint, added complexity | Simpler patterns sufficient |

---

## 3. Database Schema Extension

**Question**: How should API keys be stored and managed?

### Decision: **Add APIKey model to shared Prisma schema**

### Rationale

1. **Shared schema**: Keeps all models in one place (`web/prisma/schema.prisma`)
2. **Existing patterns**: Follows Organization/User patterns already established
3. **Web UI management**: API keys created/revoked via web dashboard
4. **Service reads only**: Shannon service validates keys, doesn't create them

### Schema Addition

```prisma
model APIKey {
  id             String    @id @default(cuid())
  organizationId String
  name           String                    // Human-readable name
  keyPrefix      String    @unique         // First 8 chars for identification
  keyHash        String    @unique         // SHA-256 hash of full key
  scopes         String[]  @default(["scan:read", "scan:write"])
  lastUsedAt     DateTime?
  expiresAt      DateTime?                 // Null = never expires
  revokedAt      DateTime?                 // Null = active
  createdAt      DateTime  @default(now())
  createdBy      String                    // User ID who created

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@index([keyHash])
  @@index([keyPrefix])
}
```

### Key Scopes

| Scope | Description |
|-------|-------------|
| `scan:read` | Read scan progress, results, reports |
| `scan:write` | Create scans, cancel scans, retry scans |
| `auth:validate` | Use auth validation endpoint |
| `config:read` | Read configuration endpoints |
| `admin:*` | Admin operations (internal only) |

---

## 4. Rate Limiting Strategy

**Question**: How should rate limiting be implemented per the spec requirements?

### Decision: **Sliding window rate limit with Redis (optional in-memory fallback)**

### Rationale

1. **Per-tenant isolation**: Each organization has independent limits
2. **Per-key granularity**: Additional per-API-key limits possible
3. **Horizontal scaling**: Redis allows shared state across service instances
4. **Graceful degradation**: In-memory fallback if Redis unavailable

### Rate Limit Configuration

```typescript
const rateLimits = {
  default: {
    max: 1000,           // Requests per window
    window: '1 hour',    // Window duration
  },
  scan: {
    max: 10,             // Scan creates per window
    window: '1 hour',
  },
  validation: {
    max: 100,            // Auth validations per window
    window: '1 hour',
  },
};
```

### Response Headers

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 847
X-RateLimit-Reset: 2026-01-18T15:00:00Z
Retry-After: 3600  (only on 429)
```

### Implementation Notes

- Use `@fastify/rate-limit` plugin
- Key by API key hash for per-key limits
- Key by organization ID for aggregate limits
- Return 429 Too Many Requests with Retry-After header

---

## 5. Temporal Client Integration

**Question**: How should the service interact with existing Temporal workflows?

### Decision: **Reuse existing Temporal client, expose via service layer**

### Rationale

1. **No duplication**: Use existing `@temporalio/client` setup from `src/temporal/client.ts`
2. **Workflow queries**: Leverage existing queryable state for progress tracking
3. **Graceful degradation**: If Temporal unavailable, queue requests in PostgreSQL

### Integration Pattern

```typescript
// src/service/services/scan-service.ts
import { Connection, Client } from '@temporalio/client';
import { pentestPipelineWorkflow } from '../../temporal/workflows';

export class ScanService {
  private temporalClient: Client;

  async startScan(request: ScanRequest): Promise<ScanJob> {
    const workflowId = `scan-${request.organizationId}-${Date.now()}`;

    const handle = await this.temporalClient.workflow.start(pentestPipelineWorkflow, {
      taskQueue: 'pentest-queue',
      workflowId,
      args: [request.targetUrl, request.config],
    });

    // Store reference in database
    return this.persistScanJob(request, workflowId, handle.firstExecutionRunId);
  }

  async getProgress(scanId: string): Promise<ScanProgress> {
    const scan = await this.getScanJob(scanId);
    const handle = this.temporalClient.workflow.getHandle(scan.workflowId);

    // Query workflow for progress
    const progress = await handle.query('getProgress');
    return this.mapToScanProgress(progress);
  }
}
```

### Temporal Unavailability Handling

Per NFR-004, the service must handle Temporal unavailability:

1. **Health check**: `/health` reports `temporal: unavailable`
2. **Graceful queue**: Scan requests stored in PostgreSQL with `status: queued`
3. **Background retry**: Worker process retries queued scans every 30 seconds
4. **Client notification**: API returns 202 Accepted with `status: queued` for scans

---

## 6. Error Response Format

**Question**: What standard error format should the API use?

### Decision: **RFC 7807 Problem Details for HTTP APIs**

### Rationale

1. **Standard**: RFC 7807 is an IETF standard for error responses
2. **Rich context**: Includes type, title, detail, and custom extensions
3. **Machine-readable**: Consistent format for client error handling
4. **Request tracing**: Include request ID for support correlation

### Error Response Schema

```json
{
  "type": "https://shannon.dev/errors/auth/invalid-credentials",
  "title": "Invalid Credentials",
  "status": 401,
  "detail": "The provided API key is invalid or has been revoked",
  "instance": "/api/v1/scans",
  "requestId": "req_abc123xyz",
  "timestamp": "2026-01-18T14:30:00Z",
  "errors": [
    {
      "code": "AUTH_INVALID_KEY",
      "field": "authorization",
      "message": "API key not found"
    }
  ]
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AUTH_MISSING_KEY` | 401 | No Authorization header |
| `AUTH_INVALID_KEY` | 401 | API key not found or revoked |
| `AUTH_EXPIRED_KEY` | 401 | API key has expired |
| `AUTH_INSUFFICIENT_SCOPE` | 403 | API key lacks required scope |
| `AUTH_ORG_MISMATCH` | 403 | Resource belongs to different org |
| `SCAN_LIMIT_EXCEEDED` | 429 | Concurrent scan limit reached |
| `RATE_LIMIT_EXCEEDED` | 429 | Request rate limit exceeded |
| `VALIDATION_FAILED` | 400 | Request validation failed |
| `SCAN_NOT_FOUND` | 404 | Scan ID not found |
| `TEMPORAL_UNAVAILABLE` | 503 | Temporal server unavailable |

---

## 7. Scan State Machine

**Question**: What are the valid scan states and transitions?

### Decision: **6-state finite state machine**

### State Diagram

```
                    ┌──────────────────────────────────────────────┐
                    │                                              │
                    ▼                                              │
┌──────────┐    ┌──────────┐    ┌───────────┐    ┌───────────┐    │
│  QUEUED  │───►│ RUNNING  │───►│ COMPLETED │    │  FAILED   │◄───┘
└──────────┘    └──────────┘    └───────────┘    └───────────┘
     │               │                                 ▲
     │               │                                 │
     │               └─────────────────────────────────┘
     │                                                 │
     │          ┌────────────┐                         │
     └─────────►│ CANCELLED  │◄────────────────────────┘
                └────────────┘
```

### State Definitions

| State | Description | Transitions To |
|-------|-------------|----------------|
| `QUEUED` | Waiting for Temporal availability or slot | `RUNNING`, `CANCELLED` |
| `RUNNING` | Temporal workflow executing | `COMPLETED`, `FAILED`, `CANCELLED` |
| `COMPLETED` | Scan finished successfully | (terminal) |
| `FAILED` | Scan failed (can be retried) | (terminal, but allows `retry`) |
| `CANCELLED` | User cancelled | (terminal) |

### Retry Behavior

- Retry from `FAILED` creates a **new** scan with `parentScanId` reference
- Original scan remains in `FAILED` state (immutable audit trail)
- New scan starts in `QUEUED` state

---

## Summary

All research tasks complete. Key decisions:

1. **Fastify** for HTTP framework (performance, TypeScript, OpenAPI)
2. **Internal API keys** for service authentication (simple, stateless)
3. **Shared Prisma schema** with APIKey model extension
4. **Sliding window rate limiting** with Redis/in-memory fallback
5. **Reuse existing Temporal client** infrastructure
6. **RFC 7807** for error responses
7. **6-state FSM** for scan lifecycle

Proceed to Phase 1: Design & Contracts.
