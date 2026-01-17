import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ScanDetailCard } from "@/components/scans/scan-detail-card";
import { ScanProgress } from "@/components/scans/scan-progress";
import { CancelScanButton } from "@/components/scans/cancel-scan-button";

export const dynamic = "force-dynamic";

interface ScanDetailPageProps {
  params: Promise<{ scanId: string }>;
}

export default async function ScanDetailPage({ params }: ScanDetailPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/sign-in");
  }

  if (user.memberships.length === 0) {
    redirect("/dashboard");
  }

  const { scanId } = await params;
  const orgId = user.memberships[0].organizationId;

  // Fetch scan with project and result
  const scan = await db.scan.findFirst({
    where: {
      id: scanId,
      organizationId: orgId,
    },
    include: {
      project: {
        select: { id: true, name: true, targetUrl: true },
      },
      result: true,
    },
  });

  if (!scan) {
    notFound();
  }

  const isRunning = scan.status === "RUNNING";
  const isPending = scan.status === "PENDING";
  const canCancel = isRunning || isPending;

  const scanData = {
    id: scan.id,
    projectId: scan.projectId,
    projectName: scan.project.name,
    status: scan.status,
    source: scan.source,
    targetUrl: scan.project.targetUrl,
    currentPhase: scan.currentPhase,
    currentAgent: scan.currentAgent,
    progressPercent: scan.progressPercent,
    startedAt: scan.startedAt?.toISOString() || null,
    completedAt: scan.completedAt?.toISOString() || null,
    durationMs: scan.durationMs,
    findingsCount: scan.findingsCount,
    criticalCount: scan.criticalCount,
    highCount: scan.highCount,
    mediumCount: scan.mediumCount,
    lowCount: scan.lowCount,
    errorMessage: scan.errorMessage,
    result: scan.result
      ? {
          reportHtmlUrl: scan.result.reportHtmlPath
            ? `/api/scans/${scan.id}/report?format=html`
            : null,
          reportPdfUrl: scan.result.reportPdfPath
            ? `/api/scans/${scan.id}/report?format=pdf`
            : null,
          executiveSummary: scan.result.executiveSummary,
          riskScore: scan.result.riskScore,
        }
      : null,
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back link */}
      <Link
        href="/dashboard/scans"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Scans
      </Link>

      {/* Header with cancel button */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scan Details</h1>
          <p className="mt-1 text-sm text-gray-500">
            Scan ID: {scan.id}
          </p>
        </div>
        {canCancel && <CancelScanButton scanId={scan.id} />}
      </div>

      {/* Progress (if running) */}
      {isRunning && (
        <ScanProgress scanId={scan.id} initialStatus={scan.status} />
      )}

      {/* Scan details */}
      <ScanDetailCard scan={scanData} />
    </div>
  );
}
