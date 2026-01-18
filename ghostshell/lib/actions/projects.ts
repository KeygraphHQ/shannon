"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser, hasOrgAccess } from "@/lib/auth";

/**
 * Get all projects for an organization.
 */
export async function getProjects(orgId: string) {
  const hasAccess = await hasOrgAccess(orgId);
  if (!hasAccess) {
    return [];
  }

  return db.project.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { scans: true },
      },
    },
  });
}

/**
 * Get a single project by ID.
 */
export async function getProject(orgId: string, projectId: string) {
  const hasAccess = await hasOrgAccess(orgId);
  if (!hasAccess) {
    return null;
  }

  return db.project.findFirst({
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
          createdAt: true,
          completedAt: true,
          findingsCount: true,
          criticalCount: true,
          highCount: true,
        },
      },
      _count: {
        select: { scans: true },
      },
    },
  });
}

/**
 * Create a new project.
 */
export async function createProject(
  orgId: string,
  data: {
    name: string;
    description?: string;
    targetUrl: string;
    repositoryUrl?: string;
  }
) {
  const hasAccess = await hasOrgAccess(orgId, ["owner", "admin", "member"]);
  if (!hasAccess) {
    throw new Error("Not authorized");
  }

  const user = await getCurrentUser();

  const project = await db.$transaction(async (tx) => {
    const newProject = await tx.project.create({
      data: {
        organizationId: orgId,
        name: data.name,
        description: data.description,
        targetUrl: data.targetUrl,
        repositoryUrl: data.repositoryUrl,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        userId: user!.id,
        action: "project.created",
        resourceType: "project",
        resourceId: newProject.id,
        metadata: { name: data.name, targetUrl: data.targetUrl },
      },
    });

    return newProject;
  });

  revalidatePath("/dashboard");
  return project;
}

/**
 * Update a project.
 */
export async function updateProject(
  orgId: string,
  projectId: string,
  data: {
    name?: string;
    description?: string;
    targetUrl?: string;
    repositoryUrl?: string;
  }
) {
  const hasAccess = await hasOrgAccess(orgId, ["owner", "admin", "member"]);
  if (!hasAccess) {
    throw new Error("Not authorized");
  }

  const user = await getCurrentUser();

  // Verify project belongs to org
  const existing = await db.project.findFirst({
    where: { id: projectId, organizationId: orgId },
  });
  if (!existing) {
    throw new Error("Project not found");
  }

  const project = await db.$transaction(async (tx) => {
    const updatedProject = await tx.project.update({
      where: { id: projectId },
      data,
    });

    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        userId: user!.id,
        action: "project.updated",
        resourceType: "project",
        resourceId: projectId,
        metadata: data,
      },
    });

    return updatedProject;
  });

  revalidatePath("/dashboard");
  return project;
}

/**
 * Delete a project.
 */
export async function deleteProject(orgId: string, projectId: string) {
  const hasAccess = await hasOrgAccess(orgId, ["owner", "admin"]);
  if (!hasAccess) {
    throw new Error("Not authorized");
  }

  const user = await getCurrentUser();

  // Verify project belongs to org
  const existing = await db.project.findFirst({
    where: { id: projectId, organizationId: orgId },
  });
  if (!existing) {
    throw new Error("Project not found");
  }

  await db.$transaction(async (tx) => {
    await tx.project.delete({
      where: { id: projectId },
    });

    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        userId: user!.id,
        action: "project.deleted",
        resourceType: "project",
        resourceId: projectId,
        metadata: { name: existing.name },
      },
    });
  });

  revalidatePath("/dashboard");
}
