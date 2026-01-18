import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "./db";
import { ORG_ROLES, ORG_PERMISSIONS, hasMinimumRole } from "./auth-types";
import type { OrgRole } from "./auth-types";

/**
 * Get the current user from the database.
 * Creates the user if they don't exist (race condition with webhook).
 */
export async function getCurrentUser() {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  let user = await db.user.findUnique({
    where: { clerkId: userId },
    include: {
      memberships: {
        include: {
          organization: true,
        },
      },
    },
  });

  // If user doesn't exist yet (webhook hasn't processed), create them
  if (!user) {
    const clerkUser = await currentUser();
    if (!clerkUser) return null;

    const email = clerkUser.emailAddresses[0]?.emailAddress;
    if (!email) return null;

    const name =
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
      null;

    // Create user and default org
    const baseName = name || email.split("@")[0];
    const slug = baseName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    try {
      user = await db.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            clerkId: userId,
            email,
            name,
            avatarUrl: clerkUser.imageUrl,
          },
        });

        const org = await tx.organization.create({
          data: {
            name: `${baseName}'s Workspace`,
            slug: `${slug}-${Date.now().toString(36)}`,
            plan: "free",
          },
        });

        await tx.organizationMembership.create({
          data: {
            userId: newUser.id,
            organizationId: org.id,
            role: "owner",
          },
        });

        return tx.user.findUnique({
          where: { id: newUser.id },
          include: {
            memberships: {
              include: {
                organization: true,
              },
            },
          },
        });
      });
    } catch (error) {
      // Handle race condition: another request created the user concurrently
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code: string }).code === "P2002"
      ) {
        // Re-fetch the user that was created by the other request
        user = await db.user.findUnique({
          where: { clerkId: userId },
          include: {
            memberships: {
              include: {
                organization: true,
              },
            },
          },
        });
      } else {
        throw error;
      }
    }
  }

  return user;
}

/**
 * Get the current user's organizations.
 * By default, excludes organizations scheduled for deletion unless they're within the grace period.
 */
export async function getUserOrganizations(options?: { includeDeleted?: boolean }) {
  const user = await getCurrentUser();
  if (!user) return [];

  return user.memberships
    .filter((m) => {
      // Always include non-deleted orgs
      if (!m.organization.deletedAt) return true;
      // Include deleted orgs only if requested (for settings/cancellation)
      return options?.includeDeleted === true;
    })
    .map((m) => ({
      ...m.organization,
      role: m.role,
    }));
}

/**
 * Check if the current user has access to an organization.
 */
export async function hasOrgAccess(orgId: string, requiredRole?: string[]) {
  const user = await getCurrentUser();
  if (!user) return false;

  const membership = user.memberships.find((m) => m.organizationId === orgId);
  if (!membership) return false;

  if (requiredRole && !requiredRole.includes(membership.role)) {
    return false;
  }

  return true;
}

// Re-export types and constants from auth-types (safe for client components)
export { ORG_ROLES, ROLE_HIERARCHY, hasMinimumRole, ORG_PERMISSIONS } from "./auth-types";
export type { OrgRole } from "./auth-types";

/**
 * Get the user's role in an organization.
 */
export async function getUserOrgRole(orgId: string): Promise<OrgRole | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const membership = user.memberships.find((m) => m.organizationId === orgId);
  if (!membership) return null;

  return membership.role as OrgRole;
}

/**
 * Check if the current user can manage the organization (owner or admin).
 */
export async function canManageOrg(orgId: string): Promise<boolean> {
  const role = await getUserOrgRole(orgId);
  if (!role) return false;
  return hasMinimumRole(role, ORG_ROLES.ADMIN);
}

/**
 * Check if the current user is the owner of the organization.
 */
export async function isOrgOwner(orgId: string): Promise<boolean> {
  const role = await getUserOrgRole(orgId);
  return role === ORG_ROLES.OWNER;
}

/**
 * Check if the current user can view the organization.
 */
export async function canViewOrg(orgId: string): Promise<boolean> {
  const role = await getUserOrgRole(orgId);
  if (!role) return false;
  return hasMinimumRole(role, ORG_ROLES.VIEWER);
}

/**
 * Check if the user has a specific permission.
 */
export async function hasOrgPermission(
  orgId: string,
  permission: keyof typeof ORG_PERMISSIONS
): Promise<boolean> {
  const role = await getUserOrgRole(orgId);
  if (!role) return false;

  const allowedRoles = ORG_PERMISSIONS[permission];
  return (allowedRoles as readonly string[]).includes(role);
}
