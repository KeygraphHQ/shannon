import { redirect } from "next/navigation";
import { hasOrgPermission } from "@/lib/auth";
import { getAuditLogs, AuditAction } from "@/lib/audit";
import { db } from "@/lib/db";
import { AuditLogList } from "./audit-log-list";

interface AuditPageProps {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ page?: string; action?: string }>;
}

export default async function AuditPage({ params, searchParams }: AuditPageProps) {
  const { orgId } = await params;
  const { page, action } = await searchParams;

  const canViewAudit = await hasOrgPermission(orgId, "VIEW_AUDIT_LOG");
  if (!canViewAudit) {
    redirect("/dashboard");
  }

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, deletedAt: true },
  });

  if (!org || org.deletedAt) {
    redirect("/dashboard");
  }

  const currentPage = parseInt(page || "1", 10);
  const limit = 50;
  const offset = (currentPage - 1) * limit;

  const rawLogs = await getAuditLogs(orgId, {
    limit,
    offset,
    action: action as AuditAction | undefined,
  });

  // Map logs to expected type
  const logs = rawLogs.map((log) => ({
    ...log,
    metadata: log.metadata as Record<string, unknown> | null,
  }));

  // Get total count for pagination
  const totalCount = await db.auditLog.count({
    where: {
      organizationId: orgId,
      ...(action && { action }),
    },
  });

  const totalPages = Math.ceil(totalCount / limit);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track all activity and changes in {org.name}
        </p>
      </div>

      {/* Audit Logs */}
      <AuditLogList
        logs={logs}
        orgId={orgId}
        currentPage={currentPage}
        totalPages={totalPages}
        totalCount={totalCount}
        currentAction={action}
      />
    </div>
  );
}
