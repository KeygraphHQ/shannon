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

export async function deleteAccount() {
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
          error: `You are the only owner of "${membership.organization.name}". Please transfer ownership before deleting your account.`,
        };
      }
    }
  }

  // Delete user from database (cascades to memberships)
  await db.user.delete({
    where: { id: user.id },
  });

  // Delete user from Clerk
  const clerk = await clerkClient();
  await clerk.users.deleteUser(clerkUserId);

  return { success: true };
}
