# Research: Reporting & Compliance

**Feature**: 004-reporting-compliance
**Date**: 2026-01-17
**Status**: Complete

## Research Tasks

1. PDF Generation library for Next.js/React
2. Compliance framework data structure patterns
3. Secure report sharing token patterns
4. Report scheduling with Temporal

---

## 1. PDF Generation Library

### Decision: **@react-pdf/renderer**

### Rationale
- Native React component model - write reports as JSX
- Server-side rendering compatible with Next.js API routes
- No browser/puppeteer dependency (lighter weight, no Chromium)
- Active maintenance and good TypeScript support
- Used successfully in enterprise applications for professional documents

### Alternatives Considered

| Library | Pros | Cons | Verdict |
|---------|------|------|---------|
| @react-pdf/renderer | React components, server-side, no browser deps | Learning curve for styling (not CSS) | ✅ Selected |
| Puppeteer/Playwright | Full CSS support, WYSIWYG | Heavy (needs Chromium), slow, resource intensive | ❌ Rejected - too heavy for SaaS |
| pdfmake | JSON-based, good for tables | Not React-native, custom syntax | ❌ Rejected - different paradigm |
| jsPDF | Simple API | Limited styling, not for complex docs | ❌ Rejected - too basic |
| Prince/WeasyPrint | Production-quality PDF | Commercial license, external dependency | ❌ Rejected - licensing complexity |

### Implementation Notes
```typescript
// Example report generation pattern
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

const ExecutiveReport = ({ scan, findings }) => (
  <Document>
    <Page style={styles.page}>
      <View style={styles.header}>
        <Text>Security Assessment Report</Text>
      </View>
      {/* Report content */}
    </Page>
  </Document>
);

// Generate PDF buffer for storage
const pdfBuffer = await renderToBuffer(<ExecutiveReport scan={scan} findings={findings} />);
```

---

## 2. Compliance Framework Data Structures

### Decision: **Static TypeScript modules with JSON exports**

### Rationale
- Compliance frameworks (OWASP, PCI-DSS) are stable standards that change infrequently
- Type-safe definitions enable IDE autocomplete and compile-time checks
- JSON export allows future migration to database if custom frameworks needed
- Simpler deployment (no database seeding required)

### Data Structure Pattern

```typescript
// lib/compliance/types.ts
interface ComplianceFramework {
  id: string;                    // 'owasp-top-10-2021'
  name: string;                  // 'OWASP Top 10 (2021)'
  version: string;               // '2021'
  description: string;
  categories: ControlCategory[];
}

interface ControlCategory {
  id: string;                    // 'A01'
  name: string;                  // 'Broken Access Control'
  description: string;
  controls: Control[];
}

interface Control {
  id: string;                    // 'A01.01'
  name: string;
  description: string;
  testCriteria: string[];        // What to check
  remediationGuidance: string;
  cweIds: string[];              // Mapped CWEs for auto-mapping
  severity: 'critical' | 'high' | 'medium' | 'low';
}

// Vulnerability to control mapping (for auto-classification)
interface VulnerabilityMapping {
  category: string;              // 'injection', 'xss', etc.
  cweIds: string[];              // CWE patterns
  frameworkMappings: {
    frameworkId: string;
    controlIds: string[];
  }[];
}
```

### Framework Files
```
lib/compliance/frameworks/
├── index.ts                     # Re-exports all frameworks
├── types.ts                     # TypeScript interfaces
├── owasp-top-10-2021.ts        # OWASP Top 10 (2021)
├── pci-dss-4.0.ts              # PCI-DSS v4.0
├── soc2-trust-principles.ts    # SOC 2 Trust Services
└── cis-controls-v8.ts          # CIS Controls v8
```

---

## 3. Secure Report Sharing Tokens

### Decision: **Cryptographically secure tokens with database-tracked expiration**

### Rationale
- URL-safe tokens using `crypto.randomBytes` (32 bytes = 256 bits)
- Base64url encoding for URL compatibility
- Database tracks: token hash, expiration, access count, revocation status
- Token itself not stored (only hash) for security

### Implementation Pattern

```typescript
// lib/sharing/tokens.ts
import { randomBytes, createHash } from 'crypto';

function generateShareToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url'); // 43 chars
  const hash = createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

function verifyShareToken(token: string, storedHash: string): boolean {
  const hash = createHash('sha256').update(token).digest('hex');
  return hash === storedHash;
}

// Share URL format: /reports/share/{token}
// Example: /reports/share/K9xY2mN8pQ3rT6wV1zA4bC7dE0fG5hI-jK_lM
```

### Database Model
```prisma
model ReportShare {
  id          String    @id @default(cuid())
  reportId    String
  tokenHash   String    @unique  // SHA-256 hash of token
  recipientEmail String?         // Optional: who it was shared with
  expiresAt   DateTime           // Default: 7 days from creation
  accessCount Int       @default(0)
  maxAccesses Int?               // Optional limit
  revokedAt   DateTime?          // If manually revoked
  createdAt   DateTime  @default(now())
  createdById String             // Who created the share

  report      Report    @relation(fields: [reportId], references: [id])
}
```

### Access Control Flow
1. User clicks share link → `/reports/share/{token}`
2. Server hashes incoming token, looks up in ReportShare table
3. Validates: not expired, not revoked, within access limit
4. If valid: increment accessCount, log access, return report
5. If invalid: return 404 (don't reveal if token existed)

---

## 4. Report Scheduling with Temporal

### Decision: **Temporal scheduled workflows**

### Rationale
- Temporal has built-in scheduling support via `scheduleWorkflow`
- Crash-safe: schedules survive worker restarts
- Consistent with existing Shannon pentest workflow patterns
- Query support for schedule status

### Implementation Pattern

```typescript
// src/temporal/workflows/scheduled-report.ts
import { proxyActivities, sleep } from '@temporalio/workflow';

export async function scheduledReportWorkflow(input: {
  scheduleId: string;
  organizationId: string;
  projectId: string;
  templateId: string;
  recipients: string[];
  frameworkIds: string[];
}) {
  const activities = proxyActivities<typeof reportActivities>();

  // Find most recent completed scan
  const scan = await activities.findLatestCompletedScan(input.projectId);

  if (!scan) {
    await activities.sendNoScanNotification(input.recipients, input.projectId);
    return { status: 'skipped', reason: 'no_recent_scan' };
  }

  // Generate report
  const report = await activities.generateReport({
    scanId: scan.id,
    templateId: input.templateId,
    frameworkIds: input.frameworkIds,
  });

  // Send to recipients
  await activities.sendReportEmail({
    reportId: report.id,
    recipients: input.recipients,
  });

  return { status: 'completed', reportId: report.id };
}
```

### Schedule Management
- Schedules stored in Prisma (ReportSchedule model) for UI display
- Temporal schedule ID linked to database record
- Pause/resume via Temporal client SDK
- Cron expression support for flexible scheduling

---

## Summary of Decisions

| Topic | Decision | Key Dependency |
|-------|----------|----------------|
| PDF Generation | @react-pdf/renderer | `npm install @react-pdf/renderer` |
| Compliance Data | Static TypeScript modules | None (built-in) |
| Share Tokens | SHA-256 hashed, DB-tracked | `crypto` (Node.js built-in) |
| Scheduling | Temporal scheduled workflows | Existing Temporal infrastructure |

## Open Questions (None)

All NEEDS CLARIFICATION items from Technical Context have been resolved.
