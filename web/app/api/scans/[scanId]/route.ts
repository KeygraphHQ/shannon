import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { cancelScanWorkflow } from "@/lib/temporal/client";

interface RouteParams {
  params: Promise<{ scanId: string }>;
}

/**
 * GET /api/scans/[scanId] - Get scan details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getCurrentUser();
    if (!user || user.memberships.length === 0) {
      return NextResponse.json(
        { error: "No organization found", code: "NO_ORGANIZATION" },
        { status: 400 }
      );
    }

    const { scanId } = await params;
    const orgId = user.memberships[0].organizationId;

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
      return NextResponse.json(
        { error: "Scan not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const response: Record<string, unknown> = {
      id: scan.id,
      projectId: scan.projectId,
      projectName: scan.project.name,
      status: scan.status,
      source: scan.source,
      targetUrl: scan.project.targetUrl,
      currentPhase: scan.currentPhase,
      currentAgent: scan.currentAgent,
      progressPercent: scan.progressPercent,
      startedAt: scan.startedAt,
      completedAt: scan.completedAt,
      durationMs: scan.durationMs,
      findingsCount: scan.findingsCount,
      criticalCount: scan.criticalCount,
      highCount: scan.highCount,
      mediumCount: scan.mediumCount,
      lowCount: scan.lowCount,
      errorMessage: scan.errorMessage,
      createdAt: scan.createdAt,
      metadata: scan.metadata,
    };

    // Include result if available
    if (scan.result) {
      response.result = {
        reportHtmlUrl: scan.result.reportHtmlPath
          ? `/api/scans/${scan.id}/report?format=html`
          : null,
        reportPdfUrl: scan.result.reportPdfPath
          ? `/api/scans/${scan.id}/report?format=pdf`
          : null,
        executiveSummary: scan.result.executiveSummary,
        riskScore: scan.result.riskScore,
        totalCostUsd: scan.result.totalCostUsd
          ? Number(scan.result.totalCostUsd)
          : null,
      };
    } else {
      response.result = null;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error getting scan:", error);
    return NextResponse.json(
      { error: "Failed to get scan", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/scans/[scanId] - Cancel a running scan
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getCurrentUser();
    if (!user || user.memberships.length === 0) {
      return NextResponse.json(
        { error: "No organization found", code: "NO_ORGANIZATION" },
        { status: 400 }
      );
    }

    const { scanId } = await params;
    const orgId = user.memberships[0].organizationId;

    const scan = await db.scan.findFirst({
      where: {
        id: scanId,
        organizationId: orgId,
      },
      include: {
        project: {
          select: { name: true, targetUrl: true },
        },
      },
    });

    if (!scan) {
      return NextResponse.json(
        { error: "Scan not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Can only cancel PENDING or RUNNING scans
    if (!["PENDING", "RUNNING"].includes(scan.status)) {
      return NextResponse.json(
        {
          error: "Scan cannot be cancelled (not running)",
          code: "INVALID_STATUS",
        },
        { status: 400 }
      );
    }

    // Cancel Temporal workflow if running
    if (scan.temporalWorkflowId && scan.status === "RUNNING") {
      try {
        await cancelScanWorkflow(scan.temporalWorkflowId);
      } catch (workflowError) {
        console.error("Failed to cancel workflow:", workflowError);
        // Continue anyway - workflow may have already completed
      }
    }

    // Update scan status
    const updatedScan = await db.$transaction(async (tx) => {
      const updated = await tx.scan.update({
        where: { id: scanId },
        data: {
          status: "CANCELLED",
          completedAt: new Date(),
          durationMs: scan.startedAt
            ? Date.now() - scan.startedAt.getTime()
            : null,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          userId: user.id,
          action: "scan.cancelled",
          resourceType: "scan",
          resourceId: scanId,
          metadata: {
            projectId: scan.projectId,
            projectName: scan.project.name,
            previousStatus: scan.status,
          },
        },
      });

      return updated;
    });

    return NextResponse.json({
      id: updatedScan.id,
      projectId: updatedScan.projectId,
      projectName: scan.project.name,
      status: updatedScan.status,
      source: updatedScan.source,
      targetUrl: scan.project.targetUrl,
      currentPhase: updatedScan.currentPhase,
      currentAgent: updatedScan.currentAgent,
      progressPercent: updatedScan.progressPercent,
      startedAt: updatedScan.startedAt,
      completedAt: updatedScan.completedAt,
      durationMs: updatedScan.durationMs,
      findingsCount: updatedScan.findingsCount,
      criticalCount: updatedScan.criticalCount,
      highCount: updatedScan.highCount,
      mediumCount: updatedScan.mediumCount,
      lowCount: updatedScan.lowCount,
      createdAt: updatedScan.createdAt,
    });
  } catch (error) {
    console.error("Error cancelling scan:", error);
    return NextResponse.json(
      { error: "Failed to cancel scan", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
