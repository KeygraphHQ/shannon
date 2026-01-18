# Implementation Plan: Monorepo Restructure with GhostShell

**Branch**: `007-monorepo-restructure` | **Date**: 2025-01-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-monorepo-restructure/spec.md`

## Summary

Restructure the Shannon repository into a monorepo with two isolated root-level packages: `shannon/` (penetration testing engine with HTTP API) and `ghostshell/` (web application, renamed from `web/`). The database will be renamed from `shannon` to `ghostshell`. Root level contains only orchestration files (docker-compose, workspace config, CLI script).

## Technical Context

**Language/Version**: TypeScript 5.x (existing)
**Primary Dependencies**: npm workspaces for monorepo management
**Storage**: PostgreSQL 15+ (database renamed from `shannon` to `ghostshell`)
**Testing**: Vitest (existing in Shannon), Jest/Vitest (GhostShell)
**Target Platform**: Node.js 20+ (Shannon), Next.js 16 (GhostShell)
**Project Type**: Monorepo with npm workspaces
**Performance Goals**: N/A (restructure, no performance changes)
**Constraints**: Zero functional regression after restructure
**Scale/Scope**: ~50 files to move, 2 packages to create

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Security-First | ✅ PASS | No security changes; separation may improve security by isolating concerns |
| II. AI-Native Architecture | ✅ PASS | Claude Agent SDK remains in Shannon package; no impact to AI capabilities |
| III. Multi-Tenant Isolation | ✅ PASS | Tenant isolation unchanged; database rename is cosmetic |
| IV. Temporal-First Orchestration | ✅ PASS | Temporal workflows stay in Shannon package; no orchestration changes |
| V. Progressive Delivery | ✅ PASS | Restructure enables clearer separation for independent deployments |
| VI. Observability-Driven Operations | ✅ PASS | Logging/metrics unchanged; may improve with package-level separation |
| VII. Simplicity Over Complexity | ✅ PASS | Monorepo with workspaces is standard pattern; reduces root-level clutter |

**Gate Result**: PASS - All constitutional principles satisfied.

## Project Structure

### Documentation (this feature)

```text
specs/007-monorepo-restructure/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (file mapping)
├── quickstart.md        # Phase 1 output (migration guide)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
# Target Monorepo Structure

/                              # Repository root
├── package.json               # Workspace config only (no build scripts)
├── docker-compose.yml         # Full system orchestration
├── shannon                    # CLI script (symlink or wrapper)
├── README.md                  # Monorepo overview
├── CLAUDE.md                  # Updated for monorepo structure
├── .env.example               # Combined environment template
│
├── shannon/                   # Penetration testing engine
│   ├── package.json           # Shannon-specific dependencies
│   ├── tsconfig.json          # Shannon TypeScript config
│   ├── Dockerfile             # Shannon container
│   ├── src/
│   │   ├── ai/                # Claude Agent SDK integration
│   │   ├── audit/             # Audit logging
│   │   ├── cli/               # CLI utilities
│   │   ├── phases/            # Pentest phases
│   │   ├── prompts/           # Prompt manager
│   │   ├── service/           # HTTP API (Fastify)
│   │   └── temporal/          # Temporal workflows/activities
│   ├── prompts/               # Prompt templates
│   ├── configs/               # Config schema and examples
│   ├── docker/                # Shannon-specific docker configs
│   └── dist/                  # Build output
│
├── ghostshell/                # Web application (renamed from web/)
│   ├── package.json           # GhostShell-specific dependencies
│   ├── tsconfig.json          # GhostShell TypeScript config
│   ├── next.config.ts         # Next.js configuration
│   ├── prisma/
│   │   └── schema.prisma      # Database schema (uses ghostshell DB)
│   ├── app/                   # Next.js App Router
│   ├── components/            # React components
│   ├── lib/                   # Utilities
│   └── public/                # Static assets
│
├── specs/                     # Feature specifications (shared)
├── .specify/                  # Specify tooling (shared)
└── .github/                   # CI/CD workflows (shared)
```

**Structure Decision**: Monorepo with npm workspaces. Each package (`shannon/`, `ghostshell/`) is fully self-contained with its own `package.json`, `tsconfig.json`, and build configuration. Root level contains only orchestration and shared documentation.

## Complexity Tracking

No constitution violations requiring justification.

## Migration Strategy

### Phase 1: Create Shannon Package

1. Create `shannon/` directory
2. Move: `src/`, `prompts/`, `configs/`, `docker/`, `Dockerfile`, `tsconfig.json`
3. Create Shannon-specific `package.json` with current dependencies
4. Update all internal import paths
5. Verify Shannon builds and runs independently

### Phase 2: Create GhostShell Package

1. Rename `web/` to `ghostshell/`
2. Update `package.json` name from `web` to `ghostshell`
3. Rename database from `shannon` to `ghostshell` in:
   - `prisma/schema.prisma`
   - `.env.example`
   - `docker-compose.yml`
4. Verify GhostShell builds and runs independently

### Phase 3: Root Orchestration

1. Create minimal root `package.json` with workspaces config
2. Update `docker-compose.yml` for new paths
3. Update `shannon` CLI script to work from root
4. Update `README.md` and `CLAUDE.md`
5. Verify full system orchestration works

### Phase 4: Cleanup & Verification

1. Remove orphaned root-level files
2. Run all tests in both packages
3. Verify pentest workflow completes successfully
4. Verify GhostShell web functionality works
