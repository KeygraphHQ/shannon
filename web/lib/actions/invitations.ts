"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser, hasOrgAccess, ORG_ROLES, OrgRole } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { sendInvitationEmail } from "@/lib/email";

// Team member limits by plan
const TEAM_LIMITS: Record<string, number> = {
  free: 1,
  pro: 5,
  enterprise: Infinity,
};

/**
 * Get the team member limit for a plan.
 */
export function getTeamLimit(plan: string): number {
  return TEAM_LIMITS[plan] || TEAM_LIMITS.free;
}

/**
 * Check if organization can add more members.
 */
export async function canAddTeamMember(orgId: string): Promise<{
  canAdd: boolean;
  currentCount: number;
  limit: number;
  plan: string;
}> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    include: {
      memberships: true,
      _count: {
        select: {
          invitations: {
            where: { status: "pending" },
          },
        },
      },
    },
  });

  if (!org) {
    throw new Error("Organization not found");
  }

  const currentCount = org.memberships.length;
  const pendingInvites = org._count.invitations;
  const limit = getTeamLimit(org.plan);
  const totalAfterInvite = currentCount + pendingInvites;

  return {
    canAdd: totalAfterInvite < limit,
    currentCount: currentCount + pendingInvites,
    limit,
    plan: org.plan,
  };
}

/**
 * Send a team invitation.
 */
export async function sendInvitation(
  orgId: string,
  email: string,
  role: OrgRole = ORG_ROLES.MEMBER
) {
  // Check permission
  const hasAccess = await hasOrgAccess(orgId, [ORG_ROLES.OWNER, ORG_ROLES.ADMIN]);
  if (!hasAccess) {
    throw new Error("Not authorized to invite members");
  }

  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Not authenticated");
  }

  // Check if organization exists and is not deleted
  const org = await db.organization.findUnique({
    where: { id: orgId },
    include: {
      memberships: {
        include: { user: true },
      },
    },
  });

  if (!org || org.deletedAt) {
    throw new Error("Organization not found or has been deleted");
  }

  // Check team member limits
  const { canAdd, limit, plan } = await canAddTeamMember(orgId);
  if (!canAdd) {
    throw new Error(
      `Team member limit reached (${limit} for ${plan} plan). Upgrade to add more members.`
    );
  }

  // Check if user is already a member
  const existingMember = org.memberships.find(
    (m) => m.user.email.toLowerCase() === email.toLowerCase()
  );
  if (existingMember) {
    throw new Error("This user is already a member of the organization");
  }

  // Check for existing pending invitation
  const existingInvite = await db.invitation.findFirst({
    where: {
      organizationId: orgId,
      email: email.toLowerCase(),
      status: "pending",
    },
  });

  if (existingInvite) {
    throw new Error("An invitation has already been sent to this email");
  }

  // Admins cannot invite owners
  const userRole = user.memberships.find((m) => m.organizationId === orgId)?.role;
  if (userRole === ORG_ROLES.ADMIN && role === ORG_ROLES.OWNER) {
    throw new Error("Only owners can invite other owners");
  }

  // Create invitation (expires in 7 days)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const invitation = await db.invitation.create({
    data: {
      email: email.toLowerCase(),
      organizationId: orgId,
      role,
      invitedById: user.id,
      expiresAt,
    },
  });

  // Log the invitation
  await createAuditLog({
    organizationId: orgId,
    userId: user.id,
    action: "member.invited",
    resourceType: "invitation",
    resourceId: invitation.id,
    metadata: {
      email: email.toLowerCase(),
      role,
      expiresAt: expiresAt.toISOString(),
    },
  });

  // Send invitation email
  await sendInvitationEmail({
    to: email.toLowerCase(),
    inviterName: user.name || user.email,
    organizationName: org.name,
    role,
    token: invitation.token,
  });

  revalidatePath(`/org/${orgId}/team`);
  return invitation;
}

/**
 * Resend an invitation.
 */
export async function resendInvitation(invitationId: string) {
  const invitation = await db.invitation.findUnique({
    where: { id: invitationId },
    include: {
      organization: true,
      invitedBy: true,
    },
  });

  if (!invitation) {
    throw new Error("Invitation not found");
  }

  if (invitation.status !== "pending") {
    throw new Error("Cannot resend a non-pending invitation");
  }

  // Check permission
  const hasAccess = await hasOrgAccess(invitation.organizationId, [
    ORG_ROLES.OWNER,
    ORG_ROLES.ADMIN,
  ]);
  if (!hasAccess) {
    throw new Error("Not authorized to resend invitations");
  }

  const user = await getCurrentUser();

  // Update expiration date
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await db.invitation.update({
    where: { id: invitationId },
    data: { expiresAt },
  });

  // Log the resend
  await createAuditLog({
    organizationId: invitation.organizationId,
    userId: user!.id,
    action: "member.invited",
    resourceType: "invitation",
    resourceId: invitation.id,
    metadata: {
      email: invitation.email,
      role: invitation.role,
      expiresAt: expiresAt.toISOString(),
      resent: true,
    },
  });

  // Resend email
  await sendInvitationEmail({
    to: invitation.email,
    inviterName: invitation.invitedBy.name || invitation.invitedBy.email,
    organizationName: invitation.organization.name,
    role: invitation.role as OrgRole,
    token: invitation.token,
  });

  revalidatePath(`/org/${invitation.organizationId}/team`);
  return { success: true };
}

/**
 * Revoke an invitation.
 */
export async function revokeInvitation(invitationId: string) {
  const invitation = await db.invitation.findUnique({
    where: { id: invitationId },
  });

  if (!invitation) {
    throw new Error("Invitation not found");
  }

  if (invitation.status !== "pending") {
    throw new Error("Cannot revoke a non-pending invitation");
  }

  // Check permission
  const hasAccess = await hasOrgAccess(invitation.organizationId, [
    ORG_ROLES.OWNER,
    ORG_ROLES.ADMIN,
  ]);
  if (!hasAccess) {
    throw new Error("Not authorized to revoke invitations");
  }

  const user = await getCurrentUser();

  await db.invitation.update({
    where: { id: invitationId },
    data: { status: "revoked" },
  });

  await createAuditLog({
    organizationId: invitation.organizationId,
    userId: user!.id,
    action: "member.removed",
    resourceType: "invitation",
    resourceId: invitation.id,
    metadata: {
      email: invitation.email,
      revoked: true,
    },
  });

  revalidatePath(`/org/${invitation.organizationId}/team`);
  return { success: true };
}

/**
 * Get invitation by token (for acceptance page).
 */
export async function getInvitationByToken(token: string) {
  const invitation = await db.invitation.findUnique({
    where: { token },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
        },
      },
      invitedBy: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  if (!invitation) {
    return null;
  }

  // Check if expired
  if (invitation.expiresAt < new Date()) {
    return { ...invitation, status: "expired" as const };
  }

  return invitation;
}

/**
 * Accept an invitation.
 */
export async function acceptInvitation(token: string) {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Not authenticated");
  }

  const invitation = await db.invitation.findUnique({
    where: { token },
    include: {
      organization: true,
    },
  });

  if (!invitation) {
    throw new Error("Invitation not found");
  }

  if (invitation.status !== "pending") {
    throw new Error(`Invitation has already been ${invitation.status}`);
  }

  if (invitation.expiresAt < new Date()) {
    await db.invitation.update({
      where: { id: invitation.id },
      data: { status: "expired" },
    });
    throw new Error("Invitation has expired");
  }

  // Check if invitation is for this user
  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new Error("This invitation was sent to a different email address");
  }

  // Check if user is already a member
  const existingMembership = await db.organizationMembership.findFirst({
    where: {
      userId: user.id,
      organizationId: invitation.organizationId,
    },
  });

  if (existingMembership) {
    await db.invitation.update({
      where: { id: invitation.id },
      data: { status: "accepted", acceptedAt: new Date() },
    });
    throw new Error("You are already a member of this organization");
  }

  // Accept invitation and create membership
  await db.$transaction(async (tx) => {
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { status: "accepted", acceptedAt: new Date() },
    });

    await tx.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId: invitation.organizationId,
        role: invitation.role,
      },
    });
  });

  await createAuditLog({
    organizationId: invitation.organizationId,
    userId: user.id,
    action: "member.joined",
    resourceType: "user",
    resourceId: user.id,
    metadata: {
      email: user.email,
      role: invitation.role,
      invitationId: invitation.id,
    },
  });

  revalidatePath("/dashboard");
  return invitation.organization;
}

/**
 * Get pending invitations for an organization.
 */
export async function getPendingInvitations(orgId: string) {
  const hasAccess = await hasOrgAccess(orgId);
  if (!hasAccess) {
    throw new Error("Not authorized");
  }

  return db.invitation.findMany({
    where: {
      organizationId: orgId,
      status: "pending",
    },
    include: {
      invitedBy: {
        select: {
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
