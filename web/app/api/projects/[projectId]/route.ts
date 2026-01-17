import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId] - Get project details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getCurrentUser();
    if (!user || user.memberships.length === 0) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    const { projectId } = await params;
    const orgId = user.memberships[0].organizationId;

    const project = await db.project.findFirst({
      where: {
        id: projectId,
        organizationId: orgId,
      },
      include: {
        scans: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            status: true,
            source: true,
            startedAt: true,
            completedAt: true,
            durationMs: true,
            findingsCount: true,
            criticalCount: true,
            highCount: true,
            mediumCount: true,
            lowCount: true,
            createdAt: true,
          },
        },
        _count: {
          select: { scans: true },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const recentScans = project.scans.map((scan) => ({
      id: scan.id,
      projectId: project.id,
      projectName: project.name,
      status: scan.status,
      source: scan.source,
      startedAt: scan.startedAt,
      completedAt: scan.completedAt,
      durationMs: scan.durationMs,
      findingsCount: scan.findingsCount,
      criticalCount: scan.criticalCount,
      highCount: scan.highCount,
      mediumCount: scan.mediumCount,
      lowCount: scan.lowCount,
      createdAt: scan.createdAt,
    }));

    return NextResponse.json({
      id: project.id,
      name: project.name,
      description: project.description,
      targetUrl: project.targetUrl,
      repositoryUrl: project.repositoryUrl,
      hasAuthConfig: false, // Will be updated in US2
      schedulesCount: 0, // Will be updated in US4
      lastScanAt: project.scans[0]?.createdAt || null,
      scansCount: project._count.scans,
      createdAt: project.createdAt,
      recentScans,
      schedules: [], // Will be populated in US4
    });
  } catch (error) {
    console.error("Error getting project:", error);
    return NextResponse.json(
      { error: "Failed to get project" },
      { status: 500 }
    );
  }
}
