# Implementation Plan: Running Security Scans

**Branch**: `002-security-scans` | **Date**: 2026-01-17 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-security-scans/spec.md`

## Summary

Implement a comprehensive security scanning system that allows users to run AI-powered penetration tests on their web applications. The core functionality includes one-click scan initiation (P1), authenticated testing with multiple auth methods (P2), scan history with filtering (P3), scheduled scans (P4), and GitHub CI/CD integration (P5). The system leverages the existing Temporal orchestration and Claude Agent SDK infrastructure for durable, crash-safe execution.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 20+)
**Primary Dependencies**:
- **Web App**: Next.js 16, React 19, Clerk (auth), TailwindCSS 4
- **Database**: Prisma 7.2 ORM with PostgreSQL
- **Orchestration**: Temporal SDK 1.11 (workflows, activities, workers)
- **AI Engine**: Claude Agent SDK 0.1 (security testing agents)

**Storage**: PostgreSQL (Prisma), tenant-prefixed object storage for reports
**Testing**: Vitest (recommended, not yet configured)
**Target Platform**: Web (Next.js App Router) + Docker containers
**Project Type**: Web application (monorepo: `/web` frontend + API, `/src` Temporal workers)

**Performance Goals**:
- Scan start within 5 seconds of submission (FR-001)
- Real-time progress updates every 5 seconds (SC-003)
- Auth validation feedback within 10 seconds (SC-004)

**Constraints**:
- Max 60 minutes scan duration with graceful timeout (FR-023)
- 3 concurrent scans per organization (default, configurable) (FR-021)
- 12 months data retention (FR-020)

**Scale/Scope**: Multi-tenant SaaS, tenant isolation via row-level security

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Security-First | ✅ PASS | Credentials encrypted with org-specific keys (FR-019), TLS required, audit logging in place |
| II. AI-Native Architecture | ✅ PASS | Leverages existing Claude Agent SDK infrastructure, AI reasoning logged via audit system |
| III. Multi-Tenant Isolation | ✅ PASS | All queries scoped by organizationId, storage prefixed with `tenant-{id}/`, RLS via Prisma |
| IV. Temporal-First Orchestration | ✅ PASS | All scan execution via Temporal workflows, heartbeats, queryable progress |
| V. Progressive Delivery | ✅ PASS | 5 user stories prioritized P1-P5, each independently testable |
| VI. Observability-Driven | ✅ PASS | Structured logs + metrics (FR-027), audit logging for security events |
| VII. Simplicity | ✅ PASS | Building on existing infrastructure, no new abstractions beyond spec requirements |

**Gate Result**: PASS - All constitutional principles satisfied.

## Project Structure

### Documentation (this feature)

```text
specs/002-security-scans/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (OpenAPI specs)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
web/                            # Next.js 16 web application
├── app/
│   ├── (auth)/                 # Auth routes (sign-in, sign-up)
│   ├── (dashboard)/            # Protected dashboard routes
│   │   ├── scans/              # ✅ Exists: scan list, detail, new scan
│   │   └── projects/           # ✅ Exists: project settings, auth config
│   └── api/
│       ├── scans/              # ✅ Exists: scan CRUD, progress
│       ├── projects/           # ✅ Exists: project CRUD, auth validation
│       └── webhooks/           # ✅ Exists: clerk, temporal webhooks
├── components/
│   ├── scans/                  # ✅ Exists: scan forms, tables, progress
│   ├── auth-config/            # ✅ Exists: auth method configuration
│   └── ui/                     # UI primitives
├── lib/
│   ├── actions/                # ✅ Exists: server actions for scans, projects
│   ├── temporal/               # ✅ Exists: Temporal client integration
│   └── *.ts                    # ✅ Exists: db, auth, audit, encryption
└── prisma/
    └── schema.prisma           # ✅ Exists: comprehensive scan schema

src/                            # Temporal workers (existing infrastructure)
├── temporal/
│   ├── workflows.ts            # Pentest pipeline workflow
│   ├── activities.ts           # Agent execution activities
│   └── worker.ts               # Worker entry point
└── ai/
    └── claude-executor.ts      # Claude Agent SDK integration
```

**Structure Decision**: Web application pattern. The existing infrastructure is well-organized with clear separation between:
- `/web` - Next.js frontend + API routes
- `/src` - Temporal workers and AI execution engine

New development focuses on:
1. Extending existing scan UI components for remaining user stories
2. Adding schedule and CI/CD database models
3. Implementing GitHub webhook integration
4. Adding export functionality (PDF/JSON)

## Complexity Tracking

> No violations - complexity justified by constitutional alignment.

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Auth encryption | AES-256-GCM with org keys | Constitution I requires strong encryption |
| Temporal orchestration | Required for scans | Constitution IV mandates Temporal-first |
| Multi-tenant queries | Row-level security | Constitution III requires tenant isolation |

## Post-Design Constitution Re-Check

*Re-evaluated after Phase 1 design completion.*

| Principle | Status | Post-Design Evidence |
|-----------|--------|----------------------|
| I. Security-First | ✅ PASS | AES-256-GCM encryption (research.md #2), SARIF export format, webhook signature validation |
| II. AI-Native Architecture | ✅ PASS | Claude Agent SDK for scan execution, AI reasoning captured in audit system |
| III. Multi-Tenant Isolation | ✅ PASS | All new models include organizationId, storage paths prefixed `tenant-{id}/` |
| IV. Temporal-First Orchestration | ✅ PASS | Schedules via Temporal API (research.md #3), queue management via Temporal workflows |
| V. Progressive Delivery | ✅ PASS | Data model supports incremental rollout (P1→P5), each story independently testable |
| VI. Observability-Driven | ✅ PASS | SSE for real-time updates, structured logging, scan metrics tracked |
| VII. Simplicity | ✅ PASS | Puppeteer for PDF (not over-engineered), Resend for email (managed service) |

**Post-Design Gate Result**: PASS - All constitutional principles remain satisfied after design decisions.

## Generated Artifacts

| Artifact | Path | Purpose |
|----------|------|---------|
| Research | [research.md](research.md) | Technology decisions and rationale |
| Data Model | [data-model.md](data-model.md) | Entity definitions and schema extensions |
| API Contracts | [contracts/openapi.yaml](contracts/openapi.yaml) | OpenAPI 3.1 specification |
| Quickstart | [quickstart.md](quickstart.md) | Developer onboarding guide |

## Next Steps

1. Run `/speckit.tasks` to generate implementation tasks from this plan
2. Review and approve generated tasks
3. Begin implementation following priority order (P1 → P5)
