# Research: Automated Testing Infrastructure for Shannon Monorepo

**Date**: 2026-01-18
**Related Plan**: [plan.md](./plan.md)

## Executive Summary

This document consolidates research findings for implementing automated testing infrastructure in the Shannon monorepo. All technical decisions have been validated against the project's existing stack and constitution principles.

---

## 1. Test Runner Selection

### Decision: Vitest 4.x

**Rationale**:
- Already installed in Shannon package (vitest: ^4.0.17)
- Native ESM support matches project configuration (`"type": "module"`)
- First-class TypeScript support without additional configuration
- Compatible with Testing Library ecosystem
- Built-in coverage via @vitest/coverage-v8
- Workspace support for monorepo testing

**Alternatives Considered**:

| Alternative | Evaluation | Rejected Because |
|-------------|------------|------------------|
| Jest | Industry standard, large ecosystem | Requires additional ESM configuration; Vitest already present |
| Node.js Test Runner | Native, zero dependencies | Limited ecosystem; no workspace support; less mature |
| Mocha + Chai | Flexible, long history | More configuration needed; Vitest provides better DX |

---

## 2. Component Testing Library

### Decision: @testing-library/react + @testing-library/jest-dom

**Rationale**:
- Industry standard for React component testing
- Tests user behavior, not implementation details
- Works seamlessly with Vitest
- Supports React 19 (GhostShell's React version)
- jest-dom provides useful DOM matchers

**Alternatives Considered**:

| Alternative | Evaluation | Rejected Because |
|-------------|------------|------------------|
| Enzyme | Legacy React testing | Deprecated; doesn't support React 18+ |
| React Testing Library only | Core library | jest-dom matchers significantly improve test readability |
| Playwright Component Testing | Modern, powerful | Overkill for unit/component tests; better for E2E |

---

## 3. DOM Environment for Component Tests

### Decision: happy-dom

**Rationale**:
- Faster than jsdom (2-10x performance improvement)
- Sufficient for most React component tests
- Lower memory footprint
- Vitest first-class support

**Alternatives Considered**:

| Alternative | Evaluation | Rejected Because |
|-------------|------------|------------------|
| jsdom | Most compatible, widely used | Slower; happy-dom sufficient for our needs |
| Playwright browser | Real browser rendering | Too heavy for unit tests; adds complexity |

**Fallback**: If happy-dom causes compatibility issues with specific tests, can configure individual test files to use jsdom via Vitest's environment directive.

---

## 4. Coverage Reporting

### Decision: @vitest/coverage-v8

**Rationale**:
- Native V8 coverage (faster than Istanbul)
- Built-in Vitest integration
- Supports coverage thresholds per file/directory
- Generates multiple report formats (text, html, lcov)

**Configuration Approach**:
- Enforce 70-80% coverage for new/changed code (per clarification)
- Use `--coverage.changed` flag in CI for delta coverage
- Generate HTML reports for local development
- Generate LCOV for CI integration

**Alternatives Considered**:

| Alternative | Evaluation | Rejected Because |
|-------------|------------|------------------|
| Istanbul/nyc | Industry standard | Slower than V8; requires additional setup |
| c8 | V8-based, standalone | Vitest's built-in coverage is more integrated |

---

## 5. CI Platform

### Decision: GitHub Actions

**Rationale**:
- Repository already on GitHub (per assumptions)
- Native integration with PR status checks
- Free for public repositories; generous free tier for private
- YAML-based configuration version controlled with code
- Matrix support for testing multiple Node versions if needed

**Workflow Design**:
- Trigger on pull_request and push to main
- Run tests for both packages in parallel
- Upload coverage reports as artifacts
- Fail PR if tests fail or coverage below threshold

**Alternatives Considered**:

| Alternative | Evaluation | Rejected Because |
|-------------|------------|------------------|
| GitLab CI | Powerful, similar capabilities | Project uses GitHub |
| CircleCI | Fast, flexible | Additional service to manage; GitHub Actions sufficient |
| Jenkins | Self-hosted, highly customizable | Infrastructure overhead; overkill for this project |

---

## 6. Monorepo Test Execution Strategy

### Decision: Vitest Workspaces

**Rationale**:
- Single configuration file at root
- Each package can have its own vitest.config.ts
- `npm test` from root runs all tests
- Package-specific scripts for isolated execution
- Shared configuration via extends

**Configuration Structure**:
```
vitest.workspace.ts (root)
├── shannon/vitest.config.ts
└── ghostshell/vitest.config.ts
```

**Alternatives Considered**:

| Alternative | Evaluation | Rejected Because |
|-------------|------------|------------------|
| Turborepo | Caching, pipeline orchestration | Additional tooling; npm workspaces sufficient for now |
| Nx | Monorepo tooling suite | Heavy; adds complexity beyond current needs |
| npm run -ws | Native workspace scripts | Less control over parallel execution and shared config |

---

## 7. Test File Organization

### Decision: `__tests__/` directories with subdirectories

**Rationale**:
- Clear separation between source and tests
- Consistent with many popular projects
- Subdirectories (unit/, integration/, components/) provide organization
- Easy to configure in vitest include/exclude patterns

**Naming Convention**:
- `*.test.ts` for unit tests
- `*.spec.ts` for integration tests (optional differentiation)
- `*.test.tsx` for React component tests

**Alternatives Considered**:

| Alternative | Evaluation | Rejected Because |
|-------------|------------|------------------|
| Co-located tests (src/**/*.test.ts) | Tests near source | Clutters source directories; harder to exclude from builds |
| tests/ at root | Single test directory | Doesn't scale well with monorepo packages |

---

## 8. Mocking Strategy

### Decision: Vitest built-in mocking + MSW for HTTP

**Rationale**:
- vi.mock() for module mocking (built into Vitest)
- vi.spyOn() for function spying
- MSW (Mock Service Worker) for HTTP mocking if needed later
- Consistent API across all packages

**Best Practices**:
- Mock at module boundaries, not internal implementation
- Use dependency injection where possible for easier testing
- Avoid over-mocking; prefer integration tests where practical

---

## 9. Test Timeout Configuration

### Decision: 30 seconds per test (per clarification)

**Implementation**:
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    testTimeout: 30000, // 30 seconds
  }
})
```

**Rationale**: Balances catching runaway tests while allowing moderately complex integration tests.

---

## 10. Coverage Threshold Implementation

### Decision: 70-80% for new/changed code (per clarification)

**Implementation Approach**:
- Use Vitest's coverage thresholds with `--coverage` flag
- Configure in vitest.config.ts with reasonable defaults
- CI will enforce via `--coverage.100` or custom threshold configuration
- Consider using codecov or similar for PR diff coverage

**Configuration**:
```typescript
// vitest.config.ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'html', 'lcov'],
  thresholds: {
    statements: 70,
    branches: 70,
    functions: 70,
    lines: 70,
  }
}
```

---

## Unresolved Items

None. All technical decisions have been made and validated.

---

## References

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library Documentation](https://testing-library.com/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Vitest Workspaces](https://vitest.dev/guide/workspace.html)
- [happy-dom](https://github.com/capricorn86/happy-dom)
