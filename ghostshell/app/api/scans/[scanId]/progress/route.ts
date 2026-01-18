import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getWorkflowProgress } from "@/lib/temporal/client";

interface RouteParams {
  params: Promise<{ scanId: string }>;
}

/**
 * GET /api/scans/[scanId]/progress - Stream scan progress via SSE
 *
 * Polls Temporal workflow every 2 seconds and streams progress events
 * until the scan completes, fails, or is cancelled.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { userId } = await auth();
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const user = await getCurrentUser();
  if (!user || user.memberships.length === 0) {
    return new Response("No organization found", { status: 400 });
  }

  const { scanId } = await params;
  const orgId = user.memberships[0].organizationId;

  // Verify scan exists and belongs to org
  const scan = await db.scan.findFirst({
    where: {
      id: scanId,
      organizationId: orgId,
    },
  });

  if (!scan) {
    return new Response("Scan not found", { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Controller may be closed
        }
      };

      let isComplete = false;
      const POLL_INTERVAL = 2000; // 2 seconds

      const poll = async () => {
        if (isComplete) return;

        try {
          // Fetch latest scan status from database
          const currentScan = await db.scan.findUnique({
            where: { id: scanId },
          });

          if (!currentScan) {
            send({ error: "Scan not found" });
            isComplete = true;
            controller.close();
            return;
          }

          // If scan is completed/failed/cancelled, send final state
          if (["COMPLETED", "FAILED", "CANCELLED", "TIMEOUT"].includes(currentScan.status)) {
            send({
              status: currentScan.status,
              currentPhase: currentScan.currentPhase,
              currentAgent: currentScan.currentAgent,
              progressPercent: currentScan.progressPercent,
              elapsedMs: currentScan.durationMs || 0,
              estimatedRemainingMs: null,
              findingsCount: currentScan.findingsCount,
              completedAgents: [],
              complete: true,
            });
            isComplete = true;
            controller.close();
            return;
          }

          // Try to get progress from Temporal workflow
          let progress: Record<string, unknown> | null = null;

          if (currentScan.temporalWorkflowId) {
            try {
              const workflowProgress = await getWorkflowProgress(currentScan.temporalWorkflowId);

              // Check if workflow has completed/failed
              if (workflowProgress.status === "completed") {
                // Workflow completed - update database and signal completion
                await db.scan.update({
                  where: { id: scanId },
                  data: {
                    status: "COMPLETED",
                    completedAt: new Date(),
                    durationMs: workflowProgress.elapsedMs,
                    progressPercent: 100,
                    currentPhase: null,
                    currentAgent: null,
                  },
                });

                send({
                  status: "COMPLETED",
                  currentPhase: null,
                  currentAgent: null,
                  progressPercent: 100,
                  elapsedMs: workflowProgress.elapsedMs,
                  estimatedRemainingMs: null,
                  findingsCount: currentScan.findingsCount,
                  completedAgents: workflowProgress.completedAgents,
                  complete: true,
                });
                isComplete = true;
                controller.close();
                return;
              }

              if (workflowProgress.status === "failed") {
                // Workflow failed - update database and signal failure
                await db.scan.update({
                  where: { id: scanId },
                  data: {
                    status: "FAILED",
                    completedAt: new Date(),
                    durationMs: workflowProgress.elapsedMs,
                    currentPhase: null,
                    currentAgent: workflowProgress.failedAgent,
                    errorMessage: workflowProgress.error || "Scan failed",
                  },
                });

                send({
                  status: "FAILED",
                  currentPhase: null,
                  currentAgent: workflowProgress.failedAgent,
                  progressPercent: calculateProgressPercent(workflowProgress.completedAgents),
                  elapsedMs: workflowProgress.elapsedMs,
                  estimatedRemainingMs: null,
                  findingsCount: currentScan.findingsCount,
                  completedAgents: workflowProgress.completedAgents,
                  error: workflowProgress.error,
                  complete: true,
                });
                isComplete = true;
                controller.close();
                return;
              }

              // Workflow still running
              progress = {
                status: "RUNNING",
                currentPhase: workflowProgress.currentPhase,
                currentAgent: workflowProgress.currentAgent,
                progressPercent: calculateProgressPercent(workflowProgress.completedAgents),
                elapsedMs: workflowProgress.elapsedMs,
                estimatedRemainingMs: estimateRemainingTime(
                  workflowProgress.elapsedMs,
                  workflowProgress.completedAgents.length
                ),
                findingsCount: currentScan.findingsCount,
                completedAgents: workflowProgress.completedAgents,
                complete: false,
              };

              // Update scan record with latest progress
              await db.scan.update({
                where: { id: scanId },
                data: {
                  currentPhase: workflowProgress.currentPhase,
                  currentAgent: workflowProgress.currentAgent,
                  progressPercent: progress.progressPercent as number,
                },
              });
            } catch (workflowError) {
              // Workflow query failed, use database values
              console.error("Failed to query workflow:", workflowError);
            }
          }

          // Use database values if workflow query failed
          if (!progress) {
            const elapsedMs = currentScan.startedAt
              ? Date.now() - currentScan.startedAt.getTime()
              : 0;

            progress = {
              status: currentScan.status,
              currentPhase: currentScan.currentPhase,
              currentAgent: currentScan.currentAgent,
              progressPercent: currentScan.progressPercent,
              elapsedMs,
              estimatedRemainingMs: null,
              findingsCount: currentScan.findingsCount,
              completedAgents: [],
              complete: false,
            };
          }

          send(progress);
        } catch (error) {
          console.error("Error polling scan progress:", error);
          send({ error: "Failed to get progress" });
        }

        // Schedule next poll
        if (!isComplete) {
          setTimeout(poll, POLL_INTERVAL);
        }
      };

      // Start polling
      poll();

      // Cleanup when connection closes
      request.signal.addEventListener("abort", () => {
        isComplete = true;
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * Calculate progress percentage based on completed agents.
 * Total agents: pre-recon, recon, 5 vuln, 5 exploit, report = 13 max
 */
function calculateProgressPercent(completedAgents: string[]): number {
  // Simplified: each agent is ~7.7% (13 agents total)
  // But some may not run (exploits only if vulns found)
  const expectedAgents = 8; // pre-recon, recon, 5 vuln, report
  const percent = Math.round((completedAgents.length / expectedAgents) * 100);
  return Math.min(percent, 99); // Cap at 99 until truly complete
}

/**
 * Estimate remaining time based on elapsed time and progress.
 */
function estimateRemainingTime(
  elapsedMs: number,
  completedCount: number
): number | null {
  if (completedCount === 0) {
    return null; // Not enough data
  }

  const expectedAgents = 8;
  const remainingAgents = expectedAgents - completedCount;
  const avgTimePerAgent = elapsedMs / completedCount;

  return Math.round(avgTimePerAgent * remainingAgents);
}
