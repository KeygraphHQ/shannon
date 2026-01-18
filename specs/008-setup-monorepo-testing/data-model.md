# Data Model: Automated Testing Infrastructure

**Date**: 2026-01-18
**Related Plan**: [plan.md](./plan.md)

## Overview

This feature is **infrastructure/tooling** focused. It does not introduce new database entities or persistent data models. Instead, it defines **configuration entities** that govern test execution behavior.

---

## Configuration Entities

### 1. Vitest Workspace Configuration

**Location**: `vitest.workspace.ts` (repository root)

**Purpose**: Defines how Vitest discovers and runs tests across the monorepo.

**Structure**:
```typescript
interface WorkspaceConfig {
  projects: string[];  // Paths to package configs: ['shannon', 'ghostshell']
}
```

---

### 2. Package Test Configuration

**Location**: `{package}/vitest.config.ts`

**Purpose**: Package-specific test settings.

**Structure**:
```typescript
interface PackageTestConfig {
  // Test discovery
  include: string[];           // e.g., ['__tests__/**/*.test.ts']
  exclude: string[];           // e.g., ['node_modules']

  // Environment
  environment: 'node' | 'happy-dom' | 'jsdom';

  // Execution
  testTimeout: number;         // 30000 (30 seconds per clarification)
  hookTimeout: number;         // Timeout for setup/teardown

  // Coverage
  coverage: {
    enabled: boolean;
    provider: 'v8';
    reporter: string[];        // ['text', 'html', 'lcov']
    thresholds: {
      statements: number;      // 70 (per clarification)
      branches: number;        // 70
      functions: number;       // 70
      lines: number;           // 70
    };
  };

  // Setup files
  setupFiles: string[];        // e.g., ['./test-setup.ts']
}
```

---

### 3. CI Workflow Configuration

**Location**: `.github/workflows/test.yml`

**Purpose**: Defines automated test execution in GitHub Actions.

**Structure** (conceptual):
```yaml
Workflow:
  name: string           # "Tests"
  triggers:
    - pull_request
    - push (main branch)
  jobs:
    test:
      runs-on: string    # "ubuntu-latest"
      steps:
        - checkout
        - setup-node
        - install-dependencies
        - run-tests
        - upload-coverage
```

---

### 4. Test Suite (Runtime Concept)

**Purpose**: Logical grouping of related tests.

**Attributes**:
| Attribute | Type | Description |
|-----------|------|-------------|
| name | string | Suite description (from describe block) |
| file | string | Path to test file |
| tests | TestCase[] | Individual test cases |
| beforeAll | Function? | Suite setup hook |
| afterAll | Function? | Suite teardown hook |

---

### 5. Test Case (Runtime Concept)

**Purpose**: Individual test verifying specific behavior.

**Attributes**:
| Attribute | Type | Description |
|-----------|------|-------------|
| name | string | Test description (from it/test block) |
| status | 'pass' \| 'fail' \| 'skip' | Execution result |
| duration | number | Execution time in ms |
| error | Error? | Failure details if status is 'fail' |
| timeout | number | Max allowed duration (30s default) |

---

### 6. Coverage Report (Output Artifact)

**Purpose**: Summary of code coverage metrics.

**Attributes**:
| Attribute | Type | Description |
|-----------|------|-------------|
| package | string | 'shannon' \| 'ghostshell' |
| statements | CoverageMetric | Statement coverage |
| branches | CoverageMetric | Branch coverage |
| functions | CoverageMetric | Function coverage |
| lines | CoverageMetric | Line coverage |
| uncoveredFiles | FileReport[] | Files below threshold |

**CoverageMetric**:
```typescript
interface CoverageMetric {
  total: number;      // Total coverable items
  covered: number;    // Items covered by tests
  percentage: number; // covered/total * 100
}
```

---

## Entity Relationships

```
┌─────────────────────┐
│  Workspace Config   │
│  (vitest.workspace) │
└──────────┬──────────┘
           │ references
           ▼
┌──────────────────────────────────────────┐
│         Package Test Configs             │
│  ┌─────────────┐    ┌─────────────────┐  │
│  │   Shannon   │    │   GhostShell    │  │
│  │   config    │    │     config      │  │
│  └─────────────┘    └─────────────────┘  │
└──────────────────────────────────────────┘
           │ discovers
           ▼
┌──────────────────────────────────────────┐
│            Test Suites                   │
│  ┌─────────────┐    ┌─────────────────┐  │
│  │ Unit Tests  │    │ Component Tests │  │
│  └──────┬──────┘    └────────┬────────┘  │
│         │                    │           │
│         ▼                    ▼           │
│  ┌─────────────┐    ┌─────────────────┐  │
│  │ Test Cases  │    │   Test Cases    │  │
│  └─────────────┘    └─────────────────┘  │
└──────────────────────────────────────────┘
           │ produces
           ▼
┌──────────────────────────────────────────┐
│           Coverage Reports               │
│  (statements, branches, functions, lines)│
└──────────────────────────────────────────┘
```

---

## State Transitions

### Test Case Lifecycle

```
[pending] ──run──▶ [running] ──pass──▶ [passed]
                      │
                      ├──fail──▶ [failed]
                      │
                      └──timeout──▶ [failed: timeout]
```

### CI Pipeline Status

```
[queued] ──start──▶ [running] ──all pass──▶ [success] ──▶ PR check: ✅
                        │
                        └──any fail or coverage below threshold──▶ [failure] ──▶ PR check: ❌
```

---

## Notes

- No database schema changes required
- All entities are either configuration files or runtime/output concepts
- Test results are ephemeral (not persisted beyond CI logs)
- Coverage reports stored as CI artifacts (7-day retention typical)
