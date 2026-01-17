# Tasks: Findings & Remediation Management

**Input**: Design documents from `/specs/003-findings-remediation/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: Tests are NOT explicitly requested. Manual testing via quickstart.md scenarios.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Paths assume `web/` as the working directory per plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database schema updates and shared types

- [x] T001 Create Prisma migration for FindingNote model in web/prisma/migrations/
- [x] T002 [P] Add FindingNote model to web/prisma/schema.prisma with relations to Finding and User
- [x] T003 [P] Add notes relation to existing Finding model in web/prisma/schema.prisma
- [x] T004 [P] Add findingNotes relation to existing User model in web/prisma/schema.prisma
- [x] T005 [P] Add composite index [status, severity] on Finding for cross-scan queries in web/prisma/schema.prisma
- [x] T006 Run prisma migrate dev to apply schema changes
- [x] T007 [P] Create shared TypeScript types for findings in web/lib/types/findings.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core server actions that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T008 Create web/lib/actions/findings.ts with "use server" directive and imports
- [x] T009 Implement getFinding(findingId) server action with org access check in web/lib/actions/findings.ts
- [x] T010 Implement updateFindingStatus(findingId, status, justification?) server action with audit log in web/lib/actions/findings.ts
- [x] T011 [P] Create web/components/findings/ directory for all finding components
- [x] T012 [P] Create findings route group at web/app/(dashboard)/findings/ with layout.tsx

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Finding Detail View & Status Management (Priority: P1) MVP

**Goal**: View findings in detail and update their status with audit logging

**Independent Test**: Navigate to a finding from scan detail, view all details (title, severity, evidence, remediation), change status to "fixed" (no justification) and "accepted_risk" (with justification required)

### Implementation for User Story 1

- [x] T013 [P] [US1] Create FindingStatusSelect component with justification modal in web/components/findings/finding-status-select.tsx
- [x] T014 [P] [US1] Create FindingDetail component displaying all finding fields in web/components/findings/finding-detail.tsx
- [x] T015 [P] [US1] Create EvidenceDisplay component for formatting evidence JSON in web/components/findings/evidence-display.tsx
- [x] T016 [US1] Create finding detail page at web/app/(dashboard)/findings/[findingId]/page.tsx
- [x] T017 [US1] Add "View Details" link from scan detail page findings table to /dashboard/findings/[findingId]
- [x] T018 [US1] Add client-side optimistic update and error handling to FindingStatusSelect

**Checkpoint**: User Story 1 complete - can view finding details and update status with audit logging

---

## Phase 4: User Story 2 - Remediation Notes & Activity History (Priority: P2)

**Goal**: Add notes to findings and view unified activity timeline

**Independent Test**: Add a note to a finding, verify it appears in activity history. Change status, verify status change also appears in timeline with correct chronological order.

### Implementation for User Story 2

- [x] T019 [P] [US2] Implement addFindingNote(findingId, content) server action in web/lib/actions/findings.ts
- [x] T020 [P] [US2] Implement getFindingActivity(findingId) server action returning merged notes + status changes in web/lib/actions/findings.ts
- [x] T021 [P] [US2] Create FindingNoteForm component with text input and submit in web/components/findings/finding-note-form.tsx
- [x] T022 [P] [US2] Create ActivityEntry component for individual timeline items in web/components/findings/activity-entry.tsx
- [x] T023 [US2] Create FindingActivity component with timeline display in web/components/findings/finding-activity.tsx
- [x] T024 [US2] Integrate FindingNoteForm and FindingActivity into finding detail page at web/app/(dashboard)/findings/[findingId]/page.tsx
- [x] T025 [US2] Add optimistic updates for note submission and activity refresh

**Checkpoint**: User Story 2 complete - can add notes and view full activity history

---

## Phase 5: User Story 3 - Findings List with Filtering & Search (Priority: P3)

**Goal**: Cross-scan findings view with filters, search, and dashboard widget

**Independent Test**: Navigate to /dashboard/findings, apply severity filter (Critical, High), verify only matching findings shown. Apply status filter "open", verify filtering works. Search by keyword, verify matches in title/description. Clear filters and verify.

### Implementation for User Story 3

- [x] T026 [P] [US3] Implement listFindings(filters, pagination) server action with cursor pagination in web/lib/actions/findings.ts
- [x] T027 [P] [US3] Implement getFindingsSummary() server action for dashboard widget in web/lib/actions/findings.ts
- [x] T028 [P] [US3] Create FindingsFilters component with severity/status/category dropdowns in web/components/findings/findings-filters.tsx
- [x] T029 [P] [US3] Create FindingsSearch component with debounced text input in web/components/findings/findings-search.tsx
- [x] T030 [P] [US3] Create FindingsListItem component for individual finding row in web/components/findings/findings-list-item.tsx
- [x] T031 [US3] Create FindingsList component with pagination and loading states in web/components/findings/findings-list.tsx
- [x] T032 [US3] Create cross-scan findings page at web/app/(dashboard)/findings/page.tsx
- [x] T033 [US3] Create FindingsWidget dashboard summary component in web/components/dashboard/findings-widget.tsx
- [x] T034 [US3] Integrate FindingsWidget into main dashboard page at web/app/(dashboard)/page.tsx
- [x] T035 [US3] Add filter chips display showing active filters with clear functionality
- [x] T036 [US3] Add "No findings match your filters" empty state with clear filters button

**Checkpoint**: User Story 3 complete - cross-scan findings view with filtering, search, and dashboard widget

---

## Phase 6: User Story 4 - Bulk Status Updates (Priority: P4)

**Goal**: Update multiple findings at once with bulk actions toolbar

**Independent Test**: Select 5 findings from list, verify bulk toolbar shows "5 selected". Click "Mark as Fixed", verify all 5 update. Check audit logs for individual entries per finding.

### Implementation for User Story 4

- [x] T037 [P] [US4] Implement bulkUpdateFindingStatus(findingIds, status, justification?) server action in web/lib/actions/findings.ts
- [x] T038 [P] [US4] Create BulkStatusModal component with confirmation and optional justification in web/components/findings/bulk-status-modal.tsx
- [x] T039 [US4] Create FindingsBulkActions toolbar component with select all, count, action buttons in web/components/findings/findings-bulk-actions.tsx
- [x] T040 [US4] Add selection state management (checkboxes) to FindingsList component in web/components/findings/findings-list.tsx
- [x] T041 [US4] Integrate FindingsBulkActions toolbar into findings list page at web/app/(dashboard)/findings/page.tsx
- [x] T042 [US4] Add loading states and error handling for bulk operations

**Checkpoint**: User Story 4 complete - can select and bulk update multiple findings

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and improvements across all stories

- [x] T043 [P] Add loading skeletons to FindingDetail, FindingsList, and FindingActivity components
- [ ] T044 [P] Add keyboard shortcuts for status changes in FindingStatusSelect (optional enhancement)
- [x] T045 Verify all server actions have proper revalidatePath calls for cache invalidation
- [ ] T046 Run quickstart.md validation scenarios for all user stories
- [x] T047 [P] Ensure mobile responsiveness for all findings components
- [x] T048 Final code review for security (org access checks on all queries)
- [x] T049 [P] Implement scheduled audit log cleanup job to purge entries older than 2 years (per FR-017)
- [ ] T050 Manual performance validation: verify filter <1s, bulk 50 findings <5s, search <2s using browser DevTools with 10K findings dataset

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion (T001-T007 must complete first)
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion (T008-T012)
  - User stories can proceed in parallel if multiple developers available
  - Or sequentially in priority order (P1 -> P2 -> P3 -> P4)
- **Polish (Phase 7)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational - No dependencies on US1 (uses same finding detail page but different sections)
- **User Story 3 (P3)**: Can start after Foundational - No dependencies on US1/US2
- **User Story 4 (P4)**: Depends on US3 (uses FindingsList component for selection state)

### Within Each User Story

- Server actions before UI components
- Components before pages
- Core implementation before integrations
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel after T001 completes
- Foundational: T011, T012 can run in parallel with T008-T010
- US1: T013, T014, T015 can run in parallel
- US2: T019, T020, T021, T022 can run in parallel
- US3: T026, T027, T028, T029, T030 can run in parallel
- US4: T037, T038 can run in parallel
- Polish: T043, T044, T047, T049 can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all parallelizable tasks for User Story 1 together:
Task: "Create FindingStatusSelect component in web/components/findings/finding-status-select.tsx"
Task: "Create FindingDetail component in web/components/findings/finding-detail.tsx"
Task: "Create EvidenceDisplay component in web/components/findings/evidence-display.tsx"

# Then sequentially:
Task: "Create finding detail page at web/app/(dashboard)/findings/[findingId]/page.tsx"
```

---

## Parallel Example: User Story 3

```bash
# Launch all parallelizable server actions and components:
Task: "Implement listFindings server action in web/lib/actions/findings.ts"
Task: "Implement getFindingsSummary server action in web/lib/actions/findings.ts"
Task: "Create FindingsFilters component in web/components/findings/findings-filters.tsx"
Task: "Create FindingsSearch component in web/components/findings/findings-search.tsx"
Task: "Create FindingsListItem component in web/components/findings/findings-list-item.tsx"

# Then sequentially:
Task: "Create FindingsList component in web/components/findings/findings-list.tsx"
Task: "Create cross-scan findings page at web/app/(dashboard)/findings/page.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (schema migration)
2. Complete Phase 2: Foundational (server actions, base structure)
3. Complete Phase 3: User Story 1 (detail view, status management)
4. **STOP and VALIDATE**: Test finding detail and status changes manually
5. Deploy/demo if ready - delivers immediate value for remediation tracking

### Incremental Delivery

1. Complete Setup + Foundational -> Foundation ready
2. Add User Story 1 -> Test independently -> Deploy/Demo (MVP!)
3. Add User Story 2 -> Test independently -> Deploy/Demo (notes + activity)
4. Add User Story 3 -> Test independently -> Deploy/Demo (filtering + dashboard)
5. Add User Story 4 -> Test independently -> Deploy/Demo (bulk operations)
6. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
3. User Story 4 can start once US3 is far enough along (needs FindingsList)
4. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Use quickstart.md testing checklist to validate each story
- All server actions MUST use hasOrgAccess() for multi-tenant security
