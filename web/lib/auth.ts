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
 */
export async function getUserOrganizations() {
  const user = await getCurrentUser();
  if (!user) return [];

  return user.memberships.map((m) => ({
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
