# Data Model: Monorepo File Structure Mapping

**Feature**: 007-monorepo-restructure
**Date**: 2025-01-18

## Overview

This document maps the current repository structure to the target monorepo structure. For a restructure feature, the "data model" is the file system layout.

## Package Boundaries

### Shannon Package (`shannon/`)

**Purpose**: AI-powered penetration testing engine

**Contains**:
- Temporal workflows and activities
- Claude Agent SDK integration
- HTTP API service layer (Fastify)
- Prompt templates and configuration
- MCP server for TOTP generation
- CLI utilities

**Dependencies** (from current package.json):
```
@anthropic-ai/claude-agent-sdk
@temporalio/activity
@temporalio/client
@temporalio/worker
@temporalio/workflow
@fastify/cors
@fastify/helmet
@fastify/rate-limit
@fastify/sensible
@fastify/swagger
@fastify/swagger-ui
@prisma/adapter-pg
@prisma/client
ajv, ajv-formats
boxen, chalk, figlet, gradient-string
dotenv
js-yaml
otpauth
pg
playwright
zod
zx
```

### GhostShell Package (`ghostshell/`)

**Purpose**: Web application for managing pentests and viewing results

**Contains**:
- Next.js App Router application
- React components (auth-config, compliance, dashboard, findings)
- Prisma schema and database access
- Clerk authentication integration
- PDF report generation

**Dependencies** (from current web/package.json):
```
@clerk/nextjs
@prisma/adapter-pg
@prisma/client
@react-pdf/renderer
dotenv
lucide-react
next
pg
react, react-dom
svix
zod
```

## File Movement Map

### Shannon Package Files

| Source | Destination | Notes |
|--------|-------------|-------|
| `src/` | `shannon/src/` | All TypeScript source |
| `src/ai/` | `shannon/src/ai/` | Claude executor, audit logger |
| `src/audit/` | `shannon/src/audit/` | Audit session, metrics tracker |
| `src/cli/` | `shannon/src/cli/` | Input validator, UI |
| `src/phases/` | `shannon/src/phases/` | Pre-recon, reporting |
| `src/prompts/` | `shannon/src/prompts/` | Prompt manager |
| `src/service/` | `shannon/src/service/` | HTTP API (Fastify) |
| `src/temporal/` | `shannon/src/temporal/` | Workflows, activities, worker |
| `prompts/` | `shannon/prompts/` | Prompt templates |
| `configs/` | `shannon/configs/` | Config schema, examples |
| `docker/` | `shannon/docker/` | Docker compose fragments |
| `mcp-server/` | `shannon/mcp-server/` | MCP TOTP server |
| `Dockerfile` | `shannon/Dockerfile` | Shannon container |
| `tsconfig.json` | `shannon/tsconfig.json` | TypeScript config |
| `package.json` | `shannon/package.json` | Modified for package |

### GhostShell Package Files

| Source | Destination | Notes |
|--------|-------------|-------|
| `web/` | `ghostshell/` | Rename entire directory |
| `web/app/` | `ghostshell/app/` | Next.js App Router |
| `web/components/` | `ghostshell/components/` | React components |
| `web/lib/` | `ghostshell/lib/` | Utilities |
| `web/prisma/` | `ghostshell/prisma/` | Schema (DB name update) |
| `web/package.json` | `ghostshell/package.json` | Name: ghostshell |

### Root Level Files

| File | Action | Notes |
|------|--------|-------|
| `package.json` | **Replace** | Workspace config only |
| `docker-compose.yml` | **Update** | New build contexts |
| `shannon` (script) | **Update** | New paths |
| `README.md` | **Update** | Monorepo structure |
| `CLAUDE.md` | **Update** | New paths, commands |
| `.env.example` | **Update** | Combined template |
| `.gitignore` | **Keep** | No changes needed |
| `LICENSE` | **Keep** | No changes needed |

### Files to Remove After Migration

| File | Reason |
|------|--------|
| `dist/` | Build output in packages now |
| `node_modules/` | Reinstall with workspaces |
| `package-lock.json` | Regenerate |

## Database Schema Changes

**Table**: No schema changes required

**Database Name Change**:
- Current: `shannon`
- Target: `ghostshell`

**Affected Files**:
- `ghostshell/prisma/schema.prisma` - datasource url
- `.env.example` - DATABASE_URL template
- `docker-compose.yml` - postgres service environment

**Connection String Pattern**:
```
# Before
postgresql://user:pass@host:5432/shannon

# After
postgresql://user:pass@host:5432/ghostshell
```

## Import Path Updates

### Shannon Package

TypeScript `baseUrl` is `shannon/`, so imports change:

```typescript
// Before (from root)
import { something } from './src/temporal/workflows';

// After (from shannon/)
import { something } from './src/temporal/workflows';
// OR with path alias
import { something } from '@/temporal/workflows';
```

### GhostShell Package

No import path changes needed (directory rename preserves internal structure).

## Workspace Configuration

```json
// Root package.json
{
  "name": "shannon-monorepo",
  "private": true,
  "workspaces": [
    "shannon",
    "ghostshell"
  ],
  "scripts": {
    "build": "npm run build --workspaces",
    "dev:shannon": "npm run dev -w shannon",
    "dev:ghostshell": "npm run dev -w ghostshell"
  }
}
```

## Validation Rules

1. **Package Independence**: Each package must build without the other
2. **No Cross-Imports**: Shannon must not import from GhostShell (or vice versa)
3. **Database Isolation**: Only GhostShell connects to ghostshell database
4. **Git History**: All moves use `git mv` to preserve history
