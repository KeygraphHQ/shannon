# Quickstart: Monorepo Migration Guide

**Feature**: 007-monorepo-restructure
**Date**: 2025-01-18

## Prerequisites

- Node.js 20+
- npm 9+ (for workspaces support)
- Git
- Docker (for testing full deployment)

## Migration Steps

### Step 1: Create Shannon Package Structure

```bash
# Create shannon directory
mkdir -p shannon

# Move Shannon core files (preserving git history)
git mv src shannon/
git mv prompts shannon/
git mv configs shannon/
git mv docker shannon/
git mv mcp-server shannon/
git mv Dockerfile shannon/
git mv tsconfig.json shannon/
```

### Step 2: Create Shannon package.json

Create `shannon/package.json`:

```json
{
  "name": "shannon",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "temporal:server": "docker compose -f docker/docker-compose.temporal.yml up temporal -d",
    "temporal:server:stop": "docker compose -f docker/docker-compose.temporal.yml down",
    "temporal:worker": "node dist/temporal/worker.js",
    "temporal:start": "node dist/temporal/client.js",
    "temporal:query": "node dist/temporal/query.js",
    "service:start": "node dist/service/index.js",
    "service:dev": "node --watch dist/service/index.js",
    "test:service": "vitest run --dir src/service",
    "test:service:watch": "vitest --dir src/service"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.1.0",
    "@fastify/cors": "^11.2.0",
    "@fastify/helmet": "^13.0.2",
    "@fastify/rate-limit": "^10.3.0",
    "@fastify/sensible": "^6.0.4",
    "@fastify/swagger": "^9.6.1",
    "@fastify/swagger-ui": "^5.2.4",
    "@prisma/adapter-pg": "^7.2.0",
    "@prisma/client": "^7.2.0",
    "@temporalio/activity": "^1.11.0",
    "@temporalio/client": "^1.11.0",
    "@temporalio/worker": "^1.11.0",
    "@temporalio/workflow": "^1.11.0",
    "ajv": "^8.12.0",
    "ajv-formats": "^2.1.1",
    "boxen": "^8.0.1",
    "chalk": "^5.0.0",
    "dotenv": "^16.4.5",
    "fastify": "^5.7.1",
    "figlet": "^1.9.3",
    "gradient-string": "^3.0.0",
    "js-yaml": "^4.1.0",
    "otpauth": "^9.4.1",
    "pg": "^8.17.1",
    "playwright": "^1.57.0",
    "zod": "^3.22.4",
    "zx": "^8.0.0"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^25.0.3",
    "@types/pg": "^8.16.0",
    "typescript": "^5.9.3",
    "vitest": "^4.0.17"
  }
}
```

### Step 3: Verify Shannon Builds

```bash
cd shannon
npm install
npm run build
cd ..
```

### Step 4: Rename Web to GhostShell

```bash
# Rename web directory to ghostshell
git mv web ghostshell
```

### Step 5: Update GhostShell package.json

Edit `ghostshell/package.json`:

```json
{
  "name": "ghostshell",
  "version": "0.1.0",
  // ... rest unchanged
}
```

### Step 6: Update Database Name

Edit `ghostshell/prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")  // Will use ghostshell DB
}
```

### Step 7: Verify GhostShell Builds

```bash
cd ghostshell
npm install
npm run build
cd ..
```

### Step 8: Create Root package.json

Replace root `package.json`:

```json
{
  "name": "shannon-monorepo",
  "private": true,
  "workspaces": [
    "shannon",
    "ghostshell"
  ],
  "scripts": {
    "build": "npm run build --workspaces",
    "build:shannon": "npm run build -w shannon",
    "build:ghostshell": "npm run build -w ghostshell",
    "dev:shannon": "npm run service:dev -w shannon",
    "dev:ghostshell": "npm run dev -w ghostshell"
  }
}
```

### Step 9: Update docker-compose.yml

```yaml
services:
  temporal:
    # ... unchanged

  shannon-worker:
    build:
      context: ./shannon
      dockerfile: Dockerfile
    # ... rest updated for new paths

  ghostshell:
    build:
      context: ./ghostshell
      dockerfile: Dockerfile
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/ghostshell
    # ... rest unchanged

  postgres:
    environment:
      POSTGRES_DB: ghostshell  # Changed from shannon
```

### Step 10: Update shannon CLI Script

Update the `shannon` script at root to reference new paths:

```bash
# Update any references to src/ to shannon/src/
# Update any references to dist/ to shannon/dist/
```

### Step 11: Clean Up Root

```bash
# Remove old build artifacts (they're now in packages)
rm -rf dist/
rm -rf node_modules/
rm package-lock.json

# Install fresh with workspaces
npm install
```

### Step 12: Update Documentation

Update `README.md` and `CLAUDE.md` to reflect:
- New directory structure
- Updated commands (e.g., `npm run build:shannon`)
- GhostShell naming

## Verification

### Test Shannon Independence

```bash
cd shannon
npm install
npm run build
npm run test:service
```

### Test GhostShell Independence

```bash
cd ghostshell
npm install
npm run build
npm run dev  # Should start on localhost:3000
```

### Test Full System

```bash
# From root
docker compose up -d
./shannon start URL=https://example.com REPO=/path/to/repo
```

### Verify Git History

```bash
# Should show full history
git log --follow shannon/src/temporal/workflows.ts
git log --follow ghostshell/app/page.tsx
```

## Rollback Plan

If migration fails:

```bash
# Reset to pre-migration state
git checkout main -- .
git clean -fd
npm install
```

## Post-Migration Checklist

- [ ] Shannon builds independently
- [ ] GhostShell builds independently
- [ ] Root workspace installs both
- [ ] Docker compose starts all services
- [ ] Pentest workflow completes successfully
- [ ] Web UI accessible and functional
- [ ] Database uses `ghostshell` name
- [ ] Git history preserved for all files
- [ ] README.md updated
- [ ] CLAUDE.md updated
- [ ] CI/CD pipelines updated (separate PR)
