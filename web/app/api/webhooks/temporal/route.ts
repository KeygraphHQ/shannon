import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * POST /api/webhooks/temporal - Handle Temporal workflow callbacks
 *
 * This endpoint is called by the Temporal workflow activities to update
 * scan status in the database when workflow state changes.
 *
 * Authentication: Uses a shared secret (TEMPORAL_WEBHOOK_SECRET)
 */
export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret
    const webhookSecret = process.env.TEMPORAL_WEBHOOK_SECRET;
    const authHeader = request.headers.get("authorization");

    if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { event, scanId, organizationId, data } = body;

    if (!event || !scanId) {
      return NextResponse.json(
        { error: "Missing required fields: event, scanId" },
        { status: 400 }
      );
    }

    // Verify scan exists
    const whereClause: { id: string; organizationId?: string } = { id: scanId };
    if (organizationId) {
      whereClause.organizationId = organizationId;
    }

    const scan = await db.scan.findFirst({
      where: whereClause,
    });

    if (!scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    switch (event) {
      case "workflow.started":
        await handleWorkflowStarted(scanId, data);
        break;

      case "workflow.progress":
        await handleWorkflowProgress(scanId, data);
        break;

      case "workflow.completed":
        await handleWorkflowCompleted(scanId, data);
        break;

      case "workflow.failed":
        await handleWorkflowFailed(scanId, data);
        break;

      case "workflow.cancelled":
        await handleWorkflowCancelled(scanId);
        break;

      default:
        return NextResponse.json(
          { error: `Unknown event type: ${event}` },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Temporal webhook error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function handleWorkflowStarted(
  scanId: string,
  data: { workflowId?: string }
) {
  await db.scan.update({
    where: { id: scanId },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
      temporalWorkflowId: data.workflowId,
    },
  });
}

async function handleWorkflowProgress(
  scanId: string,
  data: {
    currentPhase?: string | null;
    currentAgent?: string | null;
    progressPercent?: number;
    completedAgents?: string[];
  }
) {
  await db.scan.update({
    where: { id: scanId },
    data: {
      currentPhase: data.currentPhase,
      currentAgent: data.currentAgent,
      progressPercent: data.progressPercent ?? 0,
    },
  });
}

async function handleWorkflowCompleted(
  scanId: string,
  data: {
    summary?: {
      totalDurationMs: number;
      totalCostUsd: number;
    };
    findings?: {
      total: number;
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
    reportHtmlPath?: string;
    reportPdfPath?: string;
    executiveSummary?: string;
    riskScore?: number;
  }
) {
  const now = new Date();

  // Get the scan to calculate duration and org info
  const scan = await db.scan.findUnique({
    where: { id: scanId },
    select: {
      startedAt: true,
      organizationId: true,
      projectId: true,
      project: { select: { name: true } },
    },
  });

  const durationMs =
    data.summary?.totalDurationMs ||
    (scan?.startedAt ? now.getTime() - scan.startedAt.getTime() : 0);

  // Update scan status and create audit log in transaction
  await db.$transaction(async (tx) => {
    await tx.scan.update({
      where: { id: scanId },
      data: {
        status: "COMPLETED",
        completedAt: now,
        durationMs,
        progressPercent: 100,
        currentPhase: null,
        currentAgent: null,
        findingsCount: data.findings?.total ?? 0,
        criticalCount: data.findings?.critical ?? 0,
        highCount: data.findings?.high ?? 0,
        mediumCount: data.findings?.medium ?? 0,
        lowCount: data.findings?.low ?? 0,
      },
    });

    // Create or update scan result
    if (data.reportHtmlPath || data.executiveSummary || data.riskScore) {
      await tx.scanResult.upsert({
        where: { scanId },
        create: {
          scanId,
          reportHtmlPath: data.reportHtmlPath,
          reportPdfPath: data.reportPdfPath,
          executiveSummary: data.executiveSummary,
          riskScore: data.riskScore,
        },
        update: {
          reportHtmlPath: data.reportHtmlPath,
          reportPdfPath: data.reportPdfPath,
          executiveSummary: data.executiveSummary,
          riskScore: data.riskScore,
        },
      });
    }

    // Audit log for scan completion
    if (scan?.organizationId) {
      await tx.auditLog.create({
        data: {
          organizationId: scan.organizationId,
          action: "scan.completed",
          resourceType: "scan",
          resourceId: scanId,
          metadata: {
            projectId: scan.projectId,
            projectName: scan.project?.name,
            durationMs,
            findingsCount: data.findings?.total ?? 0,
            criticalCount: data.findings?.critical ?? 0,
            highCount: data.findings?.high ?? 0,
            riskScore: data.riskScore,
          },
        },
      });
    }
  });
}

async function handleWorkflowFailed(
  scanId: string,
  data: {
    error?: string;
    failedAgent?: string | null;
    summary?: {
      totalDurationMs: number;
    };
  }
) {
  const now = new Date();

  // Get the scan to calculate duration and org info
  const scan = await db.scan.findUnique({
    where: { id: scanId },
    select: {
      startedAt: true,
      organizationId: true,
      projectId: true,
      project: { select: { name: true } },
    },
  });

  const durationMs =
    data.summary?.totalDurationMs ||
    (scan?.startedAt ? now.getTime() - scan.startedAt.getTime() : 0);

  await db.$transaction(async (tx) => {
    await tx.scan.update({
      where: { id: scanId },
      data: {
        status: "FAILED",
        completedAt: now,
        durationMs,
        currentPhase: null,
        currentAgent: data.failedAgent,
        errorMessage: data.error || "Scan failed",
      },
    });

    // Audit log for scan failure
    if (scan?.organizationId) {
      await tx.auditLog.create({
        data: {
          organizationId: scan.organizationId,
          action: "scan.failed",
          resourceType: "scan",
          resourceId: scanId,
          metadata: {
            projectId: scan.projectId,
            projectName: scan.project?.name,
            durationMs,
            error: data.error,
            failedAgent: data.failedAgent,
          },
        },
      });
    }
  });
}

async function handleWorkflowCancelled(scanId: string) {
  const now = new Date();

  // Get the scan to calculate duration
  const scan = await db.scan.findUnique({
    where: { id: scanId },
    select: { startedAt: true },
  });

  const durationMs = scan?.startedAt
    ? now.getTime() - scan.startedAt.getTime()
    : 0;

  await db.scan.update({
    where: { id: scanId },
    data: {
      status: "CANCELLED",
      completedAt: now,
      durationMs,
      currentPhase: null,
      currentAgent: null,
    },
  });
}
