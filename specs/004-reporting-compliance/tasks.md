# Tasks: Reporting & Compliance

**Input**: Design documents from `/specs/004-reporting-compliance/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests are NOT requested in this specification. Implementation tasks only.

**Organization**: Tasks are grouped by user story (P1-P6) to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US6)
- All paths relative to repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and dependency installation

- [x] T001 Install @react-pdf/renderer dependency in web/package.json
- [x] T002 [P] Create web/lib/reports/ directory structure per plan.md
- [x] T003 [P] Create web/lib/compliance/ directory structure per plan.md
- [x] T004 [P] Create web/lib/sharing/ directory structure per plan.md
- [x] T005 [P] Create web/components/reports/ directory structure per plan.md
- [x] T006 [P] Create web/components/compliance/ directory structure per plan.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema and core infrastructure that MUST be complete before ANY user story

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T007 Add Report, ReportTemplate, ReportShare, ReportAccessLog, ReportSchedule, ScheduleRun, ComplianceMapping models to web/prisma/schema.prisma per data-model.md
- [x] T008 Add ReportStatus, ReportType, ScheduleFrequency, ScheduleStatus enums to web/prisma/schema.prisma
- [x] T009 Add relations to existing Organization, Scan, Finding, Project models in web/prisma/schema.prisma
- [x] T010 Run prisma migrate dev to create database migration
- [x] T011 Run prisma generate to update Prisma client
- [x] T012 [P] Create report access control utilities in web/lib/reports/access-control.ts (team-based permissions per FR-027)
- [x] T013 [P] Create report storage path utilities in web/lib/reports/storage.ts (tenant-prefixed paths)

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Generate Security Report (Priority: P1) 🎯 MVP

**Goal**: Generate professional security reports from scan results with multiple templates (Executive, Technical, Compliance-Focused)

**Independent Test**: Complete a scan, click Generate Report, select template, download PDF - delivers immediate documentation value

### Implementation for User Story 1

- [ ] T014 [P] [US1] Create ExecutiveReport PDF template component in web/lib/reports/templates/executive.tsx using @react-pdf/renderer
- [ ] T015 [P] [US1] Create TechnicalReport PDF template component in web/lib/reports/templates/technical.tsx
- [ ] T016 [P] [US1] Create ComplianceReport PDF template component in web/lib/reports/templates/compliance.tsx
- [ ] T017 [US1] Create report generator service in web/lib/reports/generator.ts with template selection logic
- [ ] T018 [US1] Implement risk score calculation in web/lib/reports/risk-score.ts
- [ ] T019 [P] [US1] Create PDF exporter in web/lib/reports/exporters/pdf.ts using renderToBuffer
- [ ] T020 [P] [US1] Create HTML exporter in web/lib/reports/exporters/html.ts
- [ ] T021 [P] [US1] Create JSON exporter in web/lib/reports/exporters/json.ts
- [ ] T022 [US1] Implement POST /api/reports endpoint in web/app/api/reports/route.ts (generate report)
- [ ] T023 [US1] Implement GET /api/reports endpoint in web/app/api/reports/route.ts (list reports)
- [ ] T024 [US1] Implement GET /api/reports/[reportId] endpoint in web/app/api/reports/[reportId]/route.ts
- [ ] T025 [US1] Implement DELETE /api/reports/[reportId] endpoint with admin check and audit log
- [ ] T026 [US1] Implement GET /api/reports/[reportId]/export/[format] endpoint in web/app/api/reports/[reportId]/export/[format]/route.ts
- [ ] T027 [P] [US1] Create ReportCard component in web/components/reports/ReportCard.tsx
- [ ] T028 [P] [US1] Create TemplateSelector component in web/components/reports/TemplateSelector.tsx
- [ ] T029 [P] [US1] Create ReportViewer component in web/components/reports/ReportViewer.tsx
- [ ] T030 [US1] Create reports list page in web/app/(dashboard)/reports/page.tsx
- [ ] T031 [US1] Create report detail page in web/app/(dashboard)/reports/[reportId]/page.tsx
- [ ] T032 [US1] Create report generation page in web/app/(dashboard)/reports/generate/page.tsx
- [ ] T033 [US1] Add scan-specific reports view in web/app/(dashboard)/scans/[scanId]/reports/page.tsx
- [ ] T034 [US1] Implement concurrent generation limit (5 per org) in report generator service

**Checkpoint**: User Story 1 complete - can generate reports from scans, view report list, download PDF/HTML/JSON

---

## Phase 4: User Story 2 - Compliance Framework Mapping (Priority: P2)

**Goal**: Map scan findings to compliance frameworks (OWASP Top 10, PCI-DSS, SOC 2, CIS Controls) with coverage metrics

**Independent Test**: Select a compliance framework, verify findings categorized against controls with coverage percentage

### Implementation for User Story 2

- [ ] T035 [P] [US2] Create OWASP Top 10 (2021) framework data in web/lib/compliance/frameworks/owasp-top-10-2021.ts
- [ ] T036 [P] [US2] Create PCI-DSS v4.0 framework data in web/lib/compliance/frameworks/pci-dss-4.0.ts
- [ ] T037 [P] [US2] Create SOC 2 Trust Services framework data in web/lib/compliance/frameworks/soc2-trust-principles.ts
- [ ] T038 [P] [US2] Create CIS Controls v8 framework data in web/lib/compliance/frameworks/cis-controls-v8.ts
- [ ] T039 [US2] Create framework registry/index in web/lib/compliance/frameworks/index.ts
- [ ] T040 [US2] Implement compliance mapper (CWE to control mapping) in web/lib/compliance/mapper.ts
- [ ] T041 [US2] Implement auto-mapping when findings are created (hook into scan completion)
- [ ] T042 [US2] Implement GET /api/compliance/frameworks endpoint in web/app/api/compliance/frameworks/route.ts
- [ ] T043 [US2] Implement GET /api/compliance/frameworks/[frameworkId] endpoint in web/app/api/compliance/frameworks/[frameworkId]/route.ts
- [ ] T044 [US2] Implement GET /api/compliance/scans/[scanId]/mappings endpoint in web/app/api/compliance/scans/[scanId]/mappings/route.ts
- [ ] T045 [US2] Implement GET /api/compliance/scans/[scanId]/scorecard endpoint in web/app/api/compliance/scans/[scanId]/scorecard/route.ts
- [ ] T046 [P] [US2] Create ComplianceScorecard component in web/components/compliance/ComplianceScorecard.tsx
- [ ] T047 [P] [US2] Create ControlList component in web/components/compliance/ControlList.tsx
- [ ] T048 [US2] Add compliance view tab to scan detail page with framework selector
- [ ] T049 [US2] Update ComplianceReport template (T016) to use real mapping data

**Checkpoint**: User Story 2 complete - can view findings mapped to compliance frameworks with scorecard

---

## Phase 5: User Story 3 - Export and Share Reports (Priority: P3)

**Goal**: Export reports in multiple formats (PDF, HTML, JSON, CSV) and share via secure time-limited links

**Independent Test**: Generate report, export in each format, share via email link, verify recipient access

### Implementation for User Story 3

- [ ] T050 [P] [US3] Create CSV exporter in web/lib/reports/exporters/csv.ts
- [ ] T051 [US3] Create share token generator in web/lib/sharing/tokens.ts (SHA-256 hashed)
- [ ] T052 [US3] Create share access validator in web/lib/sharing/access.ts (expiration, revocation, access count)
- [ ] T053 [US3] Implement POST /api/reports/[reportId]/shares endpoint in web/app/api/reports/[reportId]/shares/route.ts
- [ ] T054 [US3] Implement GET /api/reports/[reportId]/shares endpoint (list shares)
- [ ] T055 [US3] Implement DELETE /api/reports/[reportId]/shares/[shareId] endpoint (revoke share)
- [ ] T056 [US3] Implement GET /api/reports/share/[token] public endpoint in web/app/api/reports/share/[token]/route.ts (no auth required)
- [ ] T057 [US3] Implement GET /api/reports/[reportId]/access-logs endpoint for audit trail
- [ ] T058 [US3] Create access logging middleware for all report views
- [ ] T059 [P] [US3] Create ShareDialog component in web/components/reports/ShareDialog.tsx
- [ ] T060 [P] [US3] Create ShareHistory component in web/components/reports/ShareHistory.tsx
- [ ] T061 [US3] Create public shared report view page in web/app/reports/share/[token]/page.tsx
- [ ] T062 [US3] Add share button and history to report detail page
- [ ] T063 [US3] Implement watermark injection for shared reports (FR-025)
- [ ] T064 [US3] Send share notification email with secure link

**Checkpoint**: User Story 3 complete - can export in all formats, share via link, view access history

---

## Phase 6: User Story 4 - Scheduled Reports (Priority: P4)

**Goal**: Schedule automated report generation and distribution (weekly, monthly)

**Independent Test**: Create weekly schedule, verify report auto-generates and emails to recipients

### Implementation for User Story 4

- [ ] T065 [US4] Create scheduled report Temporal workflow in src/temporal/workflows/scheduled-report.ts
- [ ] T066 [US4] Create report generation activity in src/temporal/activities/report-activities.ts
- [ ] T067 [US4] Create email sending activity for scheduled reports
- [ ] T068 [US4] Register scheduled report workflow in Temporal worker
- [ ] T069 [US4] Implement POST /api/schedules endpoint in web/app/api/schedules/route.ts
- [ ] T070 [US4] Implement GET /api/schedules endpoint (list schedules)
- [ ] T071 [US4] Implement GET /api/schedules/[scheduleId] endpoint in web/app/api/schedules/[scheduleId]/route.ts
- [ ] T072 [US4] Implement PATCH /api/schedules/[scheduleId] endpoint (update schedule)
- [ ] T073 [US4] Implement DELETE /api/schedules/[scheduleId] endpoint
- [ ] T074 [US4] Implement POST /api/schedules/[scheduleId]/pause endpoint
- [ ] T075 [US4] Implement POST /api/schedules/[scheduleId]/resume endpoint
- [ ] T076 [US4] Implement POST /api/schedules/[scheduleId]/trigger endpoint (manual trigger)
- [ ] T077 [US4] Implement GET /api/schedules/[scheduleId]/runs endpoint (run history)
- [ ] T078 [P] [US4] Create ScheduleCard component in web/components/reports/ScheduleCard.tsx
- [ ] T079 [P] [US4] Create ScheduleForm component in web/components/reports/ScheduleForm.tsx
- [ ] T080 [US4] Create schedules management page in web/app/(dashboard)/settings/schedules/page.tsx
- [ ] T081 [US4] Implement skip-if-no-new-scans logic in scheduled workflow
- [ ] T082 [US4] Implement retry logic for failed scheduled reports (FR-016)

**Checkpoint**: User Story 4 complete - can create/manage schedules, reports auto-generate and email

---

## Phase 7: User Story 5 - Compliance Dashboard (Priority: P5)

**Goal**: Organization-wide compliance dashboard with aggregate metrics, trends, and drill-down

**Independent Test**: Run scans across multiple projects, verify dashboard shows aggregate compliance score with drill-down

### Implementation for User Story 5

- [ ] T083 [US5] Implement GET /api/compliance/dashboard endpoint in web/app/api/compliance/dashboard/route.ts
- [ ] T084 [US5] Implement GET /api/compliance/dashboard/trends endpoint (30/60/90 day trends)
- [ ] T085 [US5] Implement GET /api/compliance/dashboard/export endpoint (PDF export)
- [ ] T086 [US5] Implement GET /api/compliance/dashboard/controls/[controlId] endpoint (drill-down)
- [ ] T087 [US5] Create compliance aggregation service in web/lib/compliance/aggregator.ts
- [ ] T088 [P] [US5] Create TrendChart component in web/components/compliance/TrendChart.tsx
- [ ] T089 [P] [US5] Create CategoryBreakdown component in web/components/compliance/CategoryBreakdown.tsx
- [ ] T090 [P] [US5] Create TopGaps component in web/components/compliance/TopGaps.tsx
- [ ] T091 [P] [US5] Create ControlDrilldown component in web/components/compliance/ControlDrilldown.tsx
- [ ] T092 [US5] Create compliance dashboard page in web/app/(dashboard)/compliance/page.tsx
- [ ] T093 [US5] Add framework switcher to dashboard
- [ ] T094 [US5] Add time period selector (30/60/90 days) to dashboard
- [ ] T095 [US5] Implement dashboard PDF export

**Checkpoint**: User Story 5 complete - can view org-wide compliance posture with trends and drill-down

---

## Phase 8: User Story 6 - Custom Report Templates (Priority: P6)

**Goal**: Create custom report templates with organization branding and section selection

**Independent Test**: Create template with logo and colors, generate report using custom template, verify branding applied

### Implementation for User Story 6

- [ ] T096 [US6] Implement POST /api/templates endpoint in web/app/api/templates/route.ts
- [ ] T097 [US6] Implement GET /api/templates endpoint (list templates)
- [ ] T098 [US6] Implement GET /api/templates/[templateId] endpoint in web/app/api/templates/[templateId]/route.ts
- [ ] T099 [US6] Implement PATCH /api/templates/[templateId] endpoint
- [ ] T100 [US6] Implement DELETE /api/templates/[templateId] endpoint
- [ ] T101 [US6] Implement POST /api/templates/[templateId]/default endpoint (set as org default)
- [ ] T102 [US6] Create template snapshot logic when generating reports (FR-021)
- [ ] T103 [P] [US6] Create TemplateEditor component in web/components/reports/TemplateEditor.tsx
- [ ] T104 [P] [US6] Create SectionPicker component in web/components/reports/SectionPicker.tsx
- [ ] T105 [P] [US6] Create BrandingEditor component in web/components/reports/BrandingEditor.tsx
- [ ] T106 [US6] Create template settings page in web/app/(dashboard)/settings/templates/page.tsx
- [ ] T107 [US6] Create template detail/edit page in web/app/(dashboard)/settings/templates/[templateId]/page.tsx
- [ ] T108 [US6] Update report generator to apply custom template branding
- [ ] T109 [US6] Add custom template option to TemplateSelector component

**Checkpoint**: User Story 6 complete - can create/edit custom templates with branding, use in report generation

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T110 [P] Add loading states to all report-related pages
- [ ] T111 [P] Add error handling with user-friendly messages across all endpoints
- [ ] T112 [P] Add success toast notifications for report generation, sharing, scheduling
- [ ] T113 Add navigation links to reports section in dashboard sidebar
- [ ] T114 Add empty states for reports list, schedules list, templates list
- [ ] T115 [P] Add pagination to reports list, schedules list, access logs
- [ ] T116 Implement bulk report export (FR-012) - combine multiple reports into one PDF
- [ ] T117 Add finding notes/annotations before report generation (FR-024)
- [ ] T118 Performance optimization: add database indexes per data-model.md
- [ ] T119 Run quickstart.md validation to ensure development workflow works

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Stories (Phases 3-8)**: All depend on Foundational phase completion
  - Can proceed in priority order (P1 → P2 → P3 → P4 → P5 → P6)
  - Or in parallel if staffed
- **Polish (Phase 9)**: Depends on all user stories being complete

### User Story Dependencies

| Story | Depends On | Notes |
|-------|------------|-------|
| US1 (P1) | Foundational only | Core MVP - can ship after this |
| US2 (P2) | Foundational only | Independent of US1, but integrates with report templates |
| US3 (P3) | US1 | Needs reports to exist before sharing |
| US4 (P4) | US1, US2 | Needs report generation working, optionally includes compliance |
| US5 (P5) | US2 | Needs compliance mapping data for dashboard |
| US6 (P6) | US1 | Needs report generation working to apply templates |

### Within Each User Story

- Models/framework data before services
- Services before API endpoints
- API endpoints before UI components
- UI components before pages

### Parallel Opportunities

**Phase 1 (all parallel):**
```
T002, T003, T004, T005, T006
```

**Phase 2 (after T007-T011):**
```
T012, T013
```

**US1 Templates (parallel):**
```
T014, T015, T016
```

**US1 Exporters (parallel):**
```
T019, T020, T021
```

**US1 Components (parallel):**
```
T027, T028, T029
```

**US2 Frameworks (parallel):**
```
T035, T036, T037, T038
```

**US3 Components (parallel):**
```
T059, T060
```

**US5 Components (parallel):**
```
T088, T089, T090, T091
```

**US6 Components (parallel):**
```
T103, T104, T105
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Generate a report from a scan, download PDF
5. Deploy/demo if ready - this delivers core value

### Recommended Delivery Order

1. **MVP**: US1 (Generate Security Report) - immediate value
2. **Compliance**: US2 (Compliance Framework Mapping) - audit-ready reports
3. **Distribution**: US3 (Export and Share Reports) - stakeholder collaboration
4. **Automation**: US4 (Scheduled Reports) - recurring delivery
5. **Visibility**: US5 (Compliance Dashboard) - org-wide posture
6. **Customization**: US6 (Custom Report Templates) - enterprise feature

### Parallel Team Strategy

With 2+ developers after Foundational:
- Developer A: US1 → US3 → US4
- Developer B: US2 → US5 → US6

---

## Summary

| Metric | Value |
|--------|-------|
| **Total Tasks** | 119 |
| **Setup Tasks** | 6 |
| **Foundational Tasks** | 7 |
| **US1 Tasks** | 21 |
| **US2 Tasks** | 15 |
| **US3 Tasks** | 15 |
| **US4 Tasks** | 18 |
| **US5 Tasks** | 13 |
| **US6 Tasks** | 14 |
| **Polish Tasks** | 10 |
| **Parallelizable Tasks** | 42 (35%) |

---

## Notes

- [P] tasks = different files, no blocking dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- MVP = Phase 1 + Phase 2 + Phase 3 (User Story 1)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
