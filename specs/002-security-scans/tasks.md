# Tasks: Running Security Scans (Complete)

**Input**: Design documents from `/specs/002-security-scans/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml, quickstart.md
**Scope**: All 5 User Stories (Quick Scan, Auth Testing, History, Schedules, CI/CD)

**Organization**: Tasks are grouped by phase to enable incremental delivery:
- Phase 1: Setup (Shared Infrastructure) - COMPLETE
- Phase 2: Foundational (Blocking Prerequisites) - COMPLETE
- Phase 3: User Story 1 - Quick Scan MVP - COMPLETE
- Phase 4: Polish (US1) - COMPLETE
- Phase 5: User Story 2 - Authenticated Testing - COMPLETE
- Phase 6: Polish (US2) - COMPLETE
- Phase 7: User Story 3 - Scan History and Details - COMPLETE
- Phase 8: User Story 4 - Scheduled Scans
- Phase 9: User Story 5 - CI/CD Integration
- Phase 10: Final Polish & Cross-Cutting Concerns

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[US1]**: Task belongs to User Story 1 (Quick Scan)
- All paths relative to repository root

---

## Phase 1: Setup (Shared Infrastructure) ✅ COMPLETE

**Purpose**: Environment configuration and project structure

- [x] T001 Add ENCRYPTION_MASTER_KEY and TEMPORAL_ADDRESS to web/.env.example
- [x] T002 [P] Create web/lib/temporal/ directory structure
- [x] T003 [P] Create web/components/scans/ directory structure
- [x] T004 [P] Create web/app/(dashboard)/scans/ directory structure
- [x] T005 [P] Create web/app/api/scans/ directory structure

---

## Phase 2: Foundational (Blocking Prerequisites) ✅ COMPLETE

**Purpose**: Database schema and core utilities that MUST be complete before User Story 1

### Database Schema

- [x] T006 Add Project model to web/prisma/schema.prisma with fields: id, organizationId, name, description, targetUrl, repositoryUrl, createdAt, updatedAt, and Organization relation
- [x] T007 Add ScanStatus and ScanSource enums to web/prisma/schema.prisma (PENDING, RUNNING, COMPLETED, FAILED, CANCELLED, TIMEOUT) and (MANUAL, SCHEDULED, CICD, API)
- [x] T008 Add Scan model to web/prisma/schema.prisma with fields: id, organizationId, projectId, status, source, temporalWorkflowId, startedAt, completedAt, durationMs, currentPhase, currentAgent, progressPercent, findings counts, errorMessage, errorCode, metadata, timestamps, and relations
- [x] T009 Add ScanResult model to web/prisma/schema.prisma with fields: id, scanId, reportHtmlPath, reportPdfPath, reportMdPath, rawOutputPath, totalTokensUsed, totalCostUsd, agentMetrics, executiveSummary, riskScore, createdAt, and Scan relation
- [x] T010 Add Project and Scan relations to existing Organization model in web/prisma/schema.prisma
- [x] T011 Run prisma migrate dev --name add-scan-models to create database migration (schema validated, run when DB available)

### Temporal Client Integration

- [x] T012 Create web/lib/temporal/client.ts with getTemporalClient() singleton function connecting to TEMPORAL_ADDRESS environment variable
- [x] T013 Add getWorkflowProgress(workflowId) function to web/lib/temporal/client.ts that queries Temporal workflow via 'getProgress' query handler
- [x] T014 Add startScanWorkflow(projectId, orgId, targetUrl) function to web/lib/temporal/client.ts that starts pentestPipelineWorkflow with scan parameters
- [x] T015 Add cancelScanWorkflow(workflowId) function to web/lib/temporal/client.ts that cancels a running workflow

### Server Actions Foundation

- [x] T016 Create web/lib/actions/projects.ts with getProjects(orgId), getProject(orgId, projectId), createProject(orgId, data), updateProject(orgId, projectId, data) server actions
- [x] T017 Create web/lib/actions/scans.ts with placeholder functions: listScans, getScan, startScan, cancelScan (to be implemented in US1 phase)

**Checkpoint**: Foundation ready - User Story 1 implementation can now begin

---

## Phase 3: User Story 1 - Quick Scan (Priority: P1) 🎯 MVP ✅ COMPLETE

**Goal**: Users can start a security scan with just a target URL, see real-time progress, view results summary, and cancel running scans

**Independent Test**: Create a project, enter only a URL, click "Start Scan" - scan begins within 5 seconds, progress updates every 5 seconds, results show severity breakdown on completion

**Acceptance Criteria**:
1. Start scan with URL only (no additional config required)
2. Real-time progress: phase, percentage, estimated time
3. Results summary: findings by severity
4. Cancel running scan with partial results saved

### API Routes for User Story 1

- [x] T018 [US1] Create web/app/api/projects/route.ts with GET (list projects) and POST (create project) handlers, scoped by organizationId from auth
- [x] T019 [US1] Create web/app/api/projects/[projectId]/route.ts with GET handler for project details, including recentScans and hasAuthConfig
- [x] T020 [US1] Create web/app/api/scans/route.ts with GET handler for listing scans with pagination (cursor-based) and filters (status, projectId, dateRange)
- [x] T021 [US1] Create web/app/api/scans/route.ts POST handler to start scan: validate projectId, check concurrent limit (3 per org), create Scan record with PENDING status, call startScanWorkflow(), return scan object
- [x] T022 [US1] Create web/app/api/scans/[scanId]/route.ts with GET handler for scan details including ScanResult if completed
- [x] T023 [US1] Create web/app/api/scans/[scanId]/route.ts DELETE handler to cancel scan: validate scan is RUNNING or PENDING, call cancelScanWorkflow(), update status to CANCELLED, return updated scan
- [x] T024 [US1] Create web/app/api/scans/[scanId]/progress/route.ts with SSE endpoint that polls Temporal every 2 seconds and streams ScanProgress events until scan completes

### Server Actions for User Story 1

- [x] T025 [US1] Implement listScans(orgId, filters) in web/lib/actions/scans.ts with cursor pagination, status/date filtering, sorted by createdAt desc
- [x] T026 [US1] Implement getScan(orgId, scanId) in web/lib/actions/scans.ts returning scan with project and result relations
- [x] T027 [US1] Implement startScan(orgId, projectId, targetUrl?) in web/lib/actions/scans.ts: check concurrent limit, create Scan record, start Temporal workflow, return scan
- [x] T028 [US1] Implement cancelScan(orgId, scanId) in web/lib/actions/scans.ts: validate ownership, cancel Temporal workflow, update status

### UI Components for User Story 1

- [x] T029 [P] [US1] Create web/components/scans/start-scan-form.tsx with project selector dropdown, optional target URL override input, and "Start Scan" button with loading state
- [x] T030 [P] [US1] Create web/components/scans/scan-progress.tsx that connects to SSE endpoint and displays: current phase badge, progress bar with percentage, elapsed/estimated time, list of completed agents
- [x] T031 [P] [US1] Create web/components/scans/scan-detail-card.tsx showing: status badge, target URL, duration, findings summary (critical/high/medium/low counts with color coding), link to full results
- [x] T032 [P] [US1] Create web/components/scans/scan-history-table.tsx with columns: project name, status, started at, duration, findings count; include status filter dropdown and date range picker
- [x] T033 [P] [US1] Create web/components/scans/cancel-scan-button.tsx with confirmation dialog: "Cancel this scan? Partial results will be saved."

### Pages for User Story 1

- [x] T034 [US1] Create web/app/(dashboard)/scans/page.tsx listing all scans with scan-history-table component, "New Scan" button linking to /scans/new
- [x] T035 [US1] Create web/app/(dashboard)/scans/new/page.tsx with start-scan-form component, redirects to scan detail page on submit
- [x] T036 [US1] Create web/app/(dashboard)/scans/[scanId]/page.tsx showing scan-detail-card, scan-progress (if running), cancel-scan-button (if running), and link to findings when completed
- [x] T037 [US1] Add "Scans" link to web/components/dashboard-nav.tsx navigation menu with scan icon

### Temporal Workflow Integration

- [x] T038 [US1] Extend src/temporal/shared.ts PipelineProgress interface to include scanId field for web app correlation
- [x] T039 [US1] Extend src/temporal/workflows.ts pentestPipelineWorkflow to accept optional scanId parameter and include it in progress state
- [x] T040 [US1] Create web/app/api/webhooks/temporal/route.ts webhook handler to receive scan completion events and update Scan record with final status, duration, findings counts

### Concurrent Scan Limit

- [x] T041 [US1] Create web/lib/scan-queue.ts with checkConcurrentLimit(orgId) function that counts RUNNING/PENDING scans for org (limit: 3 default)
- [x] T042 [US1] Create web/lib/scan-queue.ts getQueuePosition(orgId, scanId) function returning position in org's scan queue

**Checkpoint**: User Story 1 (Quick Scan) is fully functional and independently testable

---

## Phase 4: Polish & Cross-Cutting Concerns (US1 Scope) ✅ COMPLETE

**Purpose**: Improvements for User Story 1 delivery

- [x] T043 [P] Add error boundary to web/app/(dashboard)/scans/[scanId]/page.tsx for graceful error handling
- [x] T044 [P] Add loading skeletons to scan-history-table.tsx and scan-detail-card.tsx components
- [x] T045 Add audit logging for scan.started, scan.cancelled, scan.completed events in scan server actions
- [x] T046 Validate scan API routes return proper error codes: 400 (bad request), 403 (concurrent limit), 404 (not found)
- [x] T047 Add optimistic updates to start-scan-form.tsx for immediate UI feedback on scan start

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

## Phase 5: User Story 2 - Authenticated Testing (Priority: P2) ✅ COMPLETE

**Goal**: Users can configure authentication (form login, API token, Basic Auth, SSO, TOTP) so Shannon can test protected areas of applications

**Independent Test**: Configure form-based login with credentials, click "Test Authentication" - system validates credentials work before scan, saved config auto-applies to subsequent scans

**Acceptance Criteria**:
1. Select auth method: form-based, API token, Basic Auth, SSO
2. Test credentials before scan with clear pass/fail feedback
3. TOTP support for 2FA applications
4. Specific auth failure error messages (not generic)
5. Saved auth config persists at project level

### Database Schema for User Story 2

- [x] T048 [US2] Add AuthMethod enum to web/prisma/schema.prisma (NONE, FORM, API_TOKEN, BASIC, SSO)
- [x] T049 [US2] Add AuthenticationConfig model to web/prisma/schema.prisma with fields: id, projectId, method, encryptedCredentials, loginUrl, usernameSelector, passwordSelector, submitSelector, successIndicator, totpEnabled, totpSelector, lastValidatedAt, validationStatus, timestamps, and Project relation
- [x] T050 [US2] Run prisma migrate dev --name add-auth-config to create database migration (schema validated, run when DB available)

### Encryption Utility

- [x] T051 [US2] Create web/lib/encryption.ts with deriveOrgKey(orgId) function using HMAC-SHA256 to derive org-specific key from ENCRYPTION_MASTER_KEY
- [x] T052 [US2] Add encryptCredential(plaintext, orgId) function to web/lib/encryption.ts using AES-256-GCM with 12-byte IV, returning iv:authTag:ciphertext format
- [x] T053 [US2] Add decryptCredential(encrypted, orgId) function to web/lib/encryption.ts parsing iv:authTag:ciphertext and decrypting with org-derived key

### API Routes for User Story 2

- [x] T054 [US2] Create web/app/api/projects/[projectId]/auth/route.ts GET handler returning auth config with credentials masked (hasCredentials: true/false)
- [x] T055 [US2] Add PUT handler to web/app/api/projects/[projectId]/auth/route.ts to save auth config, encrypting credentials with org key
- [x] T056 [US2] Add DELETE handler to web/app/api/projects/[projectId]/auth/route.ts to remove auth config
- [x] T057 [US2] Create web/app/api/projects/[projectId]/auth/validate/route.ts POST handler that tests credentials and returns {valid, error, validatedAt}

### Server Actions for User Story 2

- [x] T058 [US2] Create web/lib/actions/auth-config.ts with getAuthConfig(orgId, projectId) returning config with masked credentials
- [x] T059 [US2] Add saveAuthConfig(orgId, projectId, config) to web/lib/actions/auth-config.ts encrypting credentials before storage
- [x] T060 [US2] Add deleteAuthConfig(orgId, projectId) to web/lib/actions/auth-config.ts
- [x] T061 [US2] Add validateAuthConfig(orgId, projectId) to web/lib/actions/auth-config.ts that triggers validation workflow

### Auth Validation Temporal Activity

- [x] T062 [US2] Create src/temporal/activities/validate-auth.ts with validateAuthentication(config) activity that uses Playwright to test login flow
- [x] T063 [US2] Add form-based validation logic: navigate to loginUrl, fill selectors, submit, check successIndicator
- [x] T064 [US2] Add API token validation logic: make authenticated request to target, verify non-401 response
- [x] T065 [US2] Add Basic Auth validation logic: make request with Authorization header, verify non-401 response
- [x] T066 [US2] Add TOTP generation using otpauth library if totpEnabled is true
- [x] T067 [US2] Register validateAuthentication activity in src/temporal/worker.ts

### UI Components for User Story 2

- [x] T068 [P] [US2] Create web/components/auth-config/auth-method-selector.tsx with dropdown: None, Form Login, API Token, Basic Auth, SSO (disabled)
- [x] T069 [P] [US2] Create web/components/auth-config/form-auth-config.tsx with fields: loginUrl, username, password, CSS selectors (username, password, submit, success)
- [x] T070 [P] [US2] Create web/components/auth-config/api-token-config.tsx with apiToken input field and validation endpoint input
- [x] T071 [P] [US2] Create web/components/auth-config/basic-auth-config.tsx with username and password fields
- [x] T072 [P] [US2] Create web/components/auth-config/totp-config.tsx with totpSecret input and checkbox to enable TOTP, totpSelector field
- [x] T073 [P] [US2] Create web/components/auth-config/test-auth-button.tsx with "Test Authentication" button, loading state, and pass/fail result display
- [x] T074 [P] [US2] Create web/components/auth-config/auth-config-form.tsx combining method selector with appropriate config component based on selected method

### Pages for User Story 2

- [x] T075 [US2] Create web/app/(dashboard)/projects/[projectId]/settings/page.tsx with auth-config-form component for project authentication settings
- [x] T076 [US2] Update web/app/api/projects/[projectId]/route.ts GET handler to include hasAuthConfig boolean and authMethod in response
- [x] T077 [US2] Add "Settings" link to project detail card/page linking to /projects/[projectId]/settings

### Integration with Scan Flow

- [x] T078 [US2] Update web/lib/actions/scans.ts startScan() to fetch project's auth config and pass to Temporal workflow
- [x] T079 [US2] Update web/lib/temporal/client.ts startScanWorkflow to accept authConfig parameter (workflow types updated)
- [x] T080 [US2] Update web/components/scans/scan-detail-card.tsx to show auth method used (if any) in scan details
- [x] T081 [US2] Add specific error handling in scan progress for auth failures: show "Authentication failed" with guidance to check project settings

**Checkpoint**: User Story 2 (Authenticated Testing) is fully functional and independently testable

---

## Phase 6: Polish & Cross-Cutting Concerns (US2 Scope) ✅ COMPLETE

**Purpose**: Improvements for User Story 2 delivery

- [x] T082 [P] Add loading states to auth-config-form.tsx during save/validate operations
- [x] T083 [P] Add validation error messages for invalid CSS selectors or URLs in form auth config
- [x] T084 Add audit logging for auth.configured, auth.validated, auth.removed events
- [x] T085 Ensure auth config API routes return proper error codes: 400 (invalid config), 404 (project not found)
- [x] T086 Add success toast notification after auth config save and validation pass

---

## Dependencies & Execution Order (Updated)

### Phase Dependencies

```
Phase 1: Setup ✅
    ↓
Phase 2: Foundational (BLOCKS all user stories) ✅
    ↓
Phase 3: User Story 1 - Quick Scan MVP ✅
    ↓
Phase 4: Polish (US1) ✅
    ↓
Phase 5: User Story 2 - Authenticated Testing ✅
    ↓
Phase 6: Polish (US2) ✅
```

### Task Dependencies Within User Story 2

```
T048-T050 (Schema) → T051-T053 (Encryption)
    ↓
T054-T057 (API Routes) + T058-T061 (Server Actions) [can run in parallel]
    ↓
T062-T067 (Temporal Activity)
    ↓
T068-T074 (UI Components) [all parallel - different files]
    ↓
T075-T077 (Pages)
    ↓
T078-T081 (Integration)
    ↓
T082-T086 (Polish)
```

### Parallel Opportunities for User Story 2

- T054-T057 (API Routes) parallel with T058-T061 (Server Actions)
- T068-T074 (UI Components) all parallel - different files
- T082-T083 (Polish) parallel

---

## Verification Checklist (User Story 2)

After completing all US2 tasks, verify:
- [ ] Can select auth method from dropdown (Form, API Token, Basic Auth)
- [ ] Form auth config shows all required fields (URL, selectors, credentials)
- [ ] "Test Authentication" validates credentials and shows clear pass/fail
- [ ] TOTP can be enabled and generates valid codes
- [ ] Saved auth config persists and auto-applies to new scans
- [ ] Auth failure during scan shows specific error message
- [ ] Credentials are encrypted at rest (verify in database)

---

## Phase 7: User Story 3 - Scan History and Details (Priority: P3) ✅ COMPLETE

**Goal**: Users can view scan history with filtering, pagination, and drill into detailed results with export options

**Independent Test**: Run multiple scans, view history page sorted by date, filter by status, paginate results, view scan detail with findings breakdown, export as PDF/JSON

**Acceptance Criteria**:
1. Scan history sorted by most recent first
2. Filter scans by status and date range
3. Paginated results with cursor-based pagination
4. Detailed breakdown of findings by severity
5. Export scan reports in PDF and JSON (SARIF) formats

### API Enhancements for User Story 3

- [x] T087 [US3] Enhance GET /api/scans route in web/app/api/scans/route.ts with status enum filter (COMPLETED, RUNNING, CANCELLED, FAILED)
- [x] T088 [US3] Enhance GET /api/scans route in web/app/api/scans/route.ts with dateRange filter (startDate, endDate query params)
- [x] T089 [US3] Add cursor-based pagination to GET /api/scans route with limit (default 20, max 100) and nextCursor response field

### Export Functionality for User Story 3

- [x] T090 [P] [US3] Create web/lib/export/pdf-generator.ts using Puppeteer + Marked to convert markdown report to PDF with styled template
- [x] T091 [P] [US3] Create web/lib/export/sarif-exporter.ts to convert scan findings to SARIF v2.1.0 JSON format with rule IDs, severity levels, locations
- [x] T092 [US3] Create GET /api/scans/[scanId]/export route in web/app/api/scans/[scanId]/export/route.ts with format query param (pdf, json, html)
- [x] T093 [US3] Implement PDF generation logic in export route using pdf-generator.ts
- [x] T094 [US3] Implement SARIF JSON generation logic in export route using sarif-exporter.ts

### Server Actions for User Story 3

- [x] T095 [US3] Enhance listScans action in web/lib/actions/scans.ts with statusFilter and dateRange parameters
- [x] T096 [US3] Add getScanWithFindings(orgId, scanId) action in web/lib/actions/scans.ts returning full findings breakdown
- [x] T097 [US3] Add getExportUrl(orgId, scanId, format) action in web/lib/actions/scans.ts returning download URL

### UI Components for User Story 3

- [x] T098 [P] [US3] Create web/components/scans/scan-filters.tsx with status multi-select dropdown and date range picker
- [x] T099 [P] [US3] Create web/components/ui/pagination-controls.tsx with "Load More" button and page size selector
- [x] T100 [P] [US3] Create web/components/scans/findings-breakdown.tsx showing severity counts with color-coded badges (critical/red, high/orange, medium/yellow, low/blue)
- [x] T101 [P] [US3] Create web/components/scans/export-button.tsx with format dropdown (PDF, JSON) and download trigger
- [x] T102 [US3] Enhance web/components/scans/scan-detail-card.tsx to include export-button and findings-breakdown components

### Pages for User Story 3

- [x] T103 [US3] Enhance web/app/(dashboard)/scans/page.tsx with pagination-controls and enhanced scan-filters
- [x] T104 [US3] Enhance web/app/(dashboard)/scans/[scanId]/page.tsx with export options and detailed findings view

**Checkpoint**: User Story 3 (Scan History) is fully functional - users can filter, paginate, and export scan data

---

## Phase 8: User Story 4 - Scheduled Scans (Priority: P4)

**Goal**: Users can configure recurring scans with email notifications on completion

**Independent Test**: Create weekly schedule for a project, verify Temporal schedule is created, wait for scheduled time, confirm scan runs automatically, receive email notification

**Acceptance Criteria**:
1. Preset frequencies: daily, weekly, custom cron
2. Scans trigger automatically at scheduled time
3. Email notifications on scan completion
4. Pause/resume schedule without deleting config
5. Distinguish scheduled scans from manual scans in history

### Database Schema for User Story 4

- [ ] T105 [US4] Add ScheduleStatus enum to web/prisma/schema.prisma (ACTIVE, PAUSED, DELETED)
- [ ] T106 [US4] Add ScanSchedule model to web/prisma/schema.prisma with fields: id, projectId, name, cronExpression, timezone, status, temporalScheduleId, notifyOnComplete, notifyEmails[], lastRunAt, nextRunAt, totalRuns, timestamps, and Project relation
- [ ] T107 [US4] Run prisma migrate dev --name add-schedules to create database migration

### Temporal Schedules Integration

- [ ] T108 [US4] Create web/lib/temporal/schedules.ts with createTemporalSchedule(scheduleId, cronExpression, workflowArgs) using Temporal Schedules API
- [ ] T109 [US4] Add pauseTemporalSchedule(scheduleId) function to web/lib/temporal/schedules.ts
- [ ] T110 [US4] Add resumeTemporalSchedule(scheduleId) function to web/lib/temporal/schedules.ts
- [ ] T111 [US4] Add deleteTemporalSchedule(scheduleId) function to web/lib/temporal/schedules.ts
- [ ] T112 [US4] Add getTemporalScheduleInfo(scheduleId) function returning next run time and status

### API Routes for User Story 4

- [ ] T113 [P] [US4] Create GET /api/projects/[projectId]/schedule route in web/app/api/projects/[projectId]/schedule/route.ts
- [ ] T114 [P] [US4] Create PUT /api/projects/[projectId]/schedule route in web/app/api/projects/[projectId]/schedule/route.ts to create/update schedule
- [ ] T115 [P] [US4] Create DELETE /api/projects/[projectId]/schedule route in web/app/api/projects/[projectId]/schedule/route.ts
- [ ] T116 [US4] Create POST /api/projects/[projectId]/schedule/pause route in web/app/api/projects/[projectId]/schedule/pause/route.ts
- [ ] T117 [US4] Create POST /api/projects/[projectId]/schedule/resume route in web/app/api/projects/[projectId]/schedule/resume/route.ts

### Server Actions for User Story 4

- [ ] T118 [US4] Create web/lib/actions/schedules.ts with getSchedule(orgId, projectId) action
- [ ] T119 [US4] Add createSchedule(orgId, projectId, config) action to web/lib/actions/schedules.ts
- [ ] T120 [US4] Add updateSchedule(orgId, projectId, scheduleId, config) action to web/lib/actions/schedules.ts
- [ ] T121 [US4] Add deleteSchedule(orgId, projectId, scheduleId) action to web/lib/actions/schedules.ts
- [ ] T122 [US4] Add pauseSchedule(orgId, projectId, scheduleId) action to web/lib/actions/schedules.ts
- [ ] T123 [US4] Add resumeSchedule(orgId, projectId, scheduleId) action to web/lib/actions/schedules.ts

### Email Notifications

- [ ] T124 [P] [US4] Install resend and @react-email/components if not already installed
- [ ] T125 [P] [US4] Create web/emails/scan-complete.tsx React Email template with scan summary, findings count, and link to results
- [ ] T126 [P] [US4] Create web/emails/scan-failed.tsx React Email template with error details and troubleshooting link
- [ ] T127 [US4] Create web/lib/email/send-notification.ts with sendScanNotification(scanId, recipientEmails, type) using Resend
- [ ] T128 [US4] Integrate email notification into scan workflow completion in src/temporal/activities.ts

### UI Components for User Story 4

- [ ] T129 [P] [US4] Create web/components/schedules/schedule-form.tsx with frequency presets (Daily, Weekly, Biweekly, Monthly, Custom)
- [ ] T130 [P] [US4] Create web/components/schedules/cron-builder.tsx for custom cron expression input with validation and preview
- [ ] T131 [P] [US4] Create web/components/schedules/schedule-card.tsx showing status, frequency, next run time, last run, and pause/resume/delete actions
- [ ] T132 [P] [US4] Create web/components/schedules/timezone-selector.tsx with IANA timezone dropdown
- [ ] T133 [US4] Create web/components/schedules/notification-settings.tsx with email list input for additional recipients

### Pages for User Story 4

- [ ] T134 [US4] Create web/app/(dashboard)/projects/[projectId]/schedule/page.tsx with schedule-form and schedule-card components
- [ ] T135 [US4] Add "Schedule" link to project settings navigation
- [ ] T136 [US4] Update scan-detail-card.tsx to show "Scheduled" badge when scan.source === 'SCHEDULED'

**Checkpoint**: User Story 4 (Scheduled Scans) is fully functional - recurring scans run automatically with email notifications

---

## Phase 9: User Story 5 - CI/CD Integration (Priority: P5)

**Goal**: GitHub PRs automatically trigger security scans with results posted as PR comments and blocking based on severity

**Independent Test**: Install GitHub App on repository, open PR, verify scan triggers automatically, see results as PR comment, verify PR blocked if critical findings exist

**Acceptance Criteria**:
1. GitHub App setup in under 5 minutes
2. PR opens trigger automatic scan
3. Scan results posted as PR comment with severity summary
4. Configurable severity threshold for PR blocking
5. Override blocked PR with recorded justification

### Database Schema for User Story 5

- [ ] T137 [US5] Add CICDProvider enum to web/prisma/schema.prisma (GITHUB)
- [ ] T138 [US5] Add IntegrationStatus enum to web/prisma/schema.prisma (ACTIVE, PAUSED, ERROR, DISCONNECTED)
- [ ] T139 [US5] Add SeverityLevel enum to web/prisma/schema.prisma (CRITICAL, HIGH, MEDIUM, LOW, INFO)
- [ ] T140 [US5] Add CICDIntegration model to web/prisma/schema.prisma with fields: id, projectId, provider, repositoryFullName, installationId, severityThreshold, autoComment, failOpen, status, lastWebhookAt, timestamps, and Project relation
- [ ] T141 [US5] Run prisma migrate dev --name add-cicd-integration to create database migration

### GitHub Webhook Handler

- [ ] T142 [US5] Create web/lib/github/verify-signature.ts with verifyWebhookSignature(payload, signature, secret) using crypto HMAC-SHA256
- [ ] T143 [US5] Create POST /api/webhooks/github route in web/app/api/webhooks/github/route.ts with signature verification
- [ ] T144 [US5] Handle pull_request.opened event: lookup integration by repo, start scan with source=CICD and PR metadata
- [ ] T145 [US5] Handle pull_request.synchronize event: start new scan if integration enabled for rescan on push
- [ ] T146 [US5] Handle installation.created event: log new GitHub App installation for setup flow

### GitHub API Client

- [ ] T147 [P] [US5] Create web/lib/github/auth.ts with getInstallationOctokit(installationId) using @octokit/auth-app
- [ ] T148 [P] [US5] Create web/lib/github/comments.ts with postPRComment(installationId, repo, prNumber, body) function
- [ ] T149 [P] [US5] Create web/lib/github/checks.ts with createCheckRun(installationId, repo, sha, status, conclusion, summary) function
- [ ] T150 [US5] Create web/lib/github/format-results.ts with formatScanForPR(scanResult) returning markdown summary with severity breakdown

### Server Actions for User Story 5

- [ ] T151 [US5] Create web/lib/actions/cicd.ts with getCICDIntegration(orgId, projectId) action
- [ ] T152 [US5] Add createCICDIntegration(orgId, projectId, config) action to web/lib/actions/cicd.ts
- [ ] T153 [US5] Add updateCICDIntegration(orgId, projectId, integrationId, config) action to web/lib/actions/cicd.ts
- [ ] T154 [US5] Add deleteCICDIntegration(orgId, projectId, integrationId) action to web/lib/actions/cicd.ts

### API Routes for User Story 5

- [ ] T155 [P] [US5] Create GET /api/projects/[projectId]/integrations/github route in web/app/api/projects/[projectId]/integrations/github/route.ts
- [ ] T156 [P] [US5] Create PUT /api/projects/[projectId]/integrations/github route in web/app/api/projects/[projectId]/integrations/github/route.ts
- [ ] T157 [US5] Create DELETE /api/projects/[projectId]/integrations/github route in web/app/api/projects/[projectId]/integrations/github/route.ts

### UI Components for User Story 5

- [ ] T158 [P] [US5] Create web/components/integrations/github-app-setup.tsx with GitHub App install button and setup instructions
- [ ] T159 [P] [US5] Create web/components/integrations/repository-selector.tsx to select repository from installed repos
- [ ] T160 [P] [US5] Create web/components/integrations/severity-threshold.tsx with dropdown to select blocking threshold (Critical, High, Medium, Low, None)
- [ ] T161 [P] [US5] Create web/components/integrations/integration-status.tsx showing connection status, last webhook time, and actions
- [ ] T162 [US5] Create web/components/integrations/integration-settings.tsx combining all integration config components

### Workflow Integration

- [ ] T163 [US5] Update src/temporal/workflows.ts pentestPipelineWorkflow to handle source=CICD with PR metadata
- [ ] T164 [US5] Create postResultsToGitHub activity in src/temporal/activities.ts that posts comment and updates check status
- [ ] T165 [US5] Implement severity threshold checking in postResultsToGitHub activity to determine check conclusion (success/failure)
- [ ] T166 [US5] Handle failOpen setting: if Shannon unreachable, allow PR with warning comment

### Pages for User Story 5

- [ ] T167 [US5] Create web/app/(dashboard)/integrations/github/page.tsx with GitHub App setup flow
- [ ] T168 [US5] Create web/app/(dashboard)/projects/[projectId]/integrations/page.tsx with integration-settings component
- [ ] T169 [US5] Add "Integrations" link to project settings navigation

**Checkpoint**: User Story 5 (CI/CD Integration) is fully functional - PRs trigger automatic scans with blocking

---

## Phase 10: Final Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect all user stories and production readiness

### Observability & Metrics

- [ ] T170 [P] Create web/lib/logger.ts with structured logging for scan operations (scan.started, scan.completed, scan.failed, auth.validated)
- [ ] T171 [P] Create web/lib/metrics.ts to track key metrics: scan duration, success rate, queue depth, concurrent scans per org
- [ ] T172 Add metrics emission to scan server actions in web/lib/actions/scans.ts

### Data Retention

- [ ] T173 Create web/lib/jobs/data-retention.ts with cleanup job for scans older than 12 months per FR-020
- [ ] T174 Create cron trigger for data retention job (monthly execution)

### Error Handling & UX

- [ ] T175 [P] Add loading skeletons to all new components (schedule-form, integration-settings, findings-breakdown)
- [ ] T176 [P] Add error boundaries to all new pages with user-friendly error messages
- [ ] T177 Ensure all API routes return proper error codes per OpenAPI spec (400, 401, 403, 404, 409)

### Validation & Documentation

- [ ] T178 Run quickstart.md validation to verify all features work end-to-end
- [ ] T179 Update web/.env.example with all new environment variables (GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET, RESEND_API_KEY)
- [ ] T180 Final code cleanup and type refinements across all scan features

---

## Dependencies & Execution Order (Complete)

### Phase Dependencies

```
Phase 1-6: COMPLETE (US1 + US2)
    ↓
Phase 7: User Story 3 - History (can start after US1)
    ↓ (parallel with US4, US5)
Phase 8: User Story 4 - Schedules (can start after Phase 2)
    ↓ (parallel with US3, US5)
Phase 9: User Story 5 - CI/CD (can start after Phase 2)
    ↓
Phase 10: Final Polish (after all user stories)
```

### User Story Dependencies

- **US3 (History)**: Depends on US1 for scan data to filter/export - Start after Phase 6
- **US4 (Schedules)**: No US dependency - Can start after Phase 6
- **US5 (CI/CD)**: No US dependency - Can start after Phase 6
- **US4 and US5 can run in parallel** with different developers

### Parallel Team Strategy

With multiple developers:
1. **Developer A**: User Story 3 (History + Export)
2. **Developer B**: User Story 4 (Schedules + Email)
3. **Developer C**: User Story 5 (GitHub CI/CD)
4. **All**: Phase 10 Polish after stories complete

---

## Summary Statistics

| Phase | User Story | Task Count | Status |
|-------|------------|------------|--------|
| 1 | Setup | 5 | COMPLETE |
| 2 | Foundational | 12 | COMPLETE |
| 3 | US1 - Quick Scan | 25 | COMPLETE |
| 4 | Polish (US1) | 5 | COMPLETE |
| 5 | US2 - Auth Testing | 34 | COMPLETE |
| 6 | Polish (US2) | 5 | COMPLETE |
| 7 | US3 - History | 18 | COMPLETE |
| 8 | US4 - Schedules | 32 | Pending |
| 9 | US5 - CI/CD | 33 | Pending |
| 10 | Final Polish | 11 | Pending |
| **Total** | | **180** | 104 complete, 76 pending |

### Parallel Opportunities per Phase

- **Phase 7**: T090-T091 (export utils), T098-T101 (UI components)
- **Phase 8**: T113-T115 (API routes), T125-T126 (email templates), T129-T132 (UI components)
- **Phase 9**: T147-T149 (GitHub client), T155-T156 (API routes), T158-T161 (UI components)
- **Phase 10**: T170-T171 (observability), T175-T176 (UX polish)

---

## Verification Checklist (All User Stories)

### User Story 3 - History
- [ ] Scans sorted by date (newest first)
- [ ] Filter by status works correctly
- [ ] Date range filter works correctly
- [ ] Pagination loads more results
- [ ] PDF export downloads correctly formatted report
- [ ] JSON export produces valid SARIF format

### User Story 4 - Schedules
- [ ] Can create schedule with preset frequency
- [ ] Custom cron expression accepted and validated
- [ ] Temporal schedule created successfully
- [ ] Scan runs automatically at scheduled time
- [ ] Email notification sent on completion
- [ ] Pause/resume functions correctly

### User Story 5 - CI/CD
- [ ] GitHub App setup completes in under 5 minutes
- [ ] PR opened triggers automatic scan
- [ ] Scan results appear as PR comment
- [ ] PR blocked when findings exceed threshold
- [ ] Override with justification works
- [ ] failOpen setting allows PR when Shannon unreachable

---

## Notes

- [P] tasks = different files, no dependencies on each other
- [US#] label = task belongs to specific User Story
- All API routes must scope queries by organizationId from Clerk auth
- Temporal schedules use native Schedules API (not cron jobs)
- GitHub integration uses GitHub App (not OAuth or PAT)
- SARIF export enables GitHub Code Scanning import
- Email notifications use Resend with React Email templates
