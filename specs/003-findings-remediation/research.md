# Research: Findings & Remediation Management

**Feature**: 003-findings-remediation
**Date**: 2026-01-17
**Status**: Complete

## Research Summary

No NEEDS CLARIFICATION items from Technical Context. Research focused on:
1. Existing audit logging patterns
2. Filter/pagination patterns for lists
3. Bulk operations approach
4. Text search implementation options

---

## 1. Audit Logging for Status Changes

### Decision
Use the existing `AuditLog` model with `action: "finding.status_changed"` and store transition details in `metadata` JSON field.

### Rationale
- AuditLog model already exists with flexible `metadata` JSON field
- Composite indexes on `organizationId + action` support efficient filtering
- Audit actions `"finding.status_changed"` and `"finding.created"` already defined in codebase
- Follows established transaction pattern: wrap status update + audit log creation together

### Implementation Pattern
```typescript
await db.$transaction(async (tx) => {
  const updated = await tx.finding.update({
    where: { id: findingId },
    data: { status: newStatus, updatedAt: new Date() },
  });

  await tx.auditLog.create({
    data: {
      organizationId,
      userId: currentUser.id,
      action: "finding.status_changed",
      resourceType: "finding",
      resourceId: findingId,
      metadata: {
        previousStatus: oldStatus,
        newStatus: newStatus,
        justification: justification || null,
      },
    },
  });

  return updated;
});
```

### Alternatives Considered
- **Separate FindingStatusChange table**: Rejected - adds schema complexity when AuditLog already serves this purpose
- **Event sourcing**: Rejected - over-engineering for current scale; YAGNI principle applies

---

## 2. Finding Notes Storage

### Decision
Create new `FindingNote` model linked to Finding with author reference and 10,000 character limit.

### Rationale
- Notes need their own timestamps (createdAt) separate from finding updates
- Notes must preserve author identity for collaboration
- Max 10,000 chars per spec clarification (prevents unbounded storage)
- Cascade delete when finding is deleted

### Implementation Pattern
```prisma
model FindingNote {
  id        String   @id @default(cuid())
  findingId String
  userId    String
  content   String   @db.VarChar(10000)
  createdAt DateTime @default(now())

  finding Finding @relation(fields: [findingId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([findingId])
  @@index([findingId, createdAt])
}
```

### Alternatives Considered
- **Store notes in Finding.metadata JSON**: Rejected - loses relational integrity and author tracking
- **Rich text (Markdown/HTML)**: Rejected per spec - basic formatting only (line breaks, code blocks preserved as plain text)

---

## 3. Cross-Scan Findings Query Pattern

### Decision
Create new `listFindings` server action following established `listScans` pattern with cursor pagination and multi-select filters.

### Rationale
- Consistent with existing codebase patterns
- Cursor-based pagination handles large result sets efficiently
- Multi-select filters (severity[], status[], category[]) match spec requirements

### Implementation Pattern
```typescript
export interface FindingFilters {
  severity?: string | string[];
  status?: string | string[];
  category?: string | string[];
  scanId?: string;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export async function listFindings(
  orgId: string,
  filters?: FindingFilters,
  pagination?: PaginationOptions
) {
  const hasAccess = await hasOrgAccess(orgId);
  if (!hasAccess) return { findings: [], nextCursor: null, total: 0 };

  const where: Record<string, unknown> = {
    scan: { organizationId: orgId },
  };

  // Multi-select filters using { in: [...] }
  if (filters?.severity) {
    where.severity = Array.isArray(filters.severity)
      ? { in: filters.severity }
      : filters.severity;
  }

  // Text search with ilike
  if (filters?.search) {
    where.OR = [
      { title: { contains: filters.search, mode: "insensitive" } },
      { description: { contains: filters.search, mode: "insensitive" } },
      { cwe: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  // Cursor pagination with +1 pattern
  const limit = pagination?.limit || 20;
  const findings = await db.finding.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    include: { scan: { select: { id: true, targetUrl: true } } },
  });

  const hasMore = findings.length > limit;
  const results = hasMore ? findings.slice(0, -1) : findings;

  return { findings: results, nextCursor, total };
}
```

### Alternatives Considered
- **PostgreSQL full-text search**: Deferred - `contains/mode:insensitive` sufficient for MVP; can upgrade later if needed
- **Elasticsearch**: Rejected - adds infrastructure complexity; violates Simplicity principle

---

## 4. Bulk Status Updates

### Decision
Use Prisma `updateMany` for status changes, with individual audit log entries created in a transaction.

### Rationale
- `updateMany` efficient for batch operations (SC-004: 50 findings in 5 seconds)
- Individual audit logs per FR-013 requirement
- Transaction ensures atomicity

### Implementation Pattern
```typescript
export async function bulkUpdateFindingStatus(
  orgId: string,
  findingIds: string[],
  newStatus: string,
  justification?: string
) {
  const hasAccess = await hasOrgAccess(orgId);
  if (!hasAccess) throw new Error("Unauthorized");

  // Verify all findings belong to org
  const findings = await db.finding.findMany({
    where: {
      id: { in: findingIds },
      scan: { organizationId: orgId },
    },
    select: { id: true, status: true },
  });

  if (findings.length !== findingIds.length) {
    throw new Error("Some findings not found or unauthorized");
  }

  await db.$transaction(async (tx) => {
    // Bulk update
    await tx.finding.updateMany({
      where: { id: { in: findingIds } },
      data: { status: newStatus, updatedAt: new Date() },
    });

    // Individual audit logs
    await tx.auditLog.createMany({
      data: findings.map((f) => ({
        organizationId: orgId,
        userId: currentUser.id,
        action: "finding.status_changed",
        resourceType: "finding",
        resourceId: f.id,
        metadata: {
          previousStatus: f.status,
          newStatus,
          justification,
          bulkOperation: true,
        },
      })),
    });
  });

  revalidatePath("/findings");
}
```

### Alternatives Considered
- **Queue/batch processing**: Rejected - 50 findings in 5s achievable with direct DB operations
- **Single audit log for bulk**: Rejected - FR-013 requires individual entries

---

## 5. Activity History Aggregation

### Decision
Query FindingNote and AuditLog separately, merge client-side for unified timeline.

### Rationale
- Notes and audit logs have different schemas
- Client-side merge simpler than complex SQL union
- Activity display is read-only, no write concerns

### Implementation Pattern
```typescript
export async function getFindingActivity(findingId: string) {
  const [notes, auditLogs] = await Promise.all([
    db.findingNote.findMany({
      where: { findingId },
      include: { user: { select: { id: true, name: true, imageUrl: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.auditLog.findMany({
      where: {
        resourceType: "finding",
        resourceId: findingId,
        action: "finding.status_changed",
      },
      include: { user: { select: { id: true, name: true, imageUrl: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Merge and sort by timestamp
  const activities = [
    ...notes.map((n) => ({ type: "note" as const, ...n })),
    ...auditLogs.map((a) => ({ type: "status_change" as const, ...a })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return activities;
}
```

### Alternatives Considered
- **Denormalized Activity table**: Rejected - adds write complexity; dual queries acceptable for read performance
- **PostgreSQL UNION query**: Rejected - type mismatch between tables makes this awkward

---

## 6. Dashboard Widget Metrics

### Decision
Aggregate finding counts by severity using existing denormalized counts on Scan model, plus direct count query for status breakdown.

### Rationale
- Scan already has `criticalCount`, `highCount`, `mediumCount`, `lowCount`
- Status breakdown needs direct query (not denormalized)
- Widget shows summary, not full list - simple aggregation sufficient

### Implementation Pattern
```typescript
export async function getFindingsSummary(orgId: string) {
  const [bySeverity, byStatus] = await Promise.all([
    db.scan.aggregate({
      where: { organizationId: orgId },
      _sum: {
        criticalCount: true,
        highCount: true,
        mediumCount: true,
        lowCount: true,
      },
    }),
    db.finding.groupBy({
      by: ["status"],
      where: { scan: { organizationId: orgId } },
      _count: true,
    }),
  ]);

  return {
    severity: bySeverity._sum,
    status: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
  };
}
```

---

## Research Conclusions

All technical unknowns resolved. Implementation can proceed using:

1. **Existing AuditLog model** for status change tracking (no new audit infrastructure)
2. **New FindingNote model** for user notes (simple schema addition)
3. **Established filter/pagination patterns** from listScans
4. **Prisma updateMany + createMany** for bulk operations
5. **Client-side activity merge** for unified timeline
6. **Aggregate queries** for dashboard widget

No external dependencies or infrastructure changes required. Follows VII. Simplicity principle.
