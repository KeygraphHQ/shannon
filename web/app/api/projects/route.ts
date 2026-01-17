import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/**
 * GET /api/projects - List projects for organization
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getCurrentUser();
    if (!user || user.memberships.length === 0) {
      return NextResponse.json({ projects: [] });
    }

    // Get projects for user's first organization (default)
    const orgId = user.memberships[0].organizationId;

    const projects = await db.project.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { scans: true },
        },
        scans: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    const formattedProjects = projects.map((project) => ({
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
    }));

    return NextResponse.json({ projects: formattedProjects });
  } catch (error) {
    console.error("Error listing projects:", error);
    return NextResponse.json(
      { error: "Failed to list projects" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects - Create a new project
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getCurrentUser();
    if (!user || user.memberships.length === 0) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    const body = await request.json();
    const { name, description, targetUrl, repositoryUrl } = body;

    // Validation
    if (!name || typeof name !== "string" || name.length === 0) {
      return NextResponse.json(
        { error: "Name is required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    if (name.length > 100) {
      return NextResponse.json(
        { error: "Name must be 100 characters or less", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    if (!targetUrl || typeof targetUrl !== "string") {
      return NextResponse.json(
        { error: "Target URL is required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(targetUrl);
    } catch {
      return NextResponse.json(
        { error: "Invalid target URL format", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const orgId = user.memberships[0].organizationId;

    const project = await db.$transaction(async (tx) => {
      const newProject = await tx.project.create({
        data: {
          organizationId: orgId,
          name: name.trim(),
          description: description?.trim() || null,
          targetUrl: targetUrl.trim(),
          repositoryUrl: repositoryUrl?.trim() || null,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          userId: user.id,
          action: "project.created",
          resourceType: "project",
          resourceId: newProject.id,
          metadata: { name: newProject.name, targetUrl: newProject.targetUrl },
        },
      });

      return newProject;
    });

    return NextResponse.json(
      {
        id: project.id,
        name: project.name,
        description: project.description,
        targetUrl: project.targetUrl,
        repositoryUrl: project.repositoryUrl,
        hasAuthConfig: false,
        schedulesCount: 0,
        lastScanAt: null,
        scansCount: 0,
        createdAt: project.createdAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating project:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}
