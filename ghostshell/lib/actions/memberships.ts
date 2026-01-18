"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser, hasOrgAccess, ORG_ROLES, OrgRole, getUserOrgRole } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";

/**
 * Get the number of owners in an organization.
 */
async function getOwnerCount(orgId: string): Promise<number> {
  const count = await db.organizationMembership.count({
    where: {
      organizationId: orgId,
      role: ORG_ROLES.OWNER,
    },
  });
  return count;
}

/**
 * Check if a member is the last owner of an organization.
 */
async function isLastOwner(orgId: string, userId: string): Promise<boolean> {
  const membership = await db.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId: orgId,
      },
    },
  });

  if (!membership || membership.role !== ORG_ROLES.OWNER) {
    return false;
  }

  const ownerCount = await getOwnerCount(orgId);
  return ownerCount === 1;
}

/**
 * Get team members for an organization.
 */
export async function getTeamMembers(orgId: string) {
  const hasAccess = await hasOrgAccess(orgId);
  if (!hasAccess) {
    throw new Error("Not authorized");
  }

  return db.organizationMembership.findMany({
    where: { organizationId: orgId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          createdAt: true,
        },
      },
    },
    orderBy: [
      { role: "asc" },
      { createdAt: "asc" },
    ],
  });
}

/**
 * Change a team member's role.
 */
export async function changeMemberRole(
  orgId: string,
  targetUserId: string,
  newRole: OrgRole
) {
  // Check permission - only owners and admins can change roles
  const hasAccess = await hasOrgAccess(orgId, [ORG_ROLES.OWNER, ORG_ROLES.ADMIN]);
  if (!hasAccess) {
    throw new Error("Not authorized to change member roles");
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("Not authenticated");
  }

  const currentUserRole = await getUserOrgRole(orgId);

  // Cannot change your own role
  if (currentUser.id === targetUserId) {
    throw new Error("You cannot change your own role");
  }

  // Get target membership
  const targetMembership = await db.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: targetUserId,
        organizationId: orgId,
      },
    },
    include: {
      user: true,
    },
  });

  if (!targetMembership) {
    throw new Error("Member not found");
  }

  // Admins cannot change owner roles
  if (currentUserRole === ORG_ROLES.ADMIN) {
    if (targetMembership.role === ORG_ROLES.OWNER) {
      throw new Error("Only owners can change other owner roles");
    }
    if (newRole === ORG_ROLES.OWNER) {
      throw new Error("Only owners can promote to owner role");
    }
  }

  // Last owner protection - prevent demotion of last owner
  if (
    targetMembership.role === ORG_ROLES.OWNER &&
    newRole !== ORG_ROLES.OWNER
  ) {
    const isLast = await isLastOwner(orgId, targetUserId);
    if (isLast) {
      throw new Error(
        "Cannot demote the last owner. Promote another member to owner first."
      );
    }
  }

  const oldRole = targetMembership.role;

  // Update role
  await db.organizationMembership.update({
    where: {
      userId_organizationId: {
        userId: targetUserId,
        organizationId: orgId,
      },
    },
    data: { role: newRole },
  });

  // Log the role change
  await createAuditLog({
    organizationId: orgId,
    userId: currentUser.id,
    action: "member.role_changed",
    resourceType: "user",
    resourceId: targetUserId,
    metadata: {
      email: targetMembership.user.email,
      oldRole,
      newRole,
    },
  });

  revalidatePath(`/org/${orgId}/team`);
  return { success: true };
}

/**
 * Remove a team member from the organization.
 */
export async function removeMember(orgId: string, targetUserId: string) {
  // Check permission - only owners and admins can remove members
  const hasAccess = await hasOrgAccess(orgId, [ORG_ROLES.OWNER, ORG_ROLES.ADMIN]);
  if (!hasAccess) {
    throw new Error("Not authorized to remove members");
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("Not authenticated");
  }

  const currentUserRole = await getUserOrgRole(orgId);

  // Cannot remove yourself
  if (currentUser.id === targetUserId) {
    throw new Error("You cannot remove yourself from the organization");
  }

  // Get target membership
  const targetMembership = await db.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: targetUserId,
        organizationId: orgId,
      },
    },
    include: {
      user: true,
    },
  });

  if (!targetMembership) {
    throw new Error("Member not found");
  }

  // Admins cannot remove owners
  if (
    currentUserRole === ORG_ROLES.ADMIN &&
    targetMembership.role === ORG_ROLES.OWNER
  ) {
    throw new Error("Only owners can remove other owners");
  }

  // Last owner protection - prevent removal of last owner
  if (targetMembership.role === ORG_ROLES.OWNER) {
    const isLast = await isLastOwner(orgId, targetUserId);
    if (isLast) {
      throw new Error(
        "Cannot remove the last owner. Promote another member to owner first or delete the organization."
      );
    }
  }

  // Remove membership
  await db.organizationMembership.delete({
    where: {
      userId_organizationId: {
        userId: targetUserId,
        organizationId: orgId,
      },
    },
  });

  // Log the removal
  await createAuditLog({
    organizationId: orgId,
    userId: currentUser.id,
    action: "member.removed",
    resourceType: "user",
    resourceId: targetUserId,
    metadata: {
      email: targetMembership.user.email,
      role: targetMembership.role,
    },
  });

  revalidatePath(`/org/${orgId}/team`);
  return { success: true };
}

/**
 * Leave an organization.
 */
export async function leaveOrganization(orgId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("Not authenticated");
  }

  const membership = await db.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: currentUser.id,
        organizationId: orgId,
      },
    },
  });

  if (!membership) {
    throw new Error("You are not a member of this organization");
  }

  // Last owner protection
  if (membership.role === ORG_ROLES.OWNER) {
    const isLast = await isLastOwner(orgId, currentUser.id);
    if (isLast) {
      throw new Error(
        "You are the last owner. Promote another member to owner first or delete the organization."
      );
    }
  }

  // Check if user has other organizations
  const userOrgs = currentUser.memberships.filter(
    (m) => m.organizationId !== orgId && !m.organization.deletedAt
  );

  if (userOrgs.length === 0) {
    throw new Error(
      "You cannot leave your only organization. Create a new organization first."
    );
  }

  // Remove membership
  await db.organizationMembership.delete({
    where: {
      userId_organizationId: {
        userId: currentUser.id,
        organizationId: orgId,
      },
    },
  });

  // Log the departure
  await createAuditLog({
    organizationId: orgId,
    userId: currentUser.id,
    action: "member.removed",
    resourceType: "user",
    resourceId: currentUser.id,
    metadata: {
      email: currentUser.email,
      role: membership.role,
      selfRemoved: true,
    },
  });

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Update member's last active timestamp.
 */
export async function updateLastActive(orgId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  await db.organizationMembership.updateMany({
    where: {
      userId: currentUser.id,
      organizationId: orgId,
    },
    data: {
      lastActiveAt: new Date(),
    },
  });
}
