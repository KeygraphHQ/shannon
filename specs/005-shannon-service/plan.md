# Implementation Plan: Shannon Service Architecture

**Branch**: `005-shannon-service` | **Date**: 2026-01-18 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/005-shannon-service/spec.md`

## Summary

Transform the existing Shannon penetration testing engine (`/src/`) into a standalone HTTP service with REST API contracts. The service wraps existing Temporal workflows, exposes scan lifecycle operations, health monitoring, and configuration discovery endpoints. Consumed by the Next.js web application via internal API keys over private network.

## Technical Context

**Language/Version**: TypeScript 5.9 / Node.js 22 (ES Modules)
**Primary Dependencies**: @temporalio/*, @anthropic-ai/claude-agent-sdk, Zod, Fastify
**Storage**: PostgreSQL (shared with web app via Prisma schema extension)
**Testing**: Vitest (to be added), integration tests with Temporal test server
**Target Platform**: Linux server (Docker container), Kubernetes-ready
**Project Type**: Web application (backend service consumed by Next.js frontend)
**Performance Goals**: <500ms p95 for GET endpoints, <2s p95 for POST /scans
**Constraints**: 100 concurrent API requests, <30s startup, multi-tenant isolation
**Scale/Scope**: Multi-tenant SaaS, 3 concurrent scans per org (configurable)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| **I. Security-First** | ✅ PASS | API key auth, org-level isolation, no credential persistence, 403 on cross-org access |
| **II. AI-Native Architecture** | ✅ PASS | Claude Agent SDK preserved, Temporal workflows wrapped (not replaced) |
| **III. Multi-Tenant Isolation** | ✅ PASS | API keys scoped to single org, all queries filtered by organizationId, 403 enforcement |
| **IV. Temporal-First Orchestration** | ✅ PASS | Service wraps existing workflows, heartbeats preserved, queryable state via API |
| **V. Progressive Delivery** | ✅ PASS | P1/P2/P3 stories independently testable, MVP = User Stories 1+2 |
| **VI. Observability-Driven** | ✅ PASS | /metrics Prometheus endpoint, structured logging, correlation IDs |
| **VII. Simplicity** | ✅ PASS | REST-only v1 (no gRPC), shared database, minimal new abstractions |

**Gate Result**: PASS - No violations. Proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/005-shannon-service/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (OpenAPI spec)
│   └── openapi.yaml
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
# Existing structure (preserved)
src/
├── ai/                  # Claude Agent SDK integration
├── audit/               # Crash-safe logging system
├── cli/                 # CLI input validation
├── phases/              # Pre-recon, reporting phases
├── prompts/             # AI prompt templates
├── temporal/            # Temporal workflows, activities, worker
├── types/               # TypeScript type definitions
└── utils/               # Shared utilities

# New service layer (to be added)
src/
├── service/             # NEW: HTTP service layer
│   ├── app.ts           # Express/Fastify app setup
│   ├── middleware/      # Auth, rate limiting, error handling
│   │   ├── auth.ts
│   │   ├── rate-limit.ts
│   │   └── error-handler.ts
│   ├── routes/          # API route handlers
│   │   ├── scans.ts
│   │   ├── health.ts
│   │   ├── auth-validate.ts
│   │   ├── config.ts
│   │   └── reports.ts
│   ├── services/        # Business logic services
│   │   ├── scan-service.ts
│   │   ├── progress-service.ts
│   │   └── report-service.ts
│   └── types/           # API-specific types
│       └── api.ts
└── temporal/
    └── activities/
        └── validate-auth.ts  # Exists, may need enhancement

# Web app changes (minimal)
web/
├── lib/
│   └── shannon-client.ts    # NEW: API client for service
└── prisma/
    └── schema.prisma        # EXTEND: Add APIKey model
```

**Structure Decision**: Option 2 (Web application) - Existing monorepo with `/src/` for service backend and `/web/` for Next.js frontend. Service layer added under `src/service/` to avoid disrupting existing Temporal infrastructure.

## Complexity Tracking

> No constitution violations - table not required.

---

## Phase 0: Research Findings

See [research.md](research.md) for detailed research outcomes.

## Phase 1: Design Artifacts

- [data-model.md](data-model.md) - Entity definitions and relationships
- [contracts/openapi.yaml](contracts/openapi.yaml) - OpenAPI 3.1 specification
- [quickstart.md](quickstart.md) - Developer setup guide
