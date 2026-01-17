"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser, hasOrgAccess } from "@/lib/auth";

/**
 * Create a new organization for the current user.
 */
export async function createOrganization(name: string) {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Not authenticated");
  }

  // Generate slug from name
  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const slug = `${baseSlug}-${Date.now().toString(36)}`;

  const org = await db.$transaction(async (tx) => {
    const newOrg = await tx.organization.create({
      data: {
        name,
        slug,
        plan: "free",
      },
    });

    await tx.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId: newOrg.id,
        role: "owner",
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: newOrg.id,
        userId: user.id,
        action: "organization.created",
        resourceType: "organization",
        resourceId: newOrg.id,
        metadata: { name, plan: "free" },
      },
    });

    return newOrg;
  });

  revalidatePath("/dashboard");
  return org;
}

/**
 * Update an organization's details.
 */
export async function updateOrganization(
  orgId: string,
  data: { name?: string; logoUrl?: string | null }
) {
  const hasAccess = await hasOrgAccess(orgId, ["owner", "admin"]);
  if (!hasAccess) {
    throw new Error("Not authorized");
  }

  const user = await getCurrentUser();

  // Don't allow updates to deleted organizations
  const existingOrg = await db.organization.findUnique({
    where: { id: orgId },
    select: { deletedAt: true },
  });

  if (existingOrg?.deletedAt) {
    throw new Error("Cannot update an organization scheduled for deletion");
  }

  const org = await db.organization.update({
    where: { id: orgId },
    data,
  });

  await db.auditLog.create({
    data: {
      organizationId: orgId,
      userId: user!.id,
      action: "organization.updated",
      resourceType: "organization",
      resourceId: orgId,
      metadata: data,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/org/${orgId}/settings`);
  return org;
}

/**
 * Schedule an organization for deletion with 30-day grace period.
 * Only owners can delete organizations.
 */
export async function deleteOrganization(orgId: string) {
  const hasAccess = await hasOrgAccess(orgId, ["owner"]);
  if (!hasAccess) {
    throw new Error("Only organization owners can delete organizations");
  }

  const user = await getCurrentUser();

  // Check if user has other organizations to switch to
  const userOrgs = user!.memberships.filter(
    (m) => m.organizationId !== orgId && !m.organization.deletedAt
  );

  // Check if this is the user's only organization
  if (userOrgs.length === 0) {
    throw new Error(
      "You cannot delete your only organization. Create a new organization first."
    );
  }

  // Schedule deletion for 30 days from now
  const scheduledDeletionAt = new Date();
  scheduledDeletionAt.setDate(scheduledDeletionAt.getDate() + 30);

  const org = await db.organization.update({
    where: { id: orgId },
    data: {
      deletedAt: new Date(),
      scheduledDeletionAt,
    },
  });

  await db.auditLog.create({
    data: {
      organizationId: orgId,
      userId: user!.id,
      action: "organization.deleted",
      resourceType: "organization",
      resourceId: orgId,
      metadata: {
        scheduledDeletionAt: scheduledDeletionAt.toISOString(),
        gracePeriodDays: 30,
      },
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/org/${orgId}/settings`);
  return org;
}

/**
 * Cancel a scheduled organization deletion.
 * Only owners can cancel deletion.
 */
export async function cancelOrganizationDeletion(orgId: string) {
  const hasAccess = await hasOrgAccess(orgId, ["owner"]);
  if (!hasAccess) {
    throw new Error("Only organization owners can cancel deletion");
  }

  const user = await getCurrentUser();

  // Verify org is actually scheduled for deletion
  const existingOrg = await db.organization.findUnique({
    where: { id: orgId },
    select: { deletedAt: true },
  });

  if (!existingOrg?.deletedAt) {
    throw new Error("Organization is not scheduled for deletion");
  }

  const org = await db.organization.update({
    where: { id: orgId },
    data: {
      deletedAt: null,
      scheduledDeletionAt: null,
    },
  });

  await db.auditLog.create({
    data: {
      organizationId: orgId,
      userId: user!.id,
      action: "organization.deletion_cancelled",
      resourceType: "organization",
      resourceId: orgId,
      metadata: {},
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/org/${orgId}/settings`);
  return org;
}

/**
 * Get organization details with members.
 */
export async function getOrganization(orgId: string) {
  const hasAccess = await hasOrgAccess(orgId);
  if (!hasAccess) {
    return null;
  }

  return db.organization.findUnique({
    where: { id: orgId },
    include: {
      memberships: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
  });
}

/**
 * Get organization by slug.
 */
export async function getOrganizationBySlug(slug: string) {
  const user = await getCurrentUser();
  if (!user) return null;

  const org = await db.organization.findUnique({
    where: { slug },
    include: {
      memberships: {
        where: { userId: user.id },
      },
    },
  });

  // Check if user is a member
  if (!org || org.memberships.length === 0) {
    return null;
  }

  return org;
}

/**
 * Toggle 2FA requirement for an organization.
 * Only available for Enterprise plans.
 * Only owners can change this setting.
 */
export async function setOrganization2FARequirement(
  orgId: string,
  require2FA: boolean
) {
  const hasAccess = await hasOrgAccess(orgId, ["owner"]);
  if (!hasAccess) {
    throw new Error("Only organization owners can manage 2FA requirements");
  }

  const user = await getCurrentUser();

  // Check if org is on Enterprise plan
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { plan: true, deletedAt: true },
  });

  if (!org) {
    throw new Error("Organization not found");
  }

  if (org.deletedAt) {
    throw new Error("Cannot update settings for an organization scheduled for deletion");
  }

  if (org.plan !== "enterprise") {
    throw new Error(
      "2FA enforcement is only available on the Enterprise plan. Please upgrade to enable this feature."
    );
  }

  const updatedOrg = await db.organization.update({
    where: { id: orgId },
    data: { require2FA },
  });

  await db.auditLog.create({
    data: {
      organizationId: orgId,
      userId: user!.id,
      action: "organization.updated",
      resourceType: "organization",
      resourceId: orgId,
      metadata: {
        setting: "require2FA",
        value: require2FA,
      },
    },
  });

  revalidatePath(`/org/${orgId}/settings`);
  return updatedOrg;
}

/**
 * Check if an organization requires 2FA.
 */
export async function getOrganization2FARequirement(orgId: string) {
  const hasAccess = await hasOrgAccess(orgId);
  if (!hasAccess) {
    return { required: false, plan: "free" as const, canEnforce: false };
  }

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { require2FA: true, plan: true },
  });

  if (!org) {
    return { required: false, plan: "free" as const, canEnforce: false };
  }

  return {
    required: org.require2FA,
    plan: org.plan,
    canEnforce: org.plan === "enterprise",
  };
}

/**
 * Check if user meets 2FA requirements for all their organizations.
 * Returns a list of organizations that require 2FA but user doesn't have it enabled.
 */
export async function checkUser2FACompliance() {
  const user = await getCurrentUser();
  if (!user) {
    return { compliant: true, nonCompliantOrgs: [] };
  }

  // Get all orgs that require 2FA
  const orgsRequiring2FA = await db.organization.findMany({
    where: {
      require2FA: true,
      deletedAt: null,
      memberships: {
        some: { userId: user.id },
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });

  // If no orgs require 2FA, user is compliant
  if (orgsRequiring2FA.length === 0) {
    return { compliant: true, nonCompliantOrgs: [] };
  }

  // User must check their own 2FA status via Clerk
  // This returns the list of orgs so the client can check
  return {
    compliant: false, // Caller should verify user.twoFactorEnabled
    nonCompliantOrgs: orgsRequiring2FA,
  };
}
