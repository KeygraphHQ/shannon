# Tasks: Automated Testing Infrastructure for Shannon Monorepo

**Input**: Design documents from `/specs/008-setup-monorepo-testing/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

This is a monorepo with two packages:
- **Root**: `vitest.workspace.ts`, `package.json`
- **Shannon**: `shannon/vitest.config.ts`, `shannon/__tests__/`
- **GhostShell**: `ghostshell/vitest.config.ts`, `ghostshell/__tests__/`, `ghostshell/test-setup.ts`
- **CI**: `.github/workflows/test.yml`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and workspace configuration

- [ ] T001 Create Vitest workspace configuration in vitest.workspace.ts
- [ ] T002 [P] Create test directory structure for Shannon in shannon/__tests__/unit/ and shannon/__tests__/integration/
- [ ] T003 [P] Create test directory structure for GhostShell in ghostshell/__tests__/unit/ and ghostshell/__tests__/components/
- [ ] T004 [P] Create .github/workflows/ directory for CI workflow

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core configuration that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 Install @vitest/coverage-v8 as devDependency in shannon/package.json
- [ ] T006 [P] Install Vitest, @testing-library/react, @testing-library/jest-dom, and happy-dom as devDependencies in ghostshell/package.json
- [ ] T007 Create Shannon package Vitest configuration in shannon/vitest.config.ts with 30s timeout and coverage settings
- [ ] T008 [P] Create GhostShell package Vitest configuration in ghostshell/vitest.config.ts with happy-dom environment and 30s timeout
- [ ] T009 Create Testing Library setup file in ghostshell/test-setup.ts with jest-dom matchers

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Developer Runs Local Tests (Priority: P1) 🎯 MVP

**Goal**: Enable developers to run automated tests locally with a single command from the repository root

**Independent Test**: Run `npm test` from repository root and verify tests execute for both packages with pass/fail results

### Implementation for User Story 1

- [ ] T010 [US1] Add test scripts to root package.json (test, test:watch, test:coverage)
- [ ] T011 [P] [US1] Add test scripts to shannon/package.json (test, test:watch)
- [ ] T012 [P] [US1] Add test scripts to ghostshell/package.json (test, test:watch)
- [ ] T013 [P] [US1] Create example unit test for Shannon in shannon/__tests__/unit/config-parser.test.ts
- [ ] T014 [P] [US1] Create example component test for GhostShell in ghostshell/__tests__/components/example.test.tsx
- [ ] T015 [US1] Verify local test execution works by running npm test from root

**Checkpoint**: At this point, developers can run `npm test` locally and see test results for both packages

---

## Phase 4: User Story 2 - CI Validates Pull Requests (Priority: P1)

**Goal**: Automatically validate pull requests by running tests in GitHub Actions CI

**Independent Test**: Create a PR and verify CI automatically runs tests and reports pass/fail status

### Implementation for User Story 2

- [ ] T016 [US2] Create GitHub Actions workflow file in .github/workflows/test.yml
- [ ] T017 [US2] Configure workflow to trigger on pull_request and push to main
- [ ] T018 [US2] Add checkout, Node.js setup, and npm ci steps to workflow
- [ ] T019 [US2] Add build step to workflow (npm run build)
- [ ] T020 [US2] Add test execution step with coverage to workflow (npm run test:coverage)
- [ ] T021 [US2] Configure coverage artifact upload in workflow
- [ ] T022 [US2] Add concurrency configuration to cancel duplicate workflow runs

**Checkpoint**: PRs now automatically run tests and show pass/fail status checks

---

## Phase 5: User Story 3 - Developer Writes New Tests (Priority: P2)

**Goal**: Provide clear patterns and utilities for writing tests so developers can efficiently create test coverage

**Independent Test**: Follow quickstart.md to create a new test file and verify it integrates with the test runner

### Implementation for User Story 3

- [ ] T023 [P] [US3] Create integration test example for Shannon in shannon/__tests__/integration/example.spec.ts
- [ ] T024 [P] [US3] Create unit test example with mocking in shannon/__tests__/unit/mocking-example.test.ts
- [ ] T025 [P] [US3] Create React hook test example in ghostshell/__tests__/unit/hooks-example.test.ts
- [ ] T026 [US3] Create async test example with proper patterns in ghostshell/__tests__/components/async-example.test.tsx
- [ ] T027 [US3] Add test filtering script to root package.json for running specific tests by pattern

**Checkpoint**: Developers have clear patterns for unit tests, component tests, integration tests, and mocking

---

## Phase 6: User Story 4 - Team Monitors Code Coverage (Priority: P3)

**Goal**: Generate code coverage reports showing percentage coverage per package with enforcement threshold

**Independent Test**: Run tests with coverage enabled and verify HTML report shows per-package coverage percentages

### Implementation for User Story 4

- [ ] T028 [US4] Add coverage threshold configuration (70%) to shannon/vitest.config.ts
- [ ] T029 [P] [US4] Add coverage threshold configuration (70%) to ghostshell/vitest.config.ts
- [ ] T030 [US4] Configure coverage reporters (text, html, lcov) in both package configs
- [ ] T031 [US4] Add coverage directory to .gitignore
- [ ] T032 [US4] Update CI workflow to fail on coverage threshold violations
- [ ] T033 [US4] Add coverage badge or summary comment to PR workflow (optional enhancement)

**Checkpoint**: Coverage reports are generated locally and in CI; threshold violations block PRs

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and final validation

- [ ] T034 [P] Update CLAUDE.md with testing commands and patterns
- [ ] T035 [P] Add test-related entries to .gitignore (coverage/, .vitest-cache/)
- [ ] T036 Validate all quickstart.md scenarios work correctly
- [ ] T037 Run full test suite and verify all acceptance criteria pass
- [ ] T038 Verify CI workflow completes successfully on a test PR

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - US1 and US2 are both P1 priority
  - US2 (CI) benefits from US1 (local tests) being complete first
  - US3 and US4 can proceed in priority order
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - No dependencies on other stories - **MVP**
- **User Story 2 (P1)**: Benefits from US1 completion (tests to run in CI) - Should follow US1
- **User Story 3 (P2)**: Can start after Foundational - Adds examples building on US1 structure
- **User Story 4 (P3)**: Can start after Foundational - Coverage config can be done early but enforcement tested after US2

### Within Each User Story

- Configuration tasks before example/validation tasks
- Package-level tasks can run in parallel [P]
- Verification task last in each phase

### Parallel Opportunities

**Phase 1 (Setup)**:
```
T002, T003, T004 can run in parallel (different directories)
```

**Phase 2 (Foundational)**:
```
T006, T008 can run in parallel (different packages)
```

**Phase 3 (US1)**:
```
T011, T012 can run in parallel (different package.json files)
T013, T014 can run in parallel (different packages)
```

**Phase 5 (US3)**:
```
T023, T024, T025 can run in parallel (different test files)
```

**Phase 6 (US4)**:
```
T028, T029 can run in parallel (different vitest configs)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T009)
3. Complete Phase 3: User Story 1 (T010-T015)
4. **STOP and VALIDATE**: Run `npm test` from root - should see tests pass
5. Developers can now run tests locally!

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add User Story 1 → Local testing works (MVP!)
3. Add User Story 2 → CI validates PRs automatically
4. Add User Story 3 → Developers have clear testing patterns
5. Add User Story 4 → Coverage monitoring and enforcement
6. Polish → Documentation and final validation

### Suggested Execution Order

```
Phase 1 → Phase 2 → Phase 3 (MVP) → Phase 4 → Phase 5 → Phase 6 → Phase 7
```

---

## Summary

| Phase | User Story | Task Count | Parallel Tasks |
|-------|------------|------------|----------------|
| 1     | Setup      | 4          | 3              |
| 2     | Foundational | 5        | 2              |
| 3     | US1 (MVP)  | 6          | 4              |
| 4     | US2        | 7          | 0              |
| 5     | US3        | 5          | 3              |
| 6     | US4        | 6          | 1              |
| 7     | Polish     | 5          | 2              |
| **Total** |        | **38**     | **15**         |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- No tests for existing code included - this feature IS the testing infrastructure
