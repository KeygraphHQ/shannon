"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { cookies } from "next/headers";

interface UpdateProfileInput {
  name?: string;
  avatarUrl?: string;
}

export async function updateUserProfile(input: UpdateProfileInput) {
  const { userId: clerkUserId } = await auth();

  if (!clerkUserId) {
    return { error: "Unauthorized" };
  }

  // Get user from database
  const user = await db.user.findUnique({
    where: { clerkId: clerkUserId },
    include: {
      memberships: {
        include: {
          organization: true,
        },
      },
    },
  });

  if (!user) {
    return { error: "User not found" };
  }

  // Update user in database
  const updatedUser = await db.user.update({
    where: { id: user.id },
    data: {
      name: input.name,
      avatarUrl: input.avatarUrl,
    },
  });

  // Update Clerk user name
  if (input.name) {
    const clerk = await clerkClient();
    const nameParts = input.name.split(" ");
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    await clerk.users.updateUser(clerkUserId, {
      firstName,
      lastName,
    });
  }

  // Create audit log for profile update
  const cookieStore = await cookies();
  const currentOrgCookie = cookieStore.get("current_org")?.value;
  const currentOrgId =
    user.memberships.find((m) => m.organizationId === currentOrgCookie)
      ?.organizationId || user.memberships[0]?.organizationId;

  if (currentOrgId) {
    await createAuditLog({
      organizationId: currentOrgId,
      userId: user.id,
      action: "user.updated",
      resourceType: "user",
      resourceId: user.id,
      metadata: {
        changes: Object.keys(input),
      },
    });
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/settings/account");

  return { success: true, user: updatedUser };
}

export async function getCurrentUserProfile() {
  const { userId: clerkUserId } = await auth();

  if (!clerkUserId) {
    return null;
  }

  const user = await db.user.findUnique({
    where: { clerkId: clerkUserId },
    include: {
      memberships: {
        include: {
          organization: true,
        },
      },
    },
  });

  return user;
}

/**
 * Export all user data (GDPR Article 20 - Right to data portability)
 * Returns all personal data associated with the user in JSON format.
 */
export async function exportUserData(): Promise<{
  success?: boolean;
  data?: object;
  error?: string;
}> {
  const { userId: clerkUserId } = await auth();

  if (!clerkUserId) {
    return { error: "Unauthorized" };
  }

  const user = await db.user.findUnique({
    where: { clerkId: clerkUserId },
    include: {
      memberships: {
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
              plan: true,
              createdAt: true,
            },
          },
        },
      },
      auditLogs: {
        orderBy: { createdAt: "desc" },
        take: 1000, // Limit for performance
      },
      invitations: {
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });

  if (!user) {
    return { error: "User not found" };
  }

  // Structure the export data
  const exportData = {
    exportDate: new Date().toISOString(),
    exportType: "GDPR_DATA_EXPORT",
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    },
    organizations: user.memberships.map((m) => ({
      organizationId: m.organization.id,
      organizationName: m.organization.name,
      role: m.role,
      joinedAt: m.createdAt.toISOString(),
      lastActiveAt: m.lastActiveAt?.toISOString() || null,
    })),
    invitationsSent: user.invitations,
    activityLog: user.auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      resourceType: log.resourceType,
      timestamp: log.createdAt.toISOString(),
      metadata: log.metadata,
    })),
  };

  // Log the data export
  const cookieStore = await cookies();
  const currentOrgCookie = cookieStore.get("current_org")?.value;
  const currentOrgId =
    user.memberships.find((m) => m.organizationId === currentOrgCookie)
      ?.organizationId || user.memberships[0]?.organizationId;

  if (currentOrgId) {
    await createAuditLog({
      organizationId: currentOrgId,
      userId: user.id,
      action: "user.data_exported",
      resourceType: "user",
      resourceId: user.id,
      metadata: {
        exportType: "GDPR",
        recordCount: {
          organizations: user.memberships.length,
          auditLogs: user.auditLogs.length,
          invitations: user.invitations.length,
        },
      },
    });
  }

  return { success: true, data: exportData };
}

/**
 * Delete account (GDPR Article 17 - Right to erasure)
 * Permanently deletes the user account and all associated data.
 */
export async function deleteAccount(): Promise<{
  success?: boolean;
  error?: string;
}> {
  const { userId: clerkUserId } = await auth();

  if (!clerkUserId) {
    return { error: "Unauthorized" };
  }

  const user = await db.user.findUnique({
    where: { clerkId: clerkUserId },
    include: {
      memberships: {
        include: {
          organization: {
            include: {
              memberships: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    return { error: "User not found" };
  }

  // Check if user is the only owner of any organization
  for (const membership of user.memberships) {
    if (membership.role === "owner") {
      const ownerCount = membership.organization.memberships.filter(
        (m) => m.role === "owner"
      ).length;

      if (ownerCount === 1) {
        return {
          error: `You are the only owner of "${membership.organization.name}". Please transfer ownership or delete the organization before deleting your account.`,
        };
      }
    }
  }

  // Log the deletion request before deleting (for compliance)
  // Note: This log will be deleted with the user due to cascade
  // In production, you might want to keep a separate GDPR compliance log
  const cookieStore = await cookies();
  const currentOrgCookie = cookieStore.get("current_org")?.value;
  const currentOrgId =
    user.memberships.find((m) => m.organizationId === currentOrgCookie)
      ?.organizationId || user.memberships[0]?.organizationId;

  if (currentOrgId) {
    await createAuditLog({
      organizationId: currentOrgId,
      userId: user.id,
      action: "user.deletion_requested",
      resourceType: "user",
      resourceId: user.id,
      metadata: {
        gdprRequest: true,
        email: user.email,
        membershipCount: user.memberships.length,
      },
    });
  }

  // Delete user from database (cascades to memberships, audit logs referencing this user)
  await db.user.delete({
    where: { id: user.id },
  });

  // Delete user from Clerk
  const clerk = await clerkClient();
  await clerk.users.deleteUser(clerkUserId);

  return { success: true };
}

/**
 * Request account deletion with confirmation period (optional safety measure)
 * Schedules account for deletion after a grace period.
 */
export async function requestAccountDeletion(
  confirmationPhrase: string
): Promise<{
  success?: boolean;
  scheduledAt?: string;
  error?: string;
}> {
  // Require exact confirmation phrase for safety
  if (confirmationPhrase !== "DELETE MY ACCOUNT") {
    return {
      error: "Please type 'DELETE MY ACCOUNT' exactly to confirm deletion",
    };
  }

  const { userId: clerkUserId } = await auth();

  if (!clerkUserId) {
    return { error: "Unauthorized" };
  }

  const user = await db.user.findUnique({
    where: { clerkId: clerkUserId },
    include: {
      memberships: {
        include: {
          organization: {
            include: {
              memberships: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    return { error: "User not found" };
  }

  // Check ownership constraints
  for (const membership of user.memberships) {
    if (membership.role === "owner") {
      const ownerCount = membership.organization.memberships.filter(
        (m) => m.role === "owner"
      ).length;

      if (ownerCount === 1) {
        return {
          error: `You are the only owner of "${membership.organization.name}". Please transfer ownership or delete the organization first.`,
        };
      }
    }
  }

  // For immediate deletion (current implementation)
  // In production, you might want to add a grace period
  const result = await deleteAccount();

  if (result.error) {
    return { error: result.error };
  }

  return {
    success: true,
    scheduledAt: new Date().toISOString(),
  };
}
