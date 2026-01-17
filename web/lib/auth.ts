import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "./db";

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

/**
 * Organization roles in order of permission level (highest to lowest).
 */
export const ORG_ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member",
  VIEWER: "viewer",
} as const;

export type OrgRole = (typeof ORG_ROLES)[keyof typeof ORG_ROLES];

/**
 * Role hierarchy for permission checking.
 * Higher index = more permissions.
 */
const ROLE_HIERARCHY: OrgRole[] = ["viewer", "member", "admin", "owner"];

/**
 * Check if a role has at least the minimum required permission level.
 */
export function hasMinimumRole(userRole: string, minimumRole: OrgRole): boolean {
  const userRoleIndex = ROLE_HIERARCHY.indexOf(userRole as OrgRole);
  const minimumRoleIndex = ROLE_HIERARCHY.indexOf(minimumRole);

  if (userRoleIndex === -1 || minimumRoleIndex === -1) {
    return false;
  }

  return userRoleIndex >= minimumRoleIndex;
}

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
 * Permission definitions for organization actions.
 */
export const ORG_PERMISSIONS = {
  // Organization settings
  VIEW_ORG_SETTINGS: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN],
  EDIT_ORG_SETTINGS: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN],
  DELETE_ORG: [ORG_ROLES.OWNER],

  // Team management
  VIEW_TEAM: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN, ORG_ROLES.MEMBER, ORG_ROLES.VIEWER],
  INVITE_MEMBER: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN],
  REMOVE_MEMBER: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN],
  CHANGE_ROLE: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN],

  // Scans
  VIEW_SCANS: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN, ORG_ROLES.MEMBER, ORG_ROLES.VIEWER],
  CREATE_SCAN: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN, ORG_ROLES.MEMBER],
  DELETE_SCAN: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN],

  // Audit logs
  VIEW_AUDIT_LOG: [ORG_ROLES.OWNER, ORG_ROLES.ADMIN],
} as const;

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
