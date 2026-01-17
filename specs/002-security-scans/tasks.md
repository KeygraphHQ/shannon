# Tasks: Running Security Scans (US1 + US2)

**Input**: Design documents from `/specs/002-security-scans/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/
**Scope**: User Story 1 (Quick Scan) + User Story 2 (Authenticated Testing)

**Organization**: Tasks are grouped by phase to enable incremental delivery. This task list covers:
- Phase 1: Setup (Shared Infrastructure) ✅
- Phase 2: Foundational (Blocking Prerequisites) ✅
- Phase 3: User Story 1 - Quick Scan MVP
- Phase 4: Polish (US1)
- Phase 5: User Story 2 - Authenticated Testing
- Phase 6: Polish (US2)

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

## Phase 5: User Story 2 - Authenticated Testing (Priority: P2)

**Goal**: Users can configure authentication (form login, API token, Basic Auth, SSO, TOTP) so Shannon can test protected areas of applications

**Independent Test**: Configure form-based login with credentials, click "Test Authentication" - system validates credentials work before scan, saved config auto-applies to subsequent scans

**Acceptance Criteria**:
1. Select auth method: form-based, API token, Basic Auth, SSO
2. Test credentials before scan with clear pass/fail feedback
3. TOTP support for 2FA applications
4. Specific auth failure error messages (not generic)
5. Saved auth config persists at project level

### Database Schema for User Story 2

- [ ] T048 [US2] Add AuthMethod enum to web/prisma/schema.prisma (NONE, FORM, API_TOKEN, BASIC, SSO)
- [ ] T049 [US2] Add AuthenticationConfig model to web/prisma/schema.prisma with fields: id, projectId, method, encryptedCredentials, loginUrl, usernameSelector, passwordSelector, submitSelector, successIndicator, totpEnabled, totpSelector, lastValidatedAt, validationStatus, timestamps, and Project relation
- [ ] T050 [US2] Run prisma migrate dev --name add-auth-config to create database migration

### Encryption Utility

- [ ] T051 [US2] Create web/lib/encryption.ts with deriveOrgKey(orgId) function using HMAC-SHA256 to derive org-specific key from ENCRYPTION_MASTER_KEY
- [ ] T052 [US2] Add encryptCredential(plaintext, orgId) function to web/lib/encryption.ts using AES-256-GCM with 12-byte IV, returning iv:authTag:ciphertext format
- [ ] T053 [US2] Add decryptCredential(encrypted, orgId) function to web/lib/encryption.ts parsing iv:authTag:ciphertext and decrypting with org-derived key

### API Routes for User Story 2

- [ ] T054 [US2] Create web/app/api/projects/[projectId]/auth/route.ts GET handler returning auth config with credentials masked (hasCredentials: true/false)
- [ ] T055 [US2] Add PUT handler to web/app/api/projects/[projectId]/auth/route.ts to save auth config, encrypting credentials with org key
- [ ] T056 [US2] Add DELETE handler to web/app/api/projects/[projectId]/auth/route.ts to remove auth config
- [ ] T057 [US2] Create web/app/api/projects/[projectId]/auth/validate/route.ts POST handler that tests credentials and returns {valid, error, validatedAt}

### Server Actions for User Story 2

- [ ] T058 [US2] Create web/lib/actions/auth-config.ts with getAuthConfig(orgId, projectId) returning config with masked credentials
- [ ] T059 [US2] Add saveAuthConfig(orgId, projectId, config) to web/lib/actions/auth-config.ts encrypting credentials before storage
- [ ] T060 [US2] Add deleteAuthConfig(orgId, projectId) to web/lib/actions/auth-config.ts
- [ ] T061 [US2] Add validateAuthConfig(orgId, projectId) to web/lib/actions/auth-config.ts that triggers validation workflow

### Auth Validation Temporal Activity

- [ ] T062 [US2] Create src/temporal/activities/validate-auth.ts with validateAuthentication(config) activity that uses Playwright to test login flow
- [ ] T063 [US2] Add form-based validation logic: navigate to loginUrl, fill selectors, submit, check successIndicator
- [ ] T064 [US2] Add API token validation logic: make authenticated request to target, verify non-401 response
- [ ] T065 [US2] Add Basic Auth validation logic: make request with Authorization header, verify non-401 response
- [ ] T066 [US2] Add TOTP generation using otpauth library if totpEnabled is true
- [ ] T067 [US2] Register validateAuthentication activity in src/temporal/worker.ts

### UI Components for User Story 2

- [ ] T068 [P] [US2] Create web/components/auth-config/auth-method-selector.tsx with dropdown: None, Form Login, API Token, Basic Auth, SSO (disabled)
- [ ] T069 [P] [US2] Create web/components/auth-config/form-auth-config.tsx with fields: loginUrl, username, password, CSS selectors (username, password, submit, success)
- [ ] T070 [P] [US2] Create web/components/auth-config/api-token-config.tsx with apiToken input field and validation endpoint input
- [ ] T071 [P] [US2] Create web/components/auth-config/basic-auth-config.tsx with username and password fields
- [ ] T072 [P] [US2] Create web/components/auth-config/totp-config.tsx with totpSecret input and checkbox to enable TOTP, totpSelector field
- [ ] T073 [P] [US2] Create web/components/auth-config/test-auth-button.tsx with "Test Authentication" button, loading state, and pass/fail result display
- [ ] T074 [P] [US2] Create web/components/auth-config/auth-config-form.tsx combining method selector with appropriate config component based on selected method

### Pages for User Story 2

- [ ] T075 [US2] Create web/app/(dashboard)/projects/[projectId]/settings/page.tsx with auth-config-form component for project authentication settings
- [ ] T076 [US2] Update web/app/api/projects/[projectId]/route.ts GET handler to include hasAuthConfig boolean and authMethod in response
- [ ] T077 [US2] Add "Settings" link to project detail card/page linking to /projects/[projectId]/settings

### Integration with Scan Flow

- [ ] T078 [US2] Update web/lib/actions/scans.ts startScan() to fetch project's auth config and pass to Temporal workflow
- [ ] T079 [US2] Update src/temporal/workflows.ts pentestPipelineWorkflow to accept authConfig parameter and pass to agents
- [ ] T080 [US2] Update web/components/scans/scan-detail-card.tsx to show auth method used (if any) in scan details
- [ ] T081 [US2] Add specific error handling in scan progress for auth failures: show "Authentication failed" with guidance to check project settings

**Checkpoint**: User Story 2 (Authenticated Testing) is fully functional and independently testable

---

## Phase 6: Polish & Cross-Cutting Concerns (US2 Scope)

**Purpose**: Improvements for User Story 2 delivery

- [ ] T082 [P] Add loading states to auth-config-form.tsx during save/validate operations
- [ ] T083 [P] Add validation error messages for invalid CSS selectors or URLs in form auth config
- [ ] T084 Add audit logging for auth.configured, auth.validated, auth.removed events
- [ ] T085 Ensure auth config API routes return proper error codes: 400 (invalid config), 404 (project not found)
- [ ] T086 Add success toast notification after auth config save and validation pass

---

## Dependencies & Execution Order (Updated)

### Phase Dependencies

```
Phase 1: Setup ✅
    ↓
Phase 2: Foundational (BLOCKS all user stories)
    ↓
Phase 3: User Story 1 - Quick Scan MVP
    ↓
Phase 4: Polish (US1)
    ↓
Phase 5: User Story 2 - Authenticated Testing
    ↓
Phase 6: Polish (US2)
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

## Future User Stories (Not in This Task List)

When ready to expand beyond US1+US2:
- **User Story 3 (P3)**: Scan History - Already partially covered by US1
- **User Story 4 (P4)**: Scheduled Scans - Run `/speckit.tasks 002-security-scans phase 4`
- **User Story 5 (P5)**: CI/CD Integration - Run `/speckit.tasks 002-security-scans phase 5`
