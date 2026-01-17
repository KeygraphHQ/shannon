# Tasks: Running Security Scans (Phase 1 - Quick Scan MVP)

**Input**: Design documents from `/specs/002-security-scans/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/
**Scope**: User Story 1 (Quick Scan) only - MVP delivery

**Organization**: Tasks are grouped by phase to enable incremental delivery. This task list covers Phase 1 (Setup), Phase 2 (Foundational), and Phase 3 (User Story 1 - Quick Scan MVP).

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[US1]**: Task belongs to User Story 1 (Quick Scan)
- All paths relative to repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Environment configuration and project structure

- [ ] T001 Add ENCRYPTION_MASTER_KEY and TEMPORAL_ADDRESS to web/.env.example
- [ ] T002 [P] Create web/lib/temporal/ directory structure
- [ ] T003 [P] Create web/components/scans/ directory structure
- [ ] T004 [P] Create web/app/(dashboard)/scans/ directory structure
- [ ] T005 [P] Create web/app/api/scans/ directory structure

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema and core utilities that MUST be complete before User Story 1

**⚠️ CRITICAL**: No User Story 1 work can begin until this phase is complete

### Database Schema

- [ ] T006 Add Project model to web/prisma/schema.prisma with fields: id, organizationId, name, description, targetUrl, repositoryUrl, createdAt, updatedAt, and Organization relation
- [ ] T007 Add ScanStatus and ScanSource enums to web/prisma/schema.prisma (PENDING, RUNNING, COMPLETED, FAILED, CANCELLED, TIMEOUT) and (MANUAL, SCHEDULED, CICD, API)
- [ ] T008 Add Scan model to web/prisma/schema.prisma with fields: id, organizationId, projectId, status, source, temporalWorkflowId, startedAt, completedAt, durationMs, currentPhase, currentAgent, progressPercent, findings counts, errorMessage, errorCode, metadata, timestamps, and relations
- [ ] T009 Add ScanResult model to web/prisma/schema.prisma with fields: id, scanId, reportHtmlPath, reportPdfPath, reportMdPath, rawOutputPath, totalTokensUsed, totalCostUsd, agentMetrics, executiveSummary, riskScore, createdAt, and Scan relation
- [ ] T010 Add Project and Scan relations to existing Organization model in web/prisma/schema.prisma
- [ ] T011 Run prisma migrate dev --name add-scan-models to create database migration

### Temporal Client Integration

- [ ] T012 Create web/lib/temporal/client.ts with getTemporalClient() singleton function connecting to TEMPORAL_ADDRESS environment variable
- [ ] T013 Add getWorkflowProgress(workflowId) function to web/lib/temporal/client.ts that queries Temporal workflow via 'getProgress' query handler
- [ ] T014 Add startScanWorkflow(projectId, orgId, targetUrl) function to web/lib/temporal/client.ts that starts pentestPipelineWorkflow with scan parameters
- [ ] T015 Add cancelScanWorkflow(workflowId) function to web/lib/temporal/client.ts that cancels a running workflow

### Server Actions Foundation

- [ ] T016 Create web/lib/actions/projects.ts with getProjects(orgId), getProject(orgId, projectId), createProject(orgId, data), updateProject(orgId, projectId, data) server actions
- [ ] T017 Create web/lib/actions/scans.ts with placeholder functions: listScans, getScan, startScan, cancelScan (to be implemented in US1 phase)

**Checkpoint**: Foundation ready - User Story 1 implementation can now begin

---

## Phase 3: User Story 1 - Quick Scan (Priority: P1) 🎯 MVP

**Goal**: Users can start a security scan with just a target URL, see real-time progress, view results summary, and cancel running scans

**Independent Test**: Create a project, enter only a URL, click "Start Scan" - scan begins within 5 seconds, progress updates every 5 seconds, results show severity breakdown on completion

**Acceptance Criteria**:
1. Start scan with URL only (no additional config required)
2. Real-time progress: phase, percentage, estimated time
3. Results summary: findings by severity
4. Cancel running scan with partial results saved

### API Routes for User Story 1

- [ ] T018 [US1] Create web/app/api/projects/route.ts with GET (list projects) and POST (create project) handlers, scoped by organizationId from auth
- [ ] T019 [US1] Create web/app/api/projects/[projectId]/route.ts with GET handler for project details, including recentScans and hasAuthConfig
- [ ] T020 [US1] Create web/app/api/scans/route.ts with GET handler for listing scans with pagination (cursor-based) and filters (status, projectId, dateRange)
- [ ] T021 [US1] Create web/app/api/scans/route.ts POST handler to start scan: validate projectId, check concurrent limit (3 per org), create Scan record with PENDING status, call startScanWorkflow(), return scan object
- [ ] T022 [US1] Create web/app/api/scans/[scanId]/route.ts with GET handler for scan details including ScanResult if completed
- [ ] T023 [US1] Create web/app/api/scans/[scanId]/route.ts DELETE handler to cancel scan: validate scan is RUNNING or PENDING, call cancelScanWorkflow(), update status to CANCELLED, return updated scan
- [ ] T024 [US1] Create web/app/api/scans/[scanId]/progress/route.ts with SSE endpoint that polls Temporal every 2 seconds and streams ScanProgress events until scan completes

### Server Actions for User Story 1

- [ ] T025 [US1] Implement listScans(orgId, filters) in web/lib/actions/scans.ts with cursor pagination, status/date filtering, sorted by createdAt desc
- [ ] T026 [US1] Implement getScan(orgId, scanId) in web/lib/actions/scans.ts returning scan with project and result relations
- [ ] T027 [US1] Implement startScan(orgId, projectId, targetUrl?) in web/lib/actions/scans.ts: check concurrent limit, create Scan record, start Temporal workflow, return scan
- [ ] T028 [US1] Implement cancelScan(orgId, scanId) in web/lib/actions/scans.ts: validate ownership, cancel Temporal workflow, update status

### UI Components for User Story 1

- [ ] T029 [P] [US1] Create web/components/scans/start-scan-form.tsx with project selector dropdown, optional target URL override input, and "Start Scan" button with loading state
- [ ] T030 [P] [US1] Create web/components/scans/scan-progress.tsx that connects to SSE endpoint and displays: current phase badge, progress bar with percentage, elapsed/estimated time, list of completed agents
- [ ] T031 [P] [US1] Create web/components/scans/scan-detail-card.tsx showing: status badge, target URL, duration, findings summary (critical/high/medium/low counts with color coding), link to full results
- [ ] T032 [P] [US1] Create web/components/scans/scan-history-table.tsx with columns: project name, status, started at, duration, findings count; include status filter dropdown and date range picker
- [ ] T033 [P] [US1] Create web/components/scans/cancel-scan-button.tsx with confirmation dialog: "Cancel this scan? Partial results will be saved."

### Pages for User Story 1

- [ ] T034 [US1] Create web/app/(dashboard)/scans/page.tsx listing all scans with scan-history-table component, "New Scan" button linking to /scans/new
- [ ] T035 [US1] Create web/app/(dashboard)/scans/new/page.tsx with start-scan-form component, redirects to scan detail page on submit
- [ ] T036 [US1] Create web/app/(dashboard)/scans/[scanId]/page.tsx showing scan-detail-card, scan-progress (if running), cancel-scan-button (if running), and link to findings when completed
- [ ] T037 [US1] Add "Scans" link to web/components/dashboard-nav.tsx navigation menu with scan icon

### Temporal Workflow Integration

- [ ] T038 [US1] Extend src/temporal/shared.ts PipelineProgress interface to include scanId field for web app correlation
- [ ] T039 [US1] Extend src/temporal/workflows.ts pentestPipelineWorkflow to accept optional scanId parameter and include it in progress state
- [ ] T040 [US1] Create web/app/api/webhooks/temporal/route.ts webhook handler to receive scan completion events and update Scan record with final status, duration, findings counts

### Concurrent Scan Limit

- [ ] T041 [US1] Create web/lib/scan-queue.ts with checkConcurrentLimit(orgId) function that counts RUNNING/PENDING scans for org (limit: 3 default)
- [ ] T042 [US1] Create web/lib/scan-queue.ts getQueuePosition(orgId, scanId) function returning position in org's scan queue

**Checkpoint**: User Story 1 (Quick Scan) is fully functional and independently testable

---

## Phase 4: Polish & Cross-Cutting Concerns (US1 Scope)

**Purpose**: Improvements for User Story 1 delivery

- [ ] T043 [P] Add error boundary to web/app/(dashboard)/scans/[scanId]/page.tsx for graceful error handling
- [ ] T044 [P] Add loading skeletons to scan-history-table.tsx and scan-detail-card.tsx components
- [ ] T045 Add audit logging for scan.started, scan.cancelled, scan.completed events in scan server actions
- [ ] T046 Validate scan API routes return proper error codes: 400 (bad request), 403 (concurrent limit), 404 (not found)
- [ ] T047 Add optimistic updates to start-scan-form.tsx for immediate UI feedback on scan start

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup
    ↓
Phase 2: Foundational (BLOCKS all user stories)
    ↓
Phase 3: User Story 1 - Quick Scan MVP
    ↓
Phase 4: Polish
```

### Task Dependencies Within User Story 1

```
T006-T011 (Schema) → T012-T015 (Temporal Client) → T016-T017 (Actions Foundation)
    ↓
T018-T024 (API Routes) + T025-T028 (Server Actions) [can run in parallel]
    ↓
T029-T033 (UI Components) [all parallel - different files]
    ↓
T034-T037 (Pages) [depend on components]
    ↓
T038-T042 (Temporal Integration + Queue)
    ↓
T043-T047 (Polish)
```

### Parallel Opportunities

**Phase 1** (all parallel):
- T002, T003, T004, T005 - directory creation

**Phase 2** (sequential for schema, then parallel for utilities):
- T006-T011 must be sequential (schema dependencies)
- T012-T015 parallel with T016-T017 after schema complete

**Phase 3 - User Story 1**:
- T018-T024 (API Routes) parallel with T025-T028 (Server Actions)
- T029-T033 (UI Components) all parallel - different files
- T038-T042 can partially parallel after API routes complete

---

## Parallel Example: User Story 1 Components

```bash
# Launch all UI components together (no dependencies between them):
Task: "Create start-scan-form.tsx"
Task: "Create scan-progress.tsx"
Task: "Create scan-detail-card.tsx"
Task: "Create scan-history-table.tsx"
Task: "Create cancel-scan-button.tsx"
```

---

## Implementation Strategy

### MVP Delivery (This Task List)

1. Complete Phase 1: Setup (T001-T005)
2. Complete Phase 2: Foundational (T006-T017)
3. Complete Phase 3: User Story 1 (T018-T042)
4. Complete Phase 4: Polish (T043-T047)
5. **VALIDATE**: Test Quick Scan flow end-to-end
6. **DEPLOY**: MVP ready for user feedback

### Verification Checklist

After completing all tasks, verify:
- [ ] Can create a project with name and target URL
- [ ] Can start scan with just project selection (URL inherited)
- [ ] Scan begins within 5 seconds of clicking "Start"
- [ ] Progress updates appear every 5 seconds during scan
- [ ] Can cancel running scan and see partial results
- [ ] Completed scan shows severity breakdown
- [ ] Scan history page shows all scans with filters working
- [ ] Concurrent limit (3 scans) is enforced

---

## Notes

- [P] tasks = different files, no dependencies on each other
- [US1] label = task belongs to User Story 1 (Quick Scan)
- All API routes must scope queries by organizationId from Clerk auth
- Temporal client connects to existing Shannon scan engine
- SSE endpoint uses 2-second polling interval for progress
- No tests included (not requested in spec) - add if TDD desired

---

## Future User Stories (Not in This Task List)

When ready to expand beyond MVP:
- **User Story 2 (P2)**: Authenticated Testing - Run `/speckit.tasks 002-security-scans phase 2`
- **User Story 3 (P3)**: Scan History - Already partially covered by US1
- **User Story 4 (P4)**: Scheduled Scans - Run `/speckit.tasks 002-security-scans phase 4`
- **User Story 5 (P5)**: CI/CD Integration - Run `/speckit.tasks 002-security-scans phase 5`
