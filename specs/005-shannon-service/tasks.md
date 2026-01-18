# Tasks: Shannon Service Architecture

**Input**: Design documents from `/specs/005-shannon-service/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/openapi.yaml ✓

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Path Conventions

Based on plan.md structure:
- **Service Layer**: `shannon/src/service/` (NEW)
- **Existing Code**: `shannon/src/temporal/`, `shannon/src/types/`, etc. (preserved)
- **Web App**: `ghostshell/prisma/`, `ghostshell/lib/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependencies, and base service structure

- [x] T001 Install Fastify and plugins: `npm install fastify @fastify/cors @fastify/helmet @fastify/rate-limit @fastify/swagger @fastify/sensible otpauth playwright`
- [x] T001.5 Build MCP server (required before main build): `cd mcp-server && npm ci && npm run build`
- [x] T002 Install development dependencies: `npm install -D vitest @types/node`
- [x] T003 [P] Create service directory structure: `src/service/`, `src/service/middleware/`, `src/service/routes/`, `src/service/services/`, `src/service/types/`
- [x] T004 [P] Create API types file with Zod schemas in `src/service/types/api.ts`
- [x] T005 [P] Create Fastify app bootstrap in `src/service/app.ts` with plugin registration
- [x] T006 Add npm scripts to `package.json`: `service:start`, `service:dev`, `test:service`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Database Schema Extensions

- [x] T007 Add APIKey model to `ghostshell/prisma/schema.prisma` per data-model.md specification
- [x] T008 Add ReportJob model to `ghostshell/prisma/schema.prisma` per data-model.md specification
- [x] T009 Extend Scan model with `parentScanId`, `queuedAt`, `apiKeyId` fields in `ghostshell/prisma/schema.prisma`
- [x] T010 Add Organization relations for `apiKeys` and `reportJobs` in `ghostshell/prisma/schema.prisma`
- [x] T011 Run Prisma migrations: `cd ghostshell && npx prisma migrate dev --name add_service_models`
- [x] T012 Generate Prisma client: `cd ghostshell && npx prisma generate`

### Core Service Infrastructure

- [x] T013 [P] Implement RFC 7807 error handler middleware in `src/service/middleware/error-handler.ts`
- [x] T014 [P] Implement API key authentication middleware in `src/service/middleware/auth.ts`
- [x] T015 [P] Implement rate limiting middleware in `src/service/middleware/rate-limit.ts`
- [x] T016 [P] Create request correlation ID middleware in `src/service/middleware/correlation.ts`
- [x] T017 [P] Create Prisma client singleton for service in `src/service/db.ts`
- [x] T018 Create Temporal client wrapper for service layer in `src/service/temporal-client.ts`
- [x] T019 Register all middleware in `src/service/app.ts` (depends on T013-T16)
- [x] T020 Create service entry point in `src/service/index.ts` with graceful shutdown handling

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Internal Service Communication (Priority: P1) 🎯 MVP

**Goal**: Web application can trigger scans, monitor progress, and retrieve results via REST API without direct Temporal client access.

**Independent Test**: POST `/api/v1/scans` creates scan, GET progress returns live status, GET results returns findings after completion.

### Implementation for User Story 1

- [x] T021 [P] [US1] Create ScanService class in `src/service/services/scan-service.ts` with Temporal integration
- [x] T022 [P] [US1] Create ProgressService class in `src/service/services/progress-service.ts` for workflow queries
- [x] T023 [US1] Implement POST `/api/v1/scans` (createScan) in `src/service/routes/scans.ts`
- [x] T024 [US1] Implement GET `/api/v1/scans` (listScans) with pagination in `src/service/routes/scans.ts`
- [x] T025 [US1] Implement GET `/api/v1/scans/{scanId}` (getScan) in `src/service/routes/scans.ts`
- [x] T026 [US1] Implement GET `/api/v1/scans/{scanId}/progress` (getScanProgress) in `src/service/routes/scans.ts`
- [x] T027 [US1] Implement GET `/api/v1/scans/{scanId}/results` (getScanResults) with cursor pagination in `src/service/routes/scans.ts`
- [x] T028 [US1] Implement DELETE `/api/v1/scans/{scanId}` (cancelScan) with Temporal workflow cancellation in `src/service/routes/scans.ts`
- [x] T029 [US1] Implement POST `/api/v1/scans/{scanId}/retry` (retryScan) in `src/service/routes/scans.ts`
- [x] T030 [US1] Add concurrent scan limit enforcement (default 3) in `src/service/services/scan-service.ts`
- [x] T031 [US1] Add scan queuing logic when Temporal unavailable in `src/service/services/scan-service.ts`
- [x] T032 [US1] Register scan routes in `src/service/app.ts`
- [x] T033 [US1] Add organization-scoped query filters to all scan operations

**Checkpoint**: User Story 1 complete - web app can manage full scan lifecycle via API

---

## Phase 4: User Story 2 - Service Health and Discovery (Priority: P1) 🎯 MVP

**Goal**: Operations engineers can monitor service availability and integrate with Kubernetes health probes.

**Independent Test**: GET `/health` returns 200 with dependency status when healthy, 503 when Temporal unavailable.

### Implementation for User Story 2

- [x] T034 [P] [US2] Create HealthService class in `src/service/services/health-service.ts` with dependency checks
- [x] T035 [US2] Implement GET `/health` (overall status) in `src/service/routes/health.ts`
- [x] T036 [US2] Implement GET `/health/ready` (Kubernetes readiness) in `src/service/routes/health.ts`
- [x] T037 [US2] Implement GET `/health/live` (Kubernetes liveness) in `src/service/routes/health.ts`
- [x] T038 [US2] Implement GET `/metrics` (Prometheus format) in `src/service/routes/health.ts`
- [x] T039 [US2] Implement GET `/api/v1/info` (version, build info) in `src/service/routes/health.ts`
- [x] T040 [US2] Add Temporal connectivity check to HealthService
- [x] T041 [US2] Add database connectivity check to HealthService
- [x] T042 [US2] Create metrics collector for scan counts, durations, error rates in `src/service/services/metrics-service.ts`
- [x] T043 [US2] Register health routes in `src/service/app.ts`

**Checkpoint**: User Story 2 complete - service is production-ready with health monitoring

---

## Phase 5: User Story 3 - Authentication Validation Service (Priority: P2)

**Goal**: Web application can validate user-provided credentials before starting a scan.

**Independent Test**: POST `/api/v1/auth/validate` with valid credentials returns `{valid: true}`, invalid returns specific error code.

### Implementation for User Story 3

- [x] T044 [P] [US3] Create ValidationService class in `src/service/services/validation-service.ts`
- [x] T045 [US3] Implement form-based credential validation in `src/service/services/validation-service.ts`
- [x] T046 [US3] Implement API token validation in `src/service/services/validation-service.ts`
- [x] T047 [US3] Implement Basic Auth validation in `src/service/services/validation-service.ts`
- [x] T048 [US3] Implement SSO validation in `src/service/services/validation-service.ts`
- [x] T049 [US3] Add TOTP code generation using existing MCP tool in `src/service/services/validation-service.ts`
- [x] T050 [US3] Implement POST `/api/v1/auth/validate` (validateAuth) in `src/service/routes/auth-validate.ts`
- [x] T051 [US3] Add 60-second timeout handling for validation requests
- [x] T052 [US3] Ensure credentials are NOT logged (audit logs contain only outcome and error codes)
- [x] T053 [US3] Register auth validation routes in `src/service/app.ts`

**Checkpoint**: User Story 3 complete - credentials can be tested before scan

---

## Phase 6: User Story 4 - Scan Configuration Templates (Priority: P3)

**Goal**: Web application can dynamically retrieve supported configuration options from the service.

**Independent Test**: GET `/api/v1/config/auth-methods` returns list of methods with required fields.

### Implementation for User Story 4

- [x] T054 [P] [US4] Create ConfigService class in `src/service/services/config-service.ts`
- [x] T055 [US4] Define auth method configurations (form, api_token, basic, sso) with required fields
- [x] T056 [US4] Define scan option configurations with defaults and valid ranges
- [x] T057 [US4] Define scan phase configurations with descriptions
- [x] T058 [US4] Implement GET `/api/v1/config/auth-methods` in `src/service/routes/config.ts`
- [x] T059 [US4] Implement GET `/api/v1/config/scan-options` in `src/service/routes/config.ts`
- [x] T060 [US4] Implement GET `/api/v1/config/phases` in `src/service/routes/config.ts`
- [x] T061 [US4] Register config routes in `src/service/app.ts`

**Checkpoint**: User Story 4 complete - web UI can dynamically adapt to service capabilities

---

## Phase 7: User Story 5 - Async Report Generation (Priority: P3)

**Goal**: Web application can request report generation asynchronously for large scans.

**Independent Test**: POST `/api/v1/scans/{id}/reports` returns job ID, GET status shows progress, download returns file.

### Implementation for User Story 5

- [x] T062 [P] [US5] Create ReportService class in `src/service/services/report-service.ts`
- [x] T063 [US5] Implement PDF report generation using existing report logic
- [x] T064 [US5] Implement HTML report generation
- [x] T065 [US5] Implement JSON report export
- [x] T066 [US5] Implement SARIF format export for security tool integration
- [x] T067 [US5] Implement POST `/api/v1/scans/{scanId}/reports` (createReport) in `src/service/routes/reports.ts`
- [x] T068 [US5] Implement GET `/api/v1/reports/{jobId}/status` in `src/service/routes/reports.ts`
- [x] T069 [US5] Implement GET `/api/v1/reports/{jobId}/download` with content-type negotiation in `src/service/routes/reports.ts`
- [x] T070 [US5] Add background worker for report generation jobs
- [x] T071 [US5] Register report routes in `src/service/app.ts`

**Checkpoint**: User Story 5 complete - async report generation fully functional

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Integration, documentation, and production readiness

### Web App Integration

- [x] T072 [P] Create Shannon API client in `ghostshell/lib/shannon-client.ts`
- [x] T073 Add environment variables for service URL and API key in `ghostshell/.env.example`

### OpenAPI Documentation

- [x] T074 Configure @fastify/swagger to serve OpenAPI spec at `/docs` in `src/service/app.ts`
- [x] T075 Validate generated OpenAPI matches `specs/005-shannon-service/contracts/openapi.yaml`

### Docker & Deployment

- [x] T076 Create Dockerfile for Shannon service in `docker/Dockerfile.service`
- [x] T077 Add service to `docker-compose.yml` with proper networking
- [x] T078 Add Kubernetes deployment manifest in `k8s/shannon-service.yaml`

### Final Validation

- [x] T079 Run quickstart.md validation - verify all steps work
- [x] T080 Verify all acceptance scenarios from spec.md pass
- [x] T081 Performance benchmark: verify <500ms p95 for GET, <2s p95 for POST /scans

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup ─────────────────────┐
                                    │
                                    ▼
Phase 2: Foundational ──────────────┼─── BLOCKS ALL USER STORIES
                                    │
        ┌───────────────────────────┴───────────────────────────┐
        │                                                       │
        ▼                                                       ▼
Phase 3: US1 (P1)                                   Phase 4: US2 (P1)
Internal Service                                    Health & Discovery
Communication                                       (can parallel with US1)
        │                                                       │
        └────────────────────┬──────────────────────────────────┘
                             │
                             ▼
                    Phase 5: US3 (P2)
                    Auth Validation
                             │
        ┌────────────────────┴────────────────────┐
        │                                          │
        ▼                                          ▼
Phase 6: US4 (P3)                         Phase 7: US5 (P3)
Config Templates                          Report Generation
(can parallel with US5)                   (can parallel with US4)
        │                                          │
        └────────────────────┬─────────────────────┘
                             │
                             ▼
                    Phase 8: Polish
```

### User Story Dependencies

| Story | Priority | Depends On | Can Parallel With |
|-------|----------|------------|-------------------|
| US1 | P1 | Foundation | US2 |
| US2 | P1 | Foundation | US1 |
| US3 | P2 | Foundation | US4, US5 |
| US4 | P3 | Foundation | US3, US5 |
| US5 | P3 | Foundation | US3, US4 |

### Within Each User Story

1. Services before routes
2. Routes registered in app.ts after implementation
3. All [P] tasks within a phase can run in parallel

---

## Parallel Execution Examples

### Phase 2 Foundational (Maximum Parallelism)

```bash
# Parallel Group A: Schema changes
Task T007: Add APIKey model to ghostshell/prisma/schema.prisma
Task T008: Add ReportJob model to ghostshell/prisma/schema.prisma
Task T009: Extend Scan model in ghostshell/prisma/schema.prisma
Task T010: Add Organization relations in ghostshell/prisma/schema.prisma

# Sequential: Migrations (after A)
Task T011: Run Prisma migrations
Task T012: Generate Prisma client

# Parallel Group B: Middleware (can start with Group A)
Task T013: RFC 7807 error handler in src/service/middleware/error-handler.ts
Task T014: API key auth middleware in src/service/middleware/auth.ts
Task T015: Rate limiting middleware in src/service/middleware/rate-limit.ts
Task T016: Correlation ID middleware in src/service/middleware/correlation.ts
Task T017: Prisma client singleton in src/service/db.ts
```

### User Story 1 + 2 in Parallel

```bash
# Developer A: User Story 1
Task T021: ScanService in src/service/services/scan-service.ts
Task T022: ProgressService in src/service/services/progress-service.ts
Task T023-T033: Scan routes and logic

# Developer B: User Story 2 (simultaneously)
Task T034: HealthService in src/service/services/health-service.ts
Task T035-T043: Health routes and metrics
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. ✅ Complete Phase 1: Setup
2. ✅ Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. ✅ Complete Phase 3: User Story 1 - Core scan API
4. ✅ Complete Phase 4: User Story 2 - Health endpoints
5. **STOP and VALIDATE**: Service can manage scans via API and is production-ready
6. Deploy/demo MVP

### Incremental Delivery

| Increment | Stories | Value Delivered |
|-----------|---------|-----------------|
| MVP | US1 + US2 | Web app can trigger and monitor scans |
| +P2 | US3 | Credential validation before scan |
| +P3 | US4, US5 | Full config discovery and async reports |

### Estimated Scope

| Phase | Tasks | Parallelizable |
|-------|-------|----------------|
| Setup | 6 | 3 |
| Foundational | 14 | 9 |
| US1 (P1) | 13 | 3 |
| US2 (P1) | 10 | 1 |
| US3 (P2) | 10 | 1 |
| US4 (P3) | 8 | 1 |
| US5 (P3) | 10 | 1 |
| Polish | 10 | 2 |
| **Total** | **81** | **21** |

---

## Notes

- All tasks include exact file paths for immediate executability
- [P] marks tasks that can run in parallel within their phase
- [US#] labels map tasks to user stories for traceability
- Each checkpoint validates story independence
- Commit after each task or logical group
- MVP = Phase 1 + 2 + 3 + 4 (Setup + Foundation + US1 + US2)
