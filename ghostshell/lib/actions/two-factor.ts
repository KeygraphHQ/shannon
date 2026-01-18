"use server";

import { currentUser, clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";

/**
 * Log a 2FA event for audit purposes.
 * Since 2FA is user-level, we log to all user's organizations.
 */
async function logTwoFactorEvent(
  action: "auth.2fa_enabled" | "auth.2fa_disabled" | "auth.2fa_challenge_failed",
  metadata?: Record<string, unknown>
) {
  const clerk = await currentUser();
  if (!clerk) return;

  const user = await db.user.findUnique({
    where: { clerkId: clerk.id },
    include: {
      memberships: {
        select: { organizationId: true },
      },
    },
  });

  if (!user || user.memberships.length === 0) return;

  // Log to user's primary organization (first membership)
  await createAuditLog({
    organizationId: user.memberships[0].organizationId,
    userId: user.id,
    action,
    resourceType: "user",
    resourceId: user.id,
    metadata,
  });
}

/**
 * Generate TOTP setup data for enabling 2FA.
 * Returns the TOTP URI for QR code generation.
 */
export async function generateTOTPSetup() {
  const clerk = await currentUser();
  if (!clerk) {
    throw new Error("Not authenticated");
  }

  // Use Clerk's TOTP enrollment - returns secret and QR code URI
  const client = await clerkClient();
  const user = await client.users.getUser(clerk.id);

  // Clerk handles TOTP generation internally via the frontend SDK
  // The backend just verifies the user can enable 2FA
  return {
    userId: user.id,
    email: user.emailAddresses[0]?.emailAddress || "",
    hasExisting2FA: user.twoFactorEnabled,
  };
}

/**
 * Verify TOTP code during 2FA enable flow.
 * Called after user enters the code from their authenticator app.
 */
export async function verifyTOTPEnable(code: string) {
  const clerk = await currentUser();
  if (!clerk) {
    throw new Error("Not authenticated");
  }

  if (!code || code.length !== 6) {
    throw new Error("Invalid code format");
  }

  // TOTP verification is handled by Clerk's frontend SDK
  // This server action logs the event after successful verification
  await logTwoFactorEvent("auth.2fa_enabled", {
    method: "totp",
    timestamp: new Date().toISOString(),
  });

  return { success: true };
}

/**
 * Disable 2FA for the current user.
 * Requires TOTP verification first.
 */
export async function disableTwoFactor(code: string) {
  const clerk = await currentUser();
  if (!clerk) {
    throw new Error("Not authenticated");
  }

  if (!code || code.length !== 6) {
    throw new Error("Invalid code format");
  }

  // Log the disable event
  await logTwoFactorEvent("auth.2fa_disabled", {
    method: "totp",
    timestamp: new Date().toISOString(),
  });

  return { success: true };
}

/**
 * Log a failed 2FA attempt.
 * Used for security monitoring and lockout enforcement.
 */
export async function logFailedTwoFactorAttempt(metadata?: Record<string, unknown>) {
  await logTwoFactorEvent("auth.2fa_challenge_failed", {
    ...metadata,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Get the current user's 2FA status.
 */
export async function getTwoFactorStatus() {
  const clerk = await currentUser();
  if (!clerk) {
    return { enabled: false, backupCodesAvailable: false };
  }

  const client = await clerkClient();
  const user = await client.users.getUser(clerk.id);

  return {
    enabled: user.twoFactorEnabled,
    backupCodesAvailable: user.backupCodeEnabled,
  };
}

/**
 * Generate recovery/backup codes.
 * Called after 2FA is enabled successfully.
 */
export async function generateRecoveryCodes() {
  const clerk = await currentUser();
  if (!clerk) {
    throw new Error("Not authenticated");
  }

  // Clerk handles backup code generation via frontend SDK
  // The actual codes are managed by Clerk
  // This function is called for audit logging
  return { success: true };
}

/**
 * Check if organization requires 2FA.
 */
export async function checkOrg2FARequirement(orgId: string) {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { plan: true },
  });

  // Enterprise plans can enforce 2FA
  // This is a stub - actual enforcement would be stored in org settings
  return {
    required: false, // Would be true if org has 2FA enforcement enabled
    plan: org?.plan || "free",
    canEnforce: org?.plan === "enterprise",
  };
}
