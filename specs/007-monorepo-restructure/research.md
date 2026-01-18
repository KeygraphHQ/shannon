# Research: Monorepo Restructure with GhostShell

**Feature**: 007-monorepo-restructure
**Date**: 2025-01-18

## Research Questions

### 1. npm Workspaces Configuration

**Decision**: Use npm native workspaces (no external tooling like Turborepo/Nx)

**Rationale**:
- npm workspaces are built into npm 7+ (already available)
- Minimal configuration required for two-package monorepo
- No additional learning curve or dependencies
- Aligns with Constitution Principle VII (Simplicity Over Complexity)

**Alternatives Considered**:
- **Turborepo**: Overkill for 2 packages; adds build complexity
- **Nx**: Enterprise-focused; unnecessary for this scale
- **Lerna**: Deprecated in favor of native workspaces
- **pnpm workspaces**: Would require changing package manager

**Implementation**:
```json
// Root package.json
{
  "name": "shannon-monorepo",
  "private": true,
  "workspaces": ["shannon", "ghostshell"]
}
```

### 2. Database Rename Strategy

**Decision**: Update configuration references only; no data migration needed

**Rationale**:
- Database name is purely cosmetic (connection string parameter)
- Schema remains identical
- For existing deployments: create new database OR rename via SQL
- For new deployments: start fresh with `ghostshell` name

**Alternatives Considered**:
- **PostgreSQL RENAME DATABASE**: Requires disconnecting all clients; risky in production
- **pg_dump/pg_restore**: Heavy-handed for a name change
- **Parallel databases**: Would create synchronization issues

**Implementation**:
```sql
-- For existing deployments (requires exclusive access)
ALTER DATABASE shannon RENAME TO ghostshell;

-- OR create new and migrate
CREATE DATABASE ghostshell;
-- Then restore from shannon backup
```

### 3. Git History Preservation

**Decision**: Use `git mv` for all file movements to preserve history

**Rationale**:
- `git mv` tracks renames, preserving `git log --follow` capability
- Essential for debugging and understanding code evolution
- Small additional effort vs. significant long-term benefit

**Alternatives Considered**:
- **Copy + delete**: Loses history; not recommended
- **Fresh start**: Would lose all contribution history; unacceptable

**Implementation**:
```bash
# Move entire directory while preserving history
git mv src shannon/src
git mv prompts shannon/prompts
git mv configs shannon/configs
git mv web ghostshell
```

### 4. Import Path Updates

**Decision**: Update all relative imports to reflect new structure

**Rationale**:
- TypeScript `paths` aliases minimize breaking changes
- IDE refactoring tools can automate most changes
- Verify with full build after each package migration

**Alternatives Considered**:
- **Path aliases only**: Would hide structural issues; not transparent
- **Symlinks**: Platform-dependent; complicates builds

**Implementation**:
```json
// shannon/tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

### 5. Docker Configuration Updates

**Decision**: Move Dockerfiles into respective packages; update docker-compose at root

**Rationale**:
- Each package owns its container definition
- Root docker-compose orchestrates all services
- Enables independent container builds per package

**Implementation**:
```yaml
# Root docker-compose.yml
services:
  shannon-worker:
    build:
      context: ./shannon
      dockerfile: Dockerfile
  ghostshell:
    build:
      context: ./ghostshell
      dockerfile: Dockerfile
```

### 6. Shared Dependencies

**Decision**: No shared package initially; defer until concrete need emerges

**Rationale**:
- Currently, Shannon and GhostShell have minimal overlap
- GhostShell consumes Shannon's HTTP API (network boundary)
- Adding `shared/` package adds complexity without clear benefit
- Can be added later if type definitions or utilities need sharing

**Alternatives Considered**:
- **Shared types package**: Premature; API contracts are sufficient
- **Monorepo with internal packages**: Over-engineering for current needs

## File Inventory

### Files Moving to `shannon/`

| Current Location | New Location |
|------------------|--------------|
| `src/` | `shannon/src/` |
| `prompts/` | `shannon/prompts/` |
| `configs/` | `shannon/configs/` |
| `docker/` | `shannon/docker/` |
| `Dockerfile` | `shannon/Dockerfile` |
| `tsconfig.json` | `shannon/tsconfig.json` |
| `package.json` | `shannon/package.json` (modified) |
| `mcp-server/` | `shannon/mcp-server/` |

### Files Moving to `ghostshell/`

| Current Location | New Location |
|------------------|--------------|
| `web/` (entire directory) | `ghostshell/` |

### Files Staying at Root

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Full system orchestration |
| `shannon` (CLI script) | Entry point (updated paths) |
| `README.md` | Monorepo documentation |
| `CLAUDE.md` | AI assistant context |
| `.env.example` | Environment template |
| `package.json` | Workspace configuration only |
| `specs/` | Feature specifications |
| `.specify/` | Specify tooling |
| `.github/` | CI/CD workflows |

### Files to Delete (After Migration)

| File | Reason |
|------|--------|
| Root `dist/` | Build output moves to packages |
| Root `node_modules/` | Recreated by workspace install |
| `package-lock.json` | Regenerated after restructure |

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Broken imports after move | Build failures | Run `npm run build` in each package after move; fix incrementally |
| Docker build context issues | Container failures | Test docker builds before merging |
| CI/CD pipeline breaks | Blocked deployments | Update pipelines after local verification |
| Git history confusion | Debugging difficulty | Use `git mv`; document migration in commit message |

## Verification Checklist

- [ ] `cd shannon && npm install && npm run build` succeeds
- [ ] `cd ghostshell && npm install && npm run dev` succeeds
- [ ] Root `docker compose up` starts all services
- [ ] Pentest workflow completes with identical output
- [ ] GhostShell web UI functions correctly
- [ ] Database connects with new `ghostshell` name
- [ ] `git log --follow shannon/src/temporal/workflows.ts` shows full history
