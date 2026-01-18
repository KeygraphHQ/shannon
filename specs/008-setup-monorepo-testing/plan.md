# Implementation Plan: Automated Testing Infrastructure for Shannon Monorepo

**Branch**: `008-setup-monorepo-testing` | **Date**: 2026-01-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-setup-monorepo-testing/spec.md`

## Summary

This plan establishes automated testing infrastructure for the Shannon monorepo, enabling developers to run tests locally and in CI. The implementation uses Vitest as the test runner (already present in Shannon package), adds Testing Library for React component testing in GhostShell, and creates a GitHub Actions CI pipeline for automated PR validation with coverage enforcement.

## Technical Context

**Language/Version**: TypeScript 5.x (both packages)
**Primary Dependencies**:
- Vitest 4.x (test runner - already in Shannon, to add in GhostShell)
- @testing-library/react + @testing-library/jest-dom (component testing for GhostShell)
- @vitest/coverage-v8 (coverage reporting)
- happy-dom or jsdom (DOM environment for component tests)

**Storage**: N/A (testing infrastructure only)
**Testing**: Vitest with workspaces configuration
**Target Platform**: Node.js 20+ (local), GitHub Actions (CI)
**Project Type**: Monorepo with npm workspaces
**Performance Goals**:
- Local tests: <60 seconds for initial suite
- CI feedback: <5 minutes total pipeline time
**Constraints**:
- 30 second timeout per test
- 70-80% coverage threshold for new/changed code
**Scale/Scope**: 2 packages (Shannon, GhostShell)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Security-First | PASS | Testing infrastructure supports security quality gates |
| II. AI-Native Architecture | N/A | Testing infra is tooling, not AI workflow |
| III. Multi-Tenant Isolation | N/A | Testing infra is tooling, not data handling |
| IV. Temporal-First Orchestration | N/A | Testing infra is tooling, not workflow orchestration |
| V. Progressive Delivery | PASS | Tests enable independent, incremental delivery with confidence |
| VI. Observability-Driven | PASS | Coverage reports and CI checks provide visibility |
| VII. Simplicity Over Complexity | PASS | Using established, widely-adopted tools (Vitest, Testing Library) |

**Quality Gates Alignment**:
- Pre-Merge Gates: Tests support "all existing tests MUST pass" requirement
- TypeScript strict mode: Test files will follow existing TypeScript configuration

**Result**: All applicable gates PASS. Proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/008-setup-monorepo-testing/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (minimal for this feature)
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
# Root configuration
vitest.workspace.ts          # Vitest workspace configuration for monorepo
.github/
└── workflows/
    └── test.yml             # GitHub Actions CI workflow

# Shannon package (existing structure extended)
shannon/
├── src/
│   └── **/*.ts              # Existing source files
├── __tests__/               # Test files (new)
│   ├── unit/                # Unit tests
│   └── integration/         # Integration tests
├── vitest.config.ts         # Package-specific Vitest config (new)
└── package.json             # Add test scripts

# GhostShell package (existing structure extended)
ghostshell/
├── app/                     # Existing Next.js app
├── components/              # Existing React components
├── lib/                     # Existing utilities
├── __tests__/               # Test files (new)
│   ├── unit/                # Unit tests for lib/
│   └── components/          # Component tests
├── vitest.config.ts         # Package-specific Vitest config (new)
├── test-setup.ts            # Testing Library setup (new)
└── package.json             # Add test dependencies and scripts
```

**Structure Decision**: Extend existing monorepo structure with `__tests__/` directories in each package. Vitest workspace configuration at root enables unified test execution while maintaining package isolation.

## Complexity Tracking

> No violations identified. All choices align with Simplicity principle.

| Decision | Rationale |
|----------|-----------|
| Vitest over Jest | Already present in Shannon; modern, fast, native ESM support |
| Testing Library | Standard for React testing; focused on user behavior |
| `__tests__/` directories | Keeps tests separate from source; clear organization |
| Workspace config at root | Enables single command for all tests per FR-001 |
