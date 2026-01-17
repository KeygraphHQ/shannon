# Quickstart: Reporting & Compliance

**Feature**: 004-reporting-compliance
**Date**: 2026-01-17

## Prerequisites

- Node.js 20+
- PostgreSQL running (via Docker or local)
- Existing Shannon web app setup (`web/` directory)
- Completed scan with findings (for testing)

## Setup Steps

### 1. Install Dependencies

```bash
cd web
npm install @react-pdf/renderer
```

### 2. Run Database Migration

Create migration file:
```bash
npx prisma migrate dev --name add-reporting-compliance
```

This adds the following tables:
- `Report` - Generated reports
- `ReportTemplate` - Custom templates
- `ReportShare` - Share tokens
- `ReportAccessLog` - Audit trail
- `ReportSchedule` - Automated schedules
- `ScheduleRun` - Schedule execution history
- `ComplianceMapping` - Finding to control mappings

### 3. Verify Schema

```bash
npx prisma studio
```

Check that new models appear in Prisma Studio.

### 4. Generate Prisma Client

```bash
npx prisma generate
```

## Development Workflow

### Start Development Server

```bash
npm run dev
```

### Key Endpoints to Implement

| Priority | Endpoint | Purpose |
|----------|----------|---------|
| P1 | `POST /api/reports` | Generate report |
| P1 | `GET /api/reports/{id}/export/pdf` | Download PDF |
| P2 | `GET /api/compliance/frameworks` | List frameworks |
| P2 | `GET /api/compliance/scans/{id}/mappings` | Get compliance view |
| P3 | `POST /api/reports/{id}/shares` | Create share link |
| P4 | `POST /api/schedules` | Create schedule |

### Testing Flow

1. **Generate a report** (P1):
   ```bash
   curl -X POST http://localhost:3000/api/reports \
     -H "Content-Type: application/json" \
     -d '{"scanId": "<scan-id>", "type": "EXECUTIVE"}'
   ```

2. **Download PDF** (P1):
   ```bash
   curl http://localhost:3000/api/reports/<report-id>/export/pdf \
     -o report.pdf
   ```

3. **Get compliance mapping** (P2):
   ```bash
   curl http://localhost:3000/api/compliance/scans/<scan-id>/mappings?frameworkId=owasp-top-10-2021
   ```

4. **Share report** (P3):
   ```bash
   curl -X POST http://localhost:3000/api/reports/<report-id>/shares \
     -H "Content-Type: application/json" \
     -d '{"recipientEmail": "auditor@example.com", "expiresInDays": 7}'
   ```

## File Structure

Create these directories/files:

```
web/
├── app/
│   ├── (dashboard)/
│   │   ├── reports/
│   │   │   ├── page.tsx           # Report list
│   │   │   └── [reportId]/
│   │   │       └── page.tsx       # Report detail
│   │   └── compliance/
│   │       └── page.tsx           # Compliance dashboard
│   └── api/
│       ├── reports/
│       │   ├── route.ts           # GET (list), POST (generate)
│       │   └── [reportId]/
│       │       ├── route.ts       # GET, DELETE
│       │       ├── export/
│       │       │   └── [format]/
│       │       │       └── route.ts
│       │       └── shares/
│       │           └── route.ts
│       └── compliance/
│           ├── frameworks/
│           │   └── route.ts
│           └── scans/
│               └── [scanId]/
│                   └── mappings/
│                       └── route.ts
├── lib/
│   ├── reports/
│   │   ├── generator.ts           # Report generation logic
│   │   ├── templates/
│   │   │   ├── executive.tsx      # Executive template (React PDF)
│   │   │   └── technical.tsx
│   │   └── exporters/
│   │       ├── pdf.ts
│   │       └── html.ts
│   └── compliance/
│       ├── frameworks/
│       │   ├── index.ts           # Framework registry
│       │   └── owasp-top-10-2021.ts
│       └── mapper.ts              # Auto-mapping logic
└── components/
    └── reports/
        ├── ReportCard.tsx
        └── ReportViewer.tsx
```

## Key Implementation Notes

### PDF Generation with @react-pdf/renderer

```typescript
// lib/reports/templates/executive.tsx
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 30 },
  title: { fontSize: 24, marginBottom: 20 },
  section: { marginBottom: 15 },
});

export const ExecutiveReport = ({ scan, findings, riskScore }) => (
  <Document>
    <Page style={styles.page}>
      <Text style={styles.title}>Security Assessment Report</Text>
      <View style={styles.section}>
        <Text>Risk Score: {riskScore}/100</Text>
        <Text>Total Findings: {findings.length}</Text>
      </View>
      {/* More sections */}
    </Page>
  </Document>
);
```

### Share Token Generation

```typescript
// lib/sharing/tokens.ts
import { randomBytes, createHash } from 'crypto';

export function generateShareToken() {
  const token = randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(token).digest('hex');
  return { token, hash };
}
```

### Compliance Auto-Mapping

```typescript
// lib/compliance/mapper.ts
import { frameworks } from './frameworks';

export function mapFindingToControls(finding: Finding) {
  const mappings = [];

  for (const framework of frameworks) {
    for (const category of framework.categories) {
      for (const control of category.controls) {
        // Match by CWE
        if (finding.cwe && control.cweIds.includes(finding.cwe)) {
          mappings.push({
            frameworkId: framework.id,
            controlId: control.id,
            confidence: 'auto',
          });
        }
      }
    }
  }

  return mappings;
}
```

## Environment Variables

No new environment variables required. Uses existing:
- `DATABASE_URL` - PostgreSQL connection
- `CLERK_*` - Authentication
- S3 credentials for report storage (if configured)

## Common Issues

### PDF Generation Fails

- Ensure `@react-pdf/renderer` is installed
- Check Node.js version (requires 18+)
- Verify all fonts are available

### Compliance Mapping Empty

- Ensure findings have `cwe` field populated
- Check framework data is loaded correctly

### Share Links Not Working

- Verify token hash is stored correctly
- Check expiration date logic
- Ensure share route is public (no auth required)

## Next Steps

After basic implementation:

1. Add Temporal workflow for async large report generation
2. Implement compliance dashboard with charts
3. Add schedule management UI
4. Build custom template editor
