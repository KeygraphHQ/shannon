# Quickstart: Shannon Service

**Feature**: 005-shannon-service
**Date**: 2026-01-18

## Overview

This guide helps developers get the Shannon Service running locally and integrate it with the web application.

## Prerequisites

- Node.js 22+
- Docker & Docker Compose
- PostgreSQL (via Docker or local)
- Temporal Server (via Docker)

## Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│    Web App      │      │ Shannon Service │      │   Temporal      │
│   (Next.js)     │─────►│   (Fastify)     │─────►│    Server       │
│   :3000         │      │   :3001         │      │   :7233         │
└─────────────────┘      └─────────────────┘      └─────────────────┘
         │                       │                        │
         └───────────────────────┼────────────────────────┘
                                 ▼
                        ┌─────────────────┐
                        │   PostgreSQL    │
                        │   :5432         │
                        └─────────────────┘
```

## Quick Start

### 1. Start Infrastructure

```bash
# From repository root
# Start Temporal and PostgreSQL
docker compose up -d

# Verify services are running
docker compose ps
```

### 2. Database Setup

```bash
# Navigate to web directory
cd web

# Install dependencies
npm install

# Run Prisma migrations (includes APIKey model)
npx prisma migrate dev

# Generate Prisma client
npx prisma generate
```

### 3. Start Shannon Service

```bash
# From repository root
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start service (separate terminal)
npm run service:start
# OR for development with hot reload:
npm run service:dev
```

The service will be available at `http://localhost:3001`.

### 4. Create an API Key

For local development, create a test API key directly in the database:

```bash
# Using Prisma Studio
cd web && npx prisma studio

# Navigate to APIKey table and create:
# - organizationId: (your org ID from Organization table)
# - name: "Local Development"
# - keyPrefix: "sk_test_"
# - keyHash: (SHA-256 hash of your test key)
# - scopes: ["scan:read", "scan:write", "auth:validate", "config:read"]
```

Or generate programmatically:

```typescript
// scripts/create-api-key.ts
import { createHash, randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createApiKey(organizationId: string, name: string) {
  const key = `sk_test_${organizationId.slice(0, 8)}_${randomBytes(16).toString('hex')}`;
  const keyHash = createHash('sha256').update(key).digest('hex');
  const keyPrefix = key.slice(0, 8);

  await prisma.aPIKey.create({
    data: {
      organizationId,
      name,
      keyPrefix,
      keyHash,
      scopes: ['scan:read', 'scan:write', 'auth:validate', 'config:read'],
      createdBy: 'system',
    },
  });

  console.log('API Key created:', key);
  console.log('⚠️  Store this key securely - it cannot be retrieved later');
  return key;
}
```

### 5. Test the Service

```bash
# Health check (no auth required)
curl http://localhost:3001/health

# Service info
curl http://localhost:3001/api/v1/info

# Authenticated request (requires API key)
curl -H "Authorization: Bearer sk_test_xxx" \
  http://localhost:3001/api/v1/config/phases
```

## Environment Variables

Create `.env` in the repository root:

```bash
# Shannon Service
SERVICE_PORT=3001
SERVICE_HOST=0.0.0.0

# Database (shared with web app)
DATABASE_URL=postgresql://postgres:password@localhost:5432/shannon

# Temporal
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default

# Rate Limiting (optional)
REDIS_URL=redis://localhost:6379

# Anthropic (for scan execution)
ANTHROPIC_API_KEY=sk-ant-xxx

# Logging
LOG_LEVEL=debug
LOG_FORMAT=pretty
```

## Web App Integration

### Configure API Client

```typescript
// web/lib/shannon-client.ts
const SHANNON_SERVICE_URL = process.env.SHANNON_SERVICE_URL || 'http://localhost:3001';
const SHANNON_API_KEY = process.env.SHANNON_API_KEY;

export async function startScan(targetUrl: string, config?: ScanConfig) {
  const response = await fetch(`${SHANNON_SERVICE_URL}/api/v1/scans`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SHANNON_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ targetUrl, config }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to start scan');
  }

  return response.json();
}

export async function getScanProgress(scanId: string) {
  const response = await fetch(`${SHANNON_SERVICE_URL}/api/v1/scans/${scanId}/progress`, {
    headers: {
      'Authorization': `Bearer ${SHANNON_API_KEY}`,
    },
  });

  return response.json();
}
```

### Environment Setup for Web App

Add to `web/.env.local`:

```bash
# Shannon Service Integration
SHANNON_SERVICE_URL=http://localhost:3001
SHANNON_API_KEY=sk_test_xxx  # Your generated API key
```

## Development Workflow

### Running Tests

```bash
# Unit tests
npm run test:unit

# Integration tests (requires running services)
npm run test:integration

# Contract tests (validates OpenAPI spec)
npm run test:contracts
```

### Viewing API Documentation

```bash
# Start service with Swagger UI enabled
npm run service:dev

# Open in browser
open http://localhost:3001/docs
```

### Monitoring

```bash
# Prometheus metrics
curl http://localhost:3001/metrics

# Temporal Web UI
open http://localhost:8233
```

## Troubleshooting

### Service won't start

1. Check Temporal is running: `docker compose ps`
2. Check database connection: `npx prisma db push`
3. Check logs: `npm run service:dev` shows detailed output

### API returns 401 Unauthorized

1. Verify API key format: `Bearer sk_test_xxx`
2. Check key exists in database and is not revoked
3. Verify key scopes include required permissions

### Scan stuck in QUEUED

1. Check Temporal worker is running
2. Check Temporal Web UI for workflow status
3. Verify Anthropic API key is set

### Rate limiting too aggressive

Adjust in `.env`:
```bash
RATE_LIMIT_MAX=10000
RATE_LIMIT_WINDOW=3600
```

## Next Steps

1. **Read the API contracts**: [contracts/openapi.yaml](contracts/openapi.yaml)
2. **Understand the data model**: [data-model.md](data-model.md)
3. **Review implementation plan**: [plan.md](plan.md)
4. **Check tasks**: [tasks.md](tasks.md) (after running `/speckit.tasks`)
