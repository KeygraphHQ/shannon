# Quickstart: Running Security Scans

**Feature**: 002-security-scans
**Date**: 2026-01-17

## Prerequisites

Before implementing this feature, ensure you have:

1. **Local Development Environment**
   - Node.js 20+ installed
   - PostgreSQL 15+ running locally
   - Docker (for Temporal)

2. **Repository Setup**
   ```bash
   cd web
   npm install
   cp .env.example .env.local
   ```

3. **Temporal Server Running**
   ```bash
   # From repository root
   docker compose up -d temporal
   ```

4. **Environment Variables**
   Add to `web/.env.local`:
   ```env
   # Existing
   DATABASE_URL="postgresql://..."
   CLERK_SECRET_KEY="sk_..."

   # New for this feature
   ENCRYPTION_MASTER_KEY="<64-char-hex>"  # Generate: openssl rand -hex 32
   TEMPORAL_ADDRESS="localhost:7233"
   GITHUB_APP_ID="..."
   GITHUB_APP_PRIVATE_KEY="..."
   GITHUB_WEBHOOK_SECRET="..."
   ```

## Implementation Order

Follow the user stories in priority order (P1 → P5):

### Phase 1: Quick Scan (P1) - Foundation

**Goal**: Users can start a scan with just a URL and see real-time progress.

1. **Database Schema** (1-2 hours)
   ```bash
   # Add models to prisma/schema.prisma:
   # - Project
   # - Scan
   # - ScanResult

   npx prisma migrate dev --name add-scan-models
   ```

2. **API Routes** (2-3 hours)
   - `POST /api/scans` - Start scan
   - `GET /api/scans` - List scans
   - `GET /api/scans/[scanId]` - Scan details
   - `DELETE /api/scans/[scanId]` - Cancel scan
   - `GET /api/scans/[scanId]/progress` - SSE progress stream

3. **Temporal Integration** (2-3 hours)
   - Create `web/lib/temporal/client.ts` - Temporal client for web app
   - Modify existing workflow to accept web-initiated scans
   - Implement progress query handler

4. **UI Components** (3-4 hours)
   - `components/scans/start-scan-form.tsx` - Quick scan form
   - `components/scans/scan-progress.tsx` - Real-time progress display
   - `app/(dashboard)/scans/page.tsx` - Scan list page
   - `app/(dashboard)/scans/[scanId]/page.tsx` - Scan detail page

5. **Server Actions** (1-2 hours)
   - `lib/actions/scans.ts` - Scan CRUD operations

**Verification**:
- [ ] Can start scan with URL only
- [ ] Progress updates appear every 5 seconds
- [ ] Can cancel running scan
- [ ] Partial results saved on cancellation

---

### Phase 2: Authenticated Testing (P2)

**Goal**: Users can configure authentication for their projects.

1. **Database Schema** (1 hour)
   ```bash
   # Add AuthenticationConfig model
   npx prisma migrate dev --name add-auth-config
   ```

2. **Encryption Utility** (1-2 hours)
   - Create `lib/encryption.ts` - AES-256-GCM with org keys
   - Unit tests for encrypt/decrypt

3. **API Routes** (1-2 hours)
   - `GET/PUT/DELETE /api/projects/[projectId]/auth`
   - `POST /api/projects/[projectId]/auth/validate`

4. **UI Components** (3-4 hours)
   - `components/auth-config/auth-method-selector.tsx`
   - `components/auth-config/form-auth-config.tsx`
   - `components/auth-config/api-token-config.tsx`
   - `components/auth-config/basic-auth-config.tsx`
   - `components/auth-config/totp-config.tsx`

5. **Validation Activity** (2-3 hours)
   - Create Temporal activity for auth validation
   - Use Playwright for form-based validation

**Verification**:
- [ ] Can configure form login with selectors
- [ ] Can test credentials before scan
- [ ] Error messages are specific (not generic)
- [ ] TOTP codes generated correctly

---

### Phase 3: Scan History (P3)

**Goal**: Users can view and filter scan history.

1. **API Enhancements** (1-2 hours)
   - Add filtering to `GET /api/scans`
   - Add pagination (cursor-based)

2. **UI Components** (2-3 hours)
   - `components/scans/scan-history-table.tsx` - Filterable table
   - `components/scans/scan-detail-card.tsx` - Summary card
   - Filter controls (status, date range)

**Verification**:
- [ ] Scans sorted by date (newest first)
- [ ] Filters work correctly
- [ ] Pagination loads smoothly

---

### Phase 4: Scheduled Scans (P4)

**Goal**: Users can configure recurring scans.

1. **Database Schema** (1 hour)
   ```bash
   # Add ScanSchedule model
   npx prisma migrate dev --name add-schedules
   ```

2. **Temporal Schedules** (2-3 hours)
   - Create schedule management utilities
   - Integrate with Temporal Schedules API

3. **API Routes** (1-2 hours)
   - `GET/POST /api/projects/[projectId]/schedules`
   - `PATCH/DELETE /api/projects/[projectId]/schedules/[scheduleId]`
   - `POST .../pause` and `.../resume`

4. **UI Components** (2-3 hours)
   - `components/schedules/schedule-form.tsx`
   - `components/schedules/schedule-list.tsx`
   - Cron expression builder

5. **Email Notifications** (1-2 hours)
   - Scan completion notification template
   - Integration with existing email service

**Verification**:
- [ ] Daily/weekly presets work
- [ ] Custom cron expressions accepted
- [ ] Pause/resume functions correctly
- [ ] Emails sent on completion

---

### Phase 5: GitHub CI/CD (P5)

**Goal**: PRs automatically trigger scans with blocking.

1. **GitHub App Setup** (1-2 hours)
   - Create GitHub App in settings
   - Configure webhook URL
   - Set required permissions

2. **Database Schema** (1 hour)
   ```bash
   # Add CICDIntegration model
   npx prisma migrate dev --name add-cicd-integration
   ```

3. **Webhook Handler** (2-3 hours)
   - `app/api/integrations/github/webhook/route.ts`
   - Signature verification
   - PR event processing

4. **GitHub API Client** (2-3 hours)
   - Create `lib/github.ts`
   - Post PR comments
   - Update check status

5. **UI Components** (2-3 hours)
   - `app/(dashboard)/integrations/github/page.tsx`
   - Repository selector
   - Settings configuration

**Verification**:
- [ ] Setup completes in <5 minutes
- [ ] PR scan triggers automatically
- [ ] Results appear as PR comment
- [ ] Override with justification works

---

## Key Patterns

### Multi-Tenant Queries

Always scope queries by `organizationId`:

```typescript
// lib/actions/scans.ts
export async function listScans(orgId: string) {
  return db.scan.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: 'desc' },
  });
}
```

### SSE Progress Stream

```typescript
// app/api/scans/[scanId]/progress/route.ts
export async function GET(req: Request, { params }: { params: { scanId: string } }) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const interval = setInterval(async () => {
        const progress = await getWorkflowProgress(params.scanId);
        send(progress);

        if (progress.status !== 'running') {
          clearInterval(interval);
          controller.close();
        }
      }, 2000);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

### Credential Encryption

```typescript
// lib/encryption.ts
import { createCipheriv, createDecipheriv, randomBytes, createHmac } from 'crypto';

const MASTER_KEY = Buffer.from(process.env.ENCRYPTION_MASTER_KEY!, 'hex');

function deriveOrgKey(orgId: string): Buffer {
  return createHmac('sha256', MASTER_KEY).update(`org-key:${orgId}`).digest();
}

export function encryptCredential(plaintext: string, orgId: string): string {
  const key = deriveOrgKey(orgId);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}
```

### Temporal Workflow Query

```typescript
// lib/temporal/client.ts
import { Client, Connection } from '@temporalio/client';

let client: Client | null = null;

export async function getTemporalClient(): Promise<Client> {
  if (!client) {
    const connection = await Connection.connect({
      address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
    });
    client = new Client({ connection });
  }
  return client;
}

export async function getWorkflowProgress(scanId: string) {
  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(scanId);
  return handle.query('getProgress');
}
```

---

## Testing

### Unit Tests

```bash
# Run unit tests
npm test

# Run specific test file
npm test -- lib/encryption.test.ts
```

### Integration Tests

```bash
# Run with test database
DATABASE_URL="postgresql://test:test@localhost:5432/shannon_test" npm run test:integration
```

### E2E Tests

```bash
# Run Playwright tests
npm run test:e2e
```

---

## Common Issues

### "Temporal connection refused"
- Ensure Docker containers are running: `docker compose ps`
- Check Temporal address in `.env.local`

### "Encryption key invalid"
- Master key must be exactly 64 hex characters (32 bytes)
- Generate new key: `openssl rand -hex 32`

### "GitHub webhook not received"
- Use ngrok for local development: `ngrok http 3000`
- Update webhook URL in GitHub App settings

### "Scan stuck in PENDING"
- Check concurrent scan limit (3 per org default)
- Verify Temporal worker is running

---

## Next Steps

After implementing all phases:

1. Run `/speckit.tasks` to generate detailed task breakdown
2. Create GitHub issues from tasks
3. Begin implementation following priority order
