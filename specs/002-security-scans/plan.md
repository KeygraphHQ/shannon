# Implementation Plan: Running Security Scans

**Branch**: `002-security-scans` | **Date**: 2026-01-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-security-scans/spec.md`

## Summary

Implement the core security scanning functionality for Shannon SaaS, enabling users to run penetration tests against their web applications. This includes quick scan initiation with minimal configuration, authenticated testing with multiple auth methods (form login, API tokens, Basic Auth, SSO, TOTP), real-time progress tracking via WebSocket, scan history/details viewing, scheduled recurring scans, and GitHub Actions CI/CD integration. The implementation leverages the existing Temporal workflow infrastructure and Claude Agent SDK for AI-powered security analysis.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js (ES2022)
**Primary Dependencies**: Next.js 16, React 19, Prisma 7.2, Clerk (auth), Temporal SDK, Claude Agent SDK
**Storage**: PostgreSQL 15+ with Prisma ORM (multi-tenant with organizationId scoping)
**Testing**: Jest/Vitest (to be configured), Playwright for E2E
**Target Platform**: Web SaaS (Next.js App Router)
**Project Type**: Web application (monorepo: /web for SaaS, /src for scan engine)
**Performance Goals**: Real-time updates every 5 seconds, authentication validation <10 seconds, scan start <5 seconds
**Constraints**: 3 concurrent scans per org (default, configurable), 60-minute max scan duration, 12-month data retention
**Scale/Scope**: Multi-tenant SaaS, thousands of organizations, scans/findings stored in PostgreSQL

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Security-First | PASS | Credentials encrypted with org-specific keys (FR-019), TOTP support, auth validation |
| II. AI-Native Architecture | PASS | Leverages existing Claude Agent SDK via Temporal workflows |
| III. Multi-Tenant Isolation | PASS | All queries scoped by organizationId, tenant-prefixed storage |
| IV. Temporal-First Orchestration | PASS | Extends existing pentestPipelineWorkflow, adds scheduling |
| V. Progressive Delivery | PASS | 5 prioritized user stories (P1-P5) independently testable |
| VI. Observability-Driven | PASS | Real-time progress tracking, audit logging, scan metrics |
| VII. Simplicity Over Complexity | PASS | Extends existing patterns, no new abstractions needed |

**Gate Result**: PASS - All principles satisfied. Proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/002-security-scans/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (OpenAPI specs)
└── tasks.md             # Phase 2 output (from /speckit.tasks)
```

### Source Code (repository root)

```text
web/
├── app/
│   ├── (dashboard)/
│   │   ├── scans/
│   │   │   ├── page.tsx                    # Scan history list
│   │   │   ├── [scanId]/page.tsx           # Scan detail view
│   │   │   └── new/page.tsx                # New scan form
│   │   ├── projects/
│   │   │   └── [projectId]/
│   │   │       ├── settings/page.tsx       # Project auth config
│   │   │       └── schedules/page.tsx      # Scheduled scans config
│   │   └── integrations/
│   │       └── github/page.tsx             # GitHub integration setup
│   └── api/
│       ├── scans/
│       │   ├── route.ts                    # POST: start scan, GET: list scans
│       │   └── [scanId]/
│       │       ├── route.ts                # GET: scan details, DELETE: cancel
│       │       └── progress/route.ts       # GET: real-time progress (SSE)
│       ├── projects/
│       │   └── [projectId]/
│       │       ├── auth/route.ts           # Auth config CRUD
│       │       └── schedules/route.ts      # Schedule CRUD
│       ├── integrations/
│       │   └── github/
│       │       ├── route.ts                # Integration setup
│       │       └── webhook/route.ts        # PR events handler
│       └── webhooks/
│           └── temporal/route.ts           # Scan completion notifications
├── components/
│   ├── scans/
│   │   ├── scan-progress.tsx               # Real-time progress display
│   │   ├── scan-history-table.tsx          # Scan list with filters
│   │   ├── scan-detail-card.tsx            # Scan summary card
│   │   └── start-scan-form.tsx             # Quick scan form
│   ├── auth-config/
│   │   ├── auth-method-selector.tsx        # Auth method dropdown
│   │   ├── form-auth-config.tsx            # Form login config
│   │   ├── api-token-config.tsx            # API token config
│   │   ├── basic-auth-config.tsx           # Basic auth config
│   │   └── totp-config.tsx                 # TOTP secret input
│   └── schedules/
│       ├── schedule-form.tsx               # Schedule configuration
│       └── schedule-list.tsx               # Active schedules
├── lib/
│   ├── actions/
│   │   ├── scans.ts                        # Scan server actions
│   │   ├── schedules.ts                    # Schedule server actions
│   │   └── integrations.ts                 # Integration server actions
│   ├── temporal/
│   │   └── client.ts                       # Temporal client for web app
│   ├── encryption.ts                       # Credential encryption utilities
│   └── github.ts                           # GitHub API helpers
└── prisma/
    └── schema.prisma                       # Extended with scan entities

src/temporal/
├── workflows.ts                            # Extended with scan scheduling
└── activities.ts                           # Extended with scan management
```

**Structure Decision**: Extends existing web application structure (Option 2: Web application). New pages/components added under existing `/web` directory. Temporal integration extended in `/src/temporal`.

## Complexity Tracking

> No constitution violations requiring justification.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |
