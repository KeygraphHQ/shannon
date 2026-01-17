# Implementation Plan: Findings & Remediation Management

**Branch**: `003-findings-remediation` | **Date**: 2026-01-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-findings-remediation/spec.md`

## Summary

This epic adds findings management and remediation tracking capabilities to Shannon's web dashboard. The implementation extends the existing Finding model (which already has status, severity, and evidence fields) with new entities for notes and audit logging. The primary technical approach uses Next.js server actions for mutations, Prisma for data persistence, and client components for interactive filtering and status updates.

## Technical Context

**Language/Version**: TypeScript 5.0+ on Node.js (ES2017 target, ESNext modules)
**Primary Dependencies**: Next.js 16.1.2, React 19.2.3, Prisma 7.2.0, Tailwind CSS v4, Clerk Auth, Zod v4.3.5, lucide-react
**Storage**: PostgreSQL via Prisma ORM with @prisma/adapter-pg
**Testing**: Manual/integration testing (no unit test framework configured)
**Target Platform**: Web SaaS (Vercel-ready Next.js deployment)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: Filter results <1s (SC-003), Bulk updates 50 findings <5s (SC-004), Search <2s (SC-006)
**Constraints**: Organization-scoped access (multi-tenant), 10,000 char note limit, 2-year audit log retention
**Scale/Scope**: Cross-scan findings view, bulk operations up to 50+ findings

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Security-First | ✅ PASS | FR-014 enforces org-level access; FR-017 requires 2-year audit retention; all status changes logged |
| II. AI-Native Architecture | ✅ PASS | N/A - This epic is UI/data management, not AI execution |
| III. Multi-Tenant Isolation | ✅ PASS | All queries scoped by organizationId; FR-014 explicitly requires org-level access controls |
| IV. Temporal-First Orchestration | ✅ PASS | N/A - No long-running workflows; CRUD operations only |
| V. Progressive Delivery | ✅ PASS | 4 prioritized user stories (P1-P4), each independently testable |
| VI. Observability-Driven | ✅ PASS | FR-004, FR-013, FR-017 require audit logging for all status changes |
| VII. Simplicity | ✅ PASS | Extends existing models; no new infrastructure; follows established patterns |

**Gate Result**: PASS - No violations. Proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/003-findings-remediation/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (API contracts)
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
web/
├── prisma/
│   └── schema.prisma        # Extend Finding model, add FindingNote, FindingActivity
├── lib/
│   ├── actions/
│   │   ├── findings.ts      # NEW: Server actions for finding CRUD
│   │   └── scans.ts         # MODIFY: Add cross-scan findings query
│   └── db.ts                # Existing Prisma client
├── app/
│   ├── (dashboard)/
│   │   ├── findings/
│   │   │   ├── page.tsx     # NEW: Cross-scan findings list
│   │   │   └── [findingId]/
│   │   │       └── page.tsx # NEW: Finding detail view
│   │   └── scans/
│   │       └── [scanId]/
│   │           └── page.tsx # MODIFY: Link to finding details
│   └── api/
│       └── findings/
│           ├── route.ts     # NEW: List/search findings API
│           └── [findingId]/
│               ├── route.ts # NEW: Get/update finding
│               ├── status/
│               │   └── route.ts # NEW: Status change endpoint
│               └── notes/
│                   └── route.ts # NEW: Add/list notes
└── components/
    ├── findings/
    │   ├── finding-detail.tsx      # NEW: Detail view component
    │   ├── finding-status-select.tsx # NEW: Status dropdown with justification
    │   ├── finding-activity.tsx    # NEW: Activity history
    │   ├── finding-note-form.tsx   # NEW: Note input
    │   ├── findings-list.tsx       # NEW: Filterable list
    │   ├── findings-filters.tsx    # NEW: Filter controls
    │   └── findings-bulk-actions.tsx # NEW: Bulk toolbar
    └── dashboard/
        └── findings-widget.tsx     # NEW: Dashboard summary widget
```

**Structure Decision**: Web application pattern - extends existing Next.js app router structure under `web/`. New routes under `(dashboard)/findings/` for cross-scan view, new components under `components/findings/`.

## Complexity Tracking

> No violations to justify - all gates passed.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |
