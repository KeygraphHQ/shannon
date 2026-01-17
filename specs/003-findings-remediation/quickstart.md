# Quickstart: Findings & Remediation Management

**Feature**: 003-findings-remediation
**Date**: 2026-01-17

## Prerequisites

- Shannon web application running locally (`cd web && npm run dev`)
- PostgreSQL database with existing schema
- At least one completed scan with findings

## Implementation Order

Follow user story priorities for incremental delivery:

### P1: Finding Detail View & Status Management

**Goal**: View findings in detail and update their status.

1. **Database Migration**
   ```bash
   cd web
   npx prisma migrate dev --name add-finding-notes
   ```

2. **Server Actions** (`web/lib/actions/findings.ts`)
   - `getFinding(findingId)` - Get single finding with evidence
   - `updateFindingStatus(findingId, status, justification?)` - Update status

3. **Components**
   - `FindingDetail` - Full finding view with all fields
   - `FindingStatusSelect` - Dropdown with justification modal

4. **Routes**
   - `/dashboard/findings/[findingId]` - Detail page

5. **Test**
   - Navigate to a finding from scan detail
   - View all details (title, severity, evidence, remediation)
   - Change status to "fixed" → verify UI updates
   - Change to "accepted_risk" → verify justification required

---

### P2: Remediation Notes & Activity History

**Goal**: Add notes and view activity timeline.

1. **Server Actions** (`web/lib/actions/findings.ts`)
   - `addFindingNote(findingId, content)` - Add note
   - `getFindingActivity(findingId)` - Get merged timeline

2. **Components**
   - `FindingNoteForm` - Text input with submit
   - `FindingActivity` - Timeline component
   - `ActivityEntry` - Individual note/status change item

3. **Test**
   - Add a note to a finding → appears in timeline
   - Change status → status change appears in timeline
   - Verify reverse chronological order

---

### P3: Findings List with Filtering & Search

**Goal**: Cross-scan findings view with filters.

1. **Server Actions** (`web/lib/actions/findings.ts`)
   - `listFindings(filters, pagination)` - Cross-scan query

2. **Components**
   - `FindingsList` - Paginated list
   - `FindingsFilters` - Severity/status/category dropdowns
   - `FindingsSearch` - Text search input

3. **Routes**
   - `/dashboard/findings` - Cross-scan findings page

4. **Dashboard Widget**
   - `FindingsWidget` - Summary card for dashboard
   - `getFindingsSummary()` - Aggregation query

5. **Test**
   - Filter by severity → only matching findings shown
   - Filter by status "open" → only open findings
   - Search by keyword → matches in title/description
   - Verify filter chips and clear functionality

---

### P4: Bulk Status Updates

**Goal**: Update multiple findings at once.

1. **Server Actions** (`web/lib/actions/findings.ts`)
   - `bulkUpdateFindingStatus(findingIds, status, justification?)` - Bulk update

2. **Components**
   - `FindingsBulkActions` - Toolbar with select all, count, action buttons
   - `BulkStatusModal` - Confirmation with optional justification

3. **Test**
   - Select 5 findings → bulk toolbar shows "5 selected"
   - Click "Mark as Fixed" → all 5 updated
   - Verify individual audit logs created

---

## Key Files to Create

```
web/
├── prisma/
│   └── migrations/
│       └── YYYYMMDD_add_finding_notes/
│           └── migration.sql
├── lib/
│   └── actions/
│       └── findings.ts          # All server actions
├── app/
│   └── (dashboard)/
│       └── findings/
│           ├── page.tsx         # Cross-scan list (P3)
│           └── [findingId]/
│               └── page.tsx     # Detail view (P1)
└── components/
    └── findings/
        ├── finding-detail.tsx        # P1
        ├── finding-status-select.tsx # P1
        ├── finding-note-form.tsx     # P2
        ├── finding-activity.tsx      # P2
        ├── findings-list.tsx         # P3
        ├── findings-filters.tsx      # P3
        ├── findings-bulk-actions.tsx # P4
        └── findings-widget.tsx       # P3 (dashboard)
```

## Common Patterns

### Server Action with Auth
```typescript
"use server";

import { db } from "@/lib/db";
import { getCurrentUser, hasOrgAccess } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function updateFindingStatus(
  findingId: string,
  status: string,
  justification?: string
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  // Get finding with scan to verify org access
  const finding = await db.finding.findUnique({
    where: { id: findingId },
    include: { scan: { select: { organizationId: true } } },
  });

  if (!finding) throw new Error("Finding not found");

  const hasAccess = await hasOrgAccess(finding.scan.organizationId);
  if (!hasAccess) throw new Error("Unauthorized");

  // Validate justification requirement
  if (["accepted_risk", "false_positive"].includes(status) && !justification) {
    throw new Error("Justification required");
  }

  // Transaction: update + audit log
  await db.$transaction(async (tx) => {
    await tx.finding.update({
      where: { id: findingId },
      data: { status, updatedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        organizationId: finding.scan.organizationId,
        userId: user.id,
        action: "finding.status_changed",
        resourceType: "finding",
        resourceId: findingId,
        metadata: {
          previousStatus: finding.status,
          newStatus: status,
          justification: justification || null,
        },
      },
    });
  });

  revalidatePath(`/dashboard/findings/${findingId}`);
  revalidatePath("/dashboard/findings");
}
```

### Client Component with Server Action
```typescript
"use client";

import { useState } from "react";
import { updateFindingStatus } from "@/lib/actions/findings";

export function FindingStatusSelect({ finding }: { finding: Finding }) {
  const [status, setStatus] = useState(finding.status);
  const [justification, setJustification] = useState("");
  const [showModal, setShowModal] = useState(false);

  const handleStatusChange = async (newStatus: string) => {
    if (["accepted_risk", "false_positive"].includes(newStatus)) {
      setShowModal(true);
      return;
    }

    await updateFindingStatus(finding.id, newStatus);
    setStatus(newStatus);
  };

  // ... render select + modal
}
```

## Testing Checklist

- [ ] P1: Can view finding detail with all fields
- [ ] P1: Can update status to "fixed" without justification
- [ ] P1: Must provide justification for "accepted_risk"
- [ ] P1: Audit log created for each status change
- [ ] P2: Can add notes to findings
- [ ] P2: Activity shows notes + status changes chronologically
- [ ] P3: Cross-scan findings list loads
- [ ] P3: Filters work (severity, status, category)
- [ ] P3: Search returns matching findings
- [ ] P3: Dashboard widget shows correct counts
- [ ] P4: Can select multiple findings
- [ ] P4: Bulk status update works
- [ ] P4: Individual audit logs for bulk operation
