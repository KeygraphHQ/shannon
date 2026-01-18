# Tasks: Monorepo Restructure with GhostShell

**Input**: Design documents from `/specs/007-monorepo-restructure/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

This is a monorepo restructure:
- `shannon/` - Penetration testing engine package
- `ghostshell/` - Web application package (renamed from web/)
- Root level - Orchestration files only

---

## Phase 1: Setup (Preparation)

**Purpose**: Ensure clean state before restructure begins

- [ ] T001 Create backup branch with `git checkout -b backup-pre-restructure && git checkout 007-monorepo-restructure`
- [ ] T002 Verify clean working directory with `git status` (no uncommitted changes)
- [ ] T003 Document current file structure snapshot for rollback reference

---

## Phase 2: User Story 1 - Shannon Package Isolation (Priority: P1) 🎯 MVP

**Goal**: Create `shannon/` package with all penetration testing engine code, buildable independently

**Independent Test**: `cd shannon && npm install && npm run build` succeeds without GhostShell

### Implementation for User Story 1

- [ ] T004 [US1] Create shannon/ directory structure with `mkdir -p shannon`
- [ ] T005 [US1] Move src/ directory with `git mv src shannon/src`
- [ ] T006 [P] [US1] Move prompts/ directory with `git mv prompts shannon/prompts`
- [ ] T007 [P] [US1] Move configs/ directory with `git mv configs shannon/configs`
- [ ] T008 [P] [US1] Move docker/ directory with `git mv docker shannon/docker`
- [ ] T009 [P] [US1] Move mcp-server/ directory with `git mv mcp-server shannon/mcp-server`
- [ ] T010 [US1] Move Dockerfile with `git mv Dockerfile shannon/Dockerfile`
- [ ] T011 [US1] Move tsconfig.json with `git mv tsconfig.json shannon/tsconfig.json`
- [ ] T012 [US1] Create shannon/package.json with dependencies from root package.json (see quickstart.md Step 2)
- [ ] T013 [US1] Update shannon/tsconfig.json paths for new structure (baseUrl, outDir to dist/)
- [ ] T014 [US1] Update internal import paths in shannon/src/ if any use absolute paths
- [ ] T015 [US1] Verify Shannon builds with `cd shannon && npm install && npm run build`
- [ ] T016 [US1] Verify Shannon tests pass with `cd shannon && npm run test:service`

**Checkpoint**: Shannon package is independently buildable and testable

---

## Phase 3: User Story 2 - GhostShell Package Isolation (Priority: P1)

**Goal**: Rename `web/` to `ghostshell/` with database rename, buildable independently

**Independent Test**: `cd ghostshell && npm install && npm run dev` succeeds without Shannon

### Implementation for User Story 2

- [ ] T017 [US2] Rename web/ to ghostshell/ with `git mv web ghostshell`
- [ ] T018 [US2] Update package name in ghostshell/package.json from "web" to "ghostshell"
- [ ] T019 [US2] Update database name in ghostshell/prisma/schema.prisma comments/docs (connection string uses env var)
- [ ] T020 [US2] Update any hardcoded "shannon" database references in ghostshell/ to "ghostshell"
- [ ] T021 [US2] Search and replace "web" references in ghostshell/next.config.ts if any
- [ ] T022 [US2] Verify GhostShell builds with `cd ghostshell && npm install && npm run build`
- [ ] T023 [US2] Verify GhostShell dev server starts with `cd ghostshell && npm run dev`

**Checkpoint**: GhostShell package is independently buildable and runnable

---

## Phase 4: User Story 3 - Full System Deployment (Priority: P2)

**Goal**: Root-level orchestration to run both Shannon and GhostShell together

**Independent Test**: `docker compose up` starts all services; both systems communicate

### Implementation for User Story 3

- [ ] T024 [US3] Create root package.json with npm workspaces config (see quickstart.md Step 8)
- [ ] T025 [US3] Update docker-compose.yml build contexts from `.` to `./shannon` for worker service
- [ ] T026 [US3] Update docker-compose.yml to add ghostshell service with context `./ghostshell`
- [ ] T027 [US3] Update docker-compose.yml postgres POSTGRES_DB from "shannon" to "ghostshell"
- [ ] T028 [US3] Update docker-compose.yml DATABASE_URL references to use ghostshell database
- [ ] T029 [US3] Update shannon CLI script paths from `dist/` to `shannon/dist/`
- [ ] T030 [US3] Update shannon CLI script paths from `src/` to `shannon/src/`
- [ ] T031 [US3] Update .env.example with new DATABASE_URL pointing to ghostshell database
- [ ] T032 [US3] Verify workspace install with `npm install` at root
- [ ] T033 [US3] Verify `npm run build` at root builds both packages
- [ ] T034 [US3] Verify `docker compose up -d` starts all services

**Checkpoint**: Full system deploys and runs from root

---

## Phase 5: User Story 4 - Database Rename Migration (Priority: P2)

**Goal**: Provide migration path for existing deployments from `shannon` to `ghostshell` database

**Independent Test**: Migration script runs; GhostShell connects to ghostshell database

### Implementation for User Story 4

- [ ] T035 [US4] Create migration guide section in README.md for database rename
- [ ] T036 [US4] Document SQL command `ALTER DATABASE shannon RENAME TO ghostshell` for existing deployments
- [ ] T037 [US4] Verify no remaining "shannon" database references in ghostshell/ with `grep -r "shannon" ghostshell/`
- [ ] T038 [US4] Verify no remaining "shannon" database references in docker-compose.yml
- [ ] T039 [US4] Test fresh database creation with ghostshell name via docker compose

**Checkpoint**: Database migration path documented and verified

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation updates, cleanup, and final verification

- [ ] T040 Update README.md with new monorepo structure and commands
- [ ] T041 Update CLAUDE.md with new directory paths and package structure
- [ ] T042 [P] Remove orphaned root dist/ directory
- [ ] T043 [P] Remove orphaned root node_modules/ directory
- [ ] T044 [P] Remove orphaned root package-lock.json
- [ ] T045 Verify git history preserved with `git log --follow shannon/src/temporal/workflows.ts`
- [ ] T046 Verify git history preserved with `git log --follow ghostshell/app/page.tsx`
- [ ] T047 Run full integration test: docker compose up, run pentest workflow
- [ ] T048 Commit all changes with descriptive message documenting restructure

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies - preparation tasks
- **Phase 2 (US1 - Shannon)**: Depends on Phase 1 completion
- **Phase 3 (US2 - GhostShell)**: Depends on Phase 1 completion, **can run in parallel with Phase 2**
- **Phase 4 (US3 - Orchestration)**: Depends on Phase 2 AND Phase 3 completion
- **Phase 5 (US4 - DB Migration)**: Depends on Phase 3 completion (GhostShell renamed)
- **Phase 6 (Polish)**: Depends on all previous phases

### User Story Dependencies

```
Phase 1 (Setup)
     │
     ├──────────────────┐
     ▼                  ▼
Phase 2 (US1)     Phase 3 (US2)   ← Can run in PARALLEL
     │                  │
     └────────┬─────────┘
              ▼
       Phase 4 (US3)
              │
              ▼
       Phase 5 (US4)
              │
              ▼
       Phase 6 (Polish)
```

### Parallel Opportunities

**Within Phase 2 (US1 - Shannon):**
```
T006, T007, T008, T009 - All directory moves can run in parallel
```

**Between Phases:**
```
Phase 2 (US1) and Phase 3 (US2) can run in parallel
  - US1: Shannon package creation
  - US2: GhostShell package creation
```

**Within Phase 6 (Polish):**
```
T042, T043, T044 - Cleanup tasks can run in parallel
```

---

## Parallel Example: Shannon & GhostShell Package Creation

```bash
# These two user stories can be worked on simultaneously:

# Developer A: User Story 1 (Shannon)
Task: "Create shannon/ directory structure"
Task: "Move src/ directory to shannon/"
Task: "Create shannon/package.json"
Task: "Verify Shannon builds independently"

# Developer B: User Story 2 (GhostShell)
Task: "Rename web/ to ghostshell/"
Task: "Update package name to ghostshell"
Task: "Update database references"
Task: "Verify GhostShell builds independently"
```

---

## Implementation Strategy

### MVP First (User Stories 1 & 2)

1. Complete Phase 1: Setup (backup, verify clean state)
2. Complete Phase 2: US1 - Shannon Package (P1)
3. Complete Phase 3: US2 - GhostShell Package (P1)
4. **STOP and VALIDATE**: Both packages build independently
5. Proceed to orchestration

### Incremental Delivery

1. Setup → Ready for restructure
2. Shannon Package → Shannon developers unblocked
3. GhostShell Package → GhostShell developers unblocked
4. Orchestration → Full system works
5. DB Migration → Existing deployments can migrate
6. Polish → Documentation complete

### Rollback Points

- **After Phase 1**: `git checkout backup-pre-restructure` to restore original state
- **After any phase**: `git reset --hard HEAD~N` to undo recent changes
- **Full rollback**: `git checkout main -- . && git clean -fd && npm install`

---

## Notes

- All file moves use `git mv` to preserve history
- US1 and US2 are both P1 priority and can be done in parallel
- US3 and US4 depend on US1/US2 completion
- No new tests required (this is restructure, not new features)
- Database schema unchanged; only name changes
- Verify each checkpoint before proceeding to next phase
