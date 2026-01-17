# Research: Running Security Scans

**Feature**: 002-security-scans
**Date**: 2026-01-17
**Status**: Complete

## Research Topics

### 1. Real-Time Progress Updates in Next.js

**Question**: What is the best approach for real-time scan progress updates in Next.js App Router?

**Decision**: Server-Sent Events (SSE) via Next.js Route Handlers

**Rationale**:
- SSE is simpler than WebSocket for unidirectional updates (server → client)
- Native browser support, no additional client libraries needed
- Works with Next.js Edge Runtime for better scalability
- Automatic reconnection built into EventSource API
- Lower overhead than WebSocket for one-way data flow

**Alternatives Considered**:
| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| WebSocket | Bidirectional, lower latency | More complex, requires ws server | Overkill for read-only progress updates |
| Polling | Simple to implement | Higher server load, delayed updates | 5-second polling creates 12 req/min per scan |
| Pusher/Ably | Managed service, reliable | Cost, external dependency | Adds complexity, constitution prefers simplicity |

**Implementation Pattern**:
```typescript
// Route handler: app/api/scans/[scanId]/progress/route.ts
export async function GET(req: Request, { params }: { params: { scanId: string } }) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Poll Temporal workflow query every 2 seconds
      const interval = setInterval(async () => {
        const progress = await getWorkflowProgress(params.scanId);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(progress)}\n\n`));
        if (progress.status !== 'running') {
          clearInterval(interval);
          controller.close();
        }
      }, 2000);
    }
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

---

### 2. Credential Encryption with Organization-Specific Keys

**Question**: How should authentication credentials be encrypted at rest using organization-specific keys?

**Decision**: AES-256-GCM encryption with organization-derived keys from a master key

**Rationale**:
- AES-256-GCM provides authenticated encryption (confidentiality + integrity)
- Organization-specific keys derived via HKDF from master key
- Master key stored in environment variable (production: AWS Secrets Manager)
- No need for separate key storage - keys derived deterministically
- Constitution requires AES-256 at rest (Principle I)

**Alternatives Considered**:
| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Per-org keys in DB | True isolation | Key management complexity, key rotation harder | Over-engineered for MVP |
| AWS KMS per org | Hardware security | Cost ($1/key/month), latency | Cost prohibitive at scale |
| HashiCorp Vault | Enterprise-grade | Operational complexity | Constitution: simplicity over complexity |

**Implementation Pattern**:
```typescript
// lib/encryption.ts
import { createCipheriv, createDecipheriv, randomBytes, createHmac } from 'crypto';

const MASTER_KEY = Buffer.from(process.env.ENCRYPTION_MASTER_KEY!, 'hex');

function deriveOrgKey(orgId: string): Buffer {
  // HKDF-like derivation using HMAC-SHA256
  return createHmac('sha256', MASTER_KEY)
    .update(`org-key:${orgId}`)
    .digest();
}

export function encryptCredential(plaintext: string, orgId: string): string {
  const key = deriveOrgKey(orgId);
  const iv = randomBytes(12); // GCM uses 12-byte IV
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv:authTag:ciphertext (all base64)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptCredential(encrypted: string, orgId: string): string {
  const [ivB64, tagB64, dataB64] = encrypted.split(':');
  const key = deriveOrgKey(orgId);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return decipher.update(Buffer.from(dataB64, 'base64')) + decipher.final('utf8');
}
```

---

### 3. Temporal Workflow Scheduling Patterns

**Question**: How should scheduled scans be implemented with Temporal?

**Decision**: Temporal Schedules API (native scheduling feature)

**Rationale**:
- Temporal Schedules is purpose-built for recurring workflows
- Handles timezone, cron expressions, and overlap policies
- Integrates seamlessly with existing workflow infrastructure
- Pausing/resuming is a built-in feature
- Constitution: Temporal-First Orchestration (Principle IV)

**Alternatives Considered**:
| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| External cron (node-cron) | Simple to understand | No durability, single point of failure | Constitution requires Temporal for orchestration |
| Database polling | Works with any DB | Complexity, reliability concerns | Not Temporal-first |
| AWS EventBridge | Managed, scalable | External dependency, not Temporal-native | Violates Temporal-first principle |

**Implementation Pattern**:
```typescript
// Creating a schedule
import { Client, ScheduleOverlapPolicy } from '@temporalio/client';

async function createScanSchedule(orgId: string, projectId: string, cronExpression: string) {
  const client = new Client();
  const scheduleId = `scan-schedule-${orgId}-${projectId}`;

  await client.schedule.create({
    scheduleId,
    spec: {
      cronExpressions: [cronExpression], // e.g., "0 0 * * 1" for weekly Monday
    },
    action: {
      type: 'startWorkflow',
      workflowType: 'pentestPipelineWorkflow',
      workflowId: `scheduled-scan-${projectId}-${Date.now()}`,
      taskQueue: 'shannon-pipeline',
      args: [{ orgId, projectId, source: 'scheduled' }],
    },
    policies: {
      overlap: ScheduleOverlapPolicy.SKIP, // Skip if previous scan still running
    },
  });
}

// Pause/resume schedule
await client.schedule.getHandle(scheduleId).pause();
await client.schedule.getHandle(scheduleId).unpause();
```

---

### 4. GitHub Actions Integration Pattern

**Question**: How should the GitHub Actions integration be implemented for PR scanning?

**Decision**: GitHub App with webhook-triggered scans

**Rationale**:
- GitHub Apps have higher rate limits than OAuth tokens
- Webhook events provide real-time PR notifications
- Can post check runs and PR comments programmatically
- Installation-based auth scopes are more secure
- Aligns with success criteria: install in <5 minutes

**Alternatives Considered**:
| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| OAuth App | Simpler setup | Lower rate limits, user-scoped tokens | Scale concerns, security |
| Personal Access Token | Simplest | Security risk, no granular permissions | Not suitable for SaaS |
| GitHub Actions as trigger | Native CI/CD | Requires workflow file in user repo | More friction for users |

**Implementation Pattern**:
```typescript
// Webhook handler: app/api/integrations/github/webhook/route.ts
import { Webhooks } from '@octokit/webhooks';
import { createAppAuth } from '@octokit/auth-app';

const webhooks = new Webhooks({ secret: process.env.GITHUB_WEBHOOK_SECRET! });

webhooks.on('pull_request.opened', async ({ payload }) => {
  const { installation, repository, pull_request } = payload;

  // Find matching Shannon project
  const integration = await db.cICDIntegration.findFirst({
    where: {
      provider: 'github',
      repositoryFullName: repository.full_name,
    },
  });

  if (!integration) return;

  // Start scan workflow
  await startScanWorkflow({
    projectId: integration.projectId,
    source: 'github_pr',
    metadata: {
      prNumber: pull_request.number,
      prUrl: pull_request.html_url,
      headSha: pull_request.head.sha,
      installationId: installation.id,
    },
  });
});

// Post results as PR comment
async function postPRComment(installationId: number, repo: string, prNumber: number, summary: string) {
  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: process.env.GITHUB_APP_ID,
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
      installationId,
    },
  });

  await octokit.issues.createComment({
    owner: repo.split('/')[0],
    repo: repo.split('/')[1],
    issue_number: prNumber,
    body: summary,
  });
}
```

---

### 5. Multi-Tenant Scan Queue Management

**Question**: How should concurrent scan limits and queuing be implemented?

**Decision**: Temporal workflow with semaphore pattern using signals

**Rationale**:
- Temporal provides durable execution for queue management
- Signals allow dynamic concurrency control
- Workflow queries expose queue depth for UI
- No external queue service needed (Redis, SQS)
- Constitution: Temporal-First, Simplicity

**Alternatives Considered**:
| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Redis semaphore | Fast, well-understood | External dependency, not Temporal-native | Constitution: Temporal-first |
| Database locks | Simple | Performance at scale, deadlock risk | Not durable |
| SQS FIFO queue | AWS-native, ordered | External service, cost | Over-engineered |

**Implementation Pattern**:
```typescript
// Org concurrency workflow
import { defineSignal, setHandler, condition } from '@temporalio/workflow';

const releaseSlotSignal = defineSignal<[string]>('releaseSlot');

export async function orgConcurrencyWorkflow(orgId: string, maxConcurrent: number) {
  const activeScans = new Set<string>();
  const waitingScans: string[] = [];

  setHandler(releaseSlotSignal, (scanId: string) => {
    activeScans.delete(scanId);
  });

  // Query for UI
  setHandler(getQueueDepthQuery, () => ({
    active: activeScans.size,
    waiting: waitingScans.length,
    maxConcurrent,
  }));

  while (true) {
    // Wait for slot availability
    await condition(() => activeScans.size < maxConcurrent && waitingScans.length > 0);

    const nextScanId = waitingScans.shift()!;
    activeScans.add(nextScanId);

    // Signal the waiting scan to proceed
    await signalWorkflow(nextScanId, 'proceed');
  }
}

// In scan start logic
async function acquireScanSlot(orgId: string, scanId: string): Promise<void> {
  // Add to org queue
  await signalWorkflow(`org-queue-${orgId}`, 'requestSlot', scanId);
  // Wait for proceed signal
  await condition(() => hasReceivedProceedSignal);
}
```

---

### 6. Authentication Validation Before Scan

**Question**: How should authentication credentials be validated before starting a scan?

**Decision**: Lightweight validation activity using Playwright in a Temporal workflow

**Rationale**:
- Uses existing Playwright MCP infrastructure
- Can test actual login flow without full scan
- Returns specific error messages for different failure modes
- Validation as Temporal activity provides durability
- Timeout: 30 seconds for validation attempt

**Implementation Pattern**:
```typescript
// Validation activity
export async function validateAuthentication(config: AuthConfig): Promise<ValidationResult> {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto(config.targetUrl);

    switch (config.method) {
      case 'form':
        await page.fill(config.usernameSelector, config.username);
        await page.fill(config.passwordSelector, config.password);
        if (config.totpSecret) {
          const totp = generateTOTP(config.totpSecret);
          await page.fill(config.totpSelector, totp);
        }
        await page.click(config.submitSelector);
        // Check for success indicator
        const success = await page.waitForSelector(config.successSelector, { timeout: 10000 });
        return { valid: true };

      case 'api_token':
        const response = await fetch(config.validationEndpoint, {
          headers: { 'Authorization': `Bearer ${config.token}` },
        });
        return { valid: response.ok, error: response.ok ? undefined : 'Invalid API token' };

      case 'basic':
        const authResponse = await fetch(config.targetUrl, {
          headers: { 'Authorization': `Basic ${btoa(`${config.username}:${config.password}`)}` },
        });
        return { valid: authResponse.ok, error: authResponse.ok ? undefined : 'Invalid credentials' };
    }
  } catch (error) {
    return { valid: false, error: error.message };
  } finally {
    await browser.close();
  }
}
```

---

### 7. PDF Report Generation

**Question**: How should scan reports be exported to PDF format?

**Decision**: Puppeteer + Marked for markdown-to-PDF conversion

**Rationale**:
- Shannon already generates markdown reports via Claude Agent SDK pipeline
- Puppeteer renders HTML with full CSS support for professional PDFs
- Server-side only (no React rendering overhead)
- Perfect for complex layouts with severity color coding

**Alternatives Considered**:
| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| PDFKit | Lightweight | Programmatic drawing, not markdown-friendly | Poor fit for existing markdown reports |
| React-PDF | React component model | Limited CSS support | Learning curve, CSS constraints |
| jsPDF | Simple API | Basic styling only | Insufficient for complex reports |

**Implementation Pattern**:
```typescript
// GET /api/scans/[scanId]/export?format=pdf
import puppeteer from 'puppeteer';
import { marked } from 'marked';

export async function generatePdf(scanId: string) {
  const markdown = await fetchReportFromStorage(scanId);
  const html = createReportTemplate(await marked(markdown));

  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({ format: 'A4', margin: { top: 20, bottom: 20 } });
  await browser.close();
  return pdf;
}
```

**Dependencies**:
```json
{
  "puppeteer": "^22.0.0",
  "marked": "^12.0.0",
  "sanitize-html": "^2.11.0"
}
```

---

### 8. JSON Export Format (SARIF)

**Question**: What format should be used for machine-readable JSON exports?

**Decision**: SARIF (Static Analysis Results Interchange Format) v2.1.0

**Rationale**:
- Industry standard for security findings
- GitHub Code Scanning compatible (direct import)
- Rich metadata support (CWE, severity levels, locations)
- Future-proof for integrations with other security tools

**SARIF Structure**:
```json
{
  "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
  "version": "2.1.0",
  "runs": [{
    "tool": {
      "driver": {
        "name": "Shannon",
        "version": "1.0.0",
        "informationUri": "https://shannon.security"
      }
    },
    "results": [{
      "ruleId": "sql-injection",
      "level": "error",
      "message": { "text": "SQL injection vulnerability found" },
      "locations": [{
        "physicalLocation": {
          "artifactLocation": { "uri": "src/api/users.ts" },
          "region": { "startLine": 42 }
        }
      }]
    }]
  }]
}
```

---

### 9. Email Notifications

**Question**: How should email notifications be implemented for scan completion?

**Decision**: Resend for transactional email delivery

**Rationale**:
- Simple API, excellent developer experience
- React Email for templating (consistent with Next.js stack)
- Generous free tier (3,000 emails/month)
- Good deliverability for transactional emails

**Dependencies**:
```json
{
  "resend": "^3.0.0",
  "@react-email/components": "^0.0.15"
}
```

**Email Types**:
| Event | Template | Recipient |
|-------|----------|-----------|
| Scan complete | `scan-complete.tsx` | Project owner |
| Scan failed | `scan-failed.tsx` | Project owner |
| Schedule enabled | `schedule-enabled.tsx` | Project owner |

---

## Summary of Decisions

| Topic | Decision | Key Benefit |
|-------|----------|-------------|
| Real-time updates | Server-Sent Events (SSE) | Simple, native browser support, one-way data flow |
| Credential encryption | AES-256-GCM with org-derived keys | Security + simplicity, no key storage needed |
| Scan scheduling | Temporal Schedules API | Native, durable, pause/resume built-in |
| GitHub integration | GitHub App + webhooks | Higher rate limits, installation-scoped auth |
| Scan queue | Temporal semaphore workflow | Durable, no external queue service |
| Auth validation | Playwright activity | Reuses existing infrastructure |
| PDF export | Puppeteer + Marked | Professional output, CSS support, server-side |
| JSON export | SARIF v2.1.0 | Industry standard, GitHub compatible |
| Email notifications | Resend | Simple API, React Email templates |

## Open Questions Resolved

All NEEDS CLARIFICATION items from Technical Context have been resolved:
- Testing framework: Jest/Vitest with Playwright for E2E
- Real-time mechanism: SSE (not WebSocket)
- Queue implementation: Temporal-native (not Redis/SQS)

## Next Steps

Proceed to Phase 1: Design & Contracts
- Generate data-model.md with Prisma schema extensions
- Generate API contracts in OpenAPI format
- Generate quickstart.md for developer onboarding
