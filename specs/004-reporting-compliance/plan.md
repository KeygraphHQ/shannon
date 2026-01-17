# Implementation Plan: Reporting & Compliance

**Branch**: `004-reporting-compliance` | **Date**: 2026-01-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-reporting-compliance/spec.md`

## Summary

This epic adds comprehensive reporting and compliance capabilities to Shannon SaaS, enabling users to generate professional security reports from scan results, map findings to compliance frameworks (OWASP Top 10, PCI-DSS, SOC 2, CIS Controls), share reports via secure links, schedule automated report delivery, and view organization-wide compliance dashboards. Reports are immutable audit artifacts with team-based access control.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 20+ runtime)
**Primary Dependencies**:
- Backend: Next.js 16, Prisma 7, Temporal SDK
- Frontend: React 19, Tailwind CSS 4, Lucide React
- Auth: Clerk
- PDF Generation: NEEDS CLARIFICATION (research required)
**Storage**: PostgreSQL (via Prisma), S3-compatible blob storage for generated reports
**Testing**: Jest/Vitest for unit tests, Playwright for E2E
**Target Platform**: Web application (SaaS)
**Project Type**: Web application (Next.js full-stack)
**Performance Goals**:
- Report generation <30s for <100 findings
- Dashboard load <5s
- Export <10s for <500 findings
**Constraints**:
- Max 5 concurrent report generations per org
- Reports immutable after generation
- 12-month retention
**Scale/Scope**: Multi-tenant SaaS with team-based access

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Security-First | ✅ PASS | Immutable reports, audit logging (FR-011, FR-028), secure token-based sharing with expiration (FR-010), watermarking (FR-025) |
| II. AI-Native Architecture | ✅ PASS | N/A for this feature - reports consume AI-generated findings but don't add new AI capabilities |
| III. Multi-Tenant Isolation | ✅ PASS | Team-based access inherits project permissions (FR-027), storage paths tenant-prefixed, dashboard scoped to organization |
| IV. Temporal-First Orchestration | ✅ PASS | Async report generation uses Temporal workflows for large scans (FR-003), scheduled reports via Temporal (FR-013-016) |
| V. Progressive Delivery | ✅ PASS | 6 prioritized user stories (P1-P6), each independently testable |
| VI. Observability-Driven | ✅ PASS | Access logging (FR-011), audit trails for deletions (FR-028), generation queue metrics (FR-029) |
| VII. Simplicity | ✅ PASS | Uses existing Prisma/Next.js patterns, builds on established ScanResult model |

**Security & Compliance Requirements:**
- Token-based sharing enables external auditor access without accounts ✅
- Report deletion requires admin + audit log (compliance-ready) ✅
- Watermarking tracks report recipients ✅

## Project Structure

### Documentation (this feature)

```text
specs/004-reporting-compliance/
├── plan.md              # This file
├── research.md          # Phase 0 output - PDF generation, compliance data
├── data-model.md        # Phase 1 output - Prisma schema additions
├── quickstart.md        # Phase 1 output - Development guide
├── contracts/           # Phase 1 output - API specifications
│   ├── reports-api.yaml
│   ├── compliance-api.yaml
│   └── schedules-api.yaml
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
web/
├── app/
│   ├── (dashboard)/
│   │   ├── reports/              # NEW: Report list and detail views
│   │   │   ├── page.tsx
│   │   │   ├── [reportId]/
│   │   │   │   └── page.tsx
│   │   │   └── generate/
│   │   │       └── page.tsx
│   │   ├── compliance/           # NEW: Compliance dashboard
│   │   │   └── page.tsx
│   │   ├── scans/
│   │   │   └── [scanId]/
│   │   │       └── reports/      # NEW: Scan-specific reports
│   │   │           └── page.tsx
│   │   └── settings/
│   │       └── templates/        # NEW: Report template settings
│   │           └── page.tsx
│   └── api/
│       ├── reports/              # NEW: Report CRUD endpoints
│       ├── compliance/           # NEW: Compliance mapping endpoints
│       └── schedules/            # NEW: Report schedule endpoints
├── lib/
│   ├── reports/                  # NEW: Report generation logic
│   │   ├── generator.ts
│   │   ├── templates/
│   │   │   ├── executive.ts
│   │   │   ├── technical.ts
│   │   │   └── compliance.ts
│   │   └── exporters/
│   │       ├── pdf.ts
│   │       ├── html.ts
│   │       ├── json.ts
│   │       └── csv.ts
│   ├── compliance/               # NEW: Compliance framework logic
│   │   ├── frameworks/
│   │   │   ├── owasp-top-10.ts
│   │   │   ├── pci-dss.ts
│   │   │   ├── soc2.ts
│   │   │   └── cis-controls.ts
│   │   └── mapper.ts
│   └── sharing/                  # NEW: Report sharing logic
│       ├── tokens.ts
│       └── access.ts
├── components/
│   ├── reports/                  # NEW: Report UI components
│   │   ├── ReportCard.tsx
│   │   ├── ReportViewer.tsx
│   │   ├── TemplateSelector.tsx
│   │   └── ShareDialog.tsx
│   └── compliance/               # NEW: Compliance UI components
│       ├── ComplianceScorecard.tsx
│       ├── ControlList.tsx
│       └── TrendChart.tsx
└── prisma/
    └── schema.prisma             # EXTEND: Add Report, Template, Share models

# Temporal workers (if async generation needed)
src/
└── temporal/
    └── workflows/
        └── report-generation.ts  # NEW: Async report generation workflow
```

**Structure Decision**: Extends existing Next.js web application structure. Report generation logic lives in `web/lib/reports/`, compliance mapping in `web/lib/compliance/`. Temporal workflow added only if sync generation proves insufficient for large scans.

## Complexity Tracking

> No constitution violations requiring justification.

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| PDF Generation | Library TBD (research.md) | Need to evaluate: react-pdf vs puppeteer vs reportlab |
| Compliance Data | Static JSON files initially | Framework definitions stable; database storage deferred until dynamic customization needed |
| Report Storage | S3-compatible blob storage | Already used for scan results (ScanResult.reportHtmlPath pattern) |
