"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser, hasOrgAccess } from "@/lib/auth";
import { encryptCredentials, decryptCredentials } from "@/lib/encryption";
import type { AuthMethod } from "@/lib/types/auth";

export interface AuthConfigInput {
  method: AuthMethod;
  // Form-based auth
  loginUrl?: string;
  username?: string;
  password?: string;
  usernameSelector?: string;
  passwordSelector?: string;
  submitSelector?: string;
  successIndicator?: string;
  // TOTP
  totpEnabled?: boolean;
  totpSecret?: string;
  totpSelector?: string;
  // API Token
  apiToken?: string;
}

export interface AuthConfigResponse {
  method: AuthMethod;
  loginUrl: string | null;
  usernameSelector: string | null;
  passwordSelector: string | null;
  submitSelector: string | null;
  successIndicator: string | null;
  hasCredentials: boolean;
  totpEnabled: boolean;
  totpSelector: string | null;
  lastValidatedAt: Date | null;
  validationStatus: string | null;
}

/**
 * Get authentication configuration for a project.
 * Returns config with credentials masked.
 */
export async function getAuthConfig(
  orgId: string,
  projectId: string
): Promise<AuthConfigResponse | null> {
  const hasAccess = await hasOrgAccess(orgId);
  if (!hasAccess) {
    return null;
  }

  const project = await db.project.findFirst({
    where: {
      id: projectId,
      organizationId: orgId,
    },
    include: {
      authenticationConfig: true,
    },
  });

  if (!project) {
    return null;
  }

  const config = project.authenticationConfig;
  if (!config) {
    return {
      method: "NONE",
      loginUrl: null,
      usernameSelector: null,
      passwordSelector: null,
      submitSelector: null,
      successIndicator: null,
      hasCredentials: false,
      totpEnabled: false,
      totpSelector: null,
      lastValidatedAt: null,
      validationStatus: null,
    };
  }

  return {
    method: config.method,
    loginUrl: config.loginUrl,
    usernameSelector: config.usernameSelector,
    passwordSelector: config.passwordSelector,
    submitSelector: config.submitSelector,
    successIndicator: config.successIndicator,
    hasCredentials: !!config.encryptedCredentials,
    totpEnabled: config.totpEnabled,
    totpSelector: config.totpSelector,
    lastValidatedAt: config.lastValidatedAt,
    validationStatus: config.validationStatus,
  };
}

/**
 * Save authentication configuration for a project.
 * Encrypts credentials before storage.
 */
export async function saveAuthConfig(
  orgId: string,
  projectId: string,
  input: AuthConfigInput
): Promise<AuthConfigResponse> {
  const hasAccess = await hasOrgAccess(orgId, ["owner", "admin", "member"]);
  if (!hasAccess) {
    throw new Error("Not authorized");
  }

  const user = await getCurrentUser();
  if (!user) {
    throw new Error("User not found");
  }

  // Verify project belongs to org
  const project = await db.project.findFirst({
    where: {
      id: projectId,
      organizationId: orgId,
    },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  // Validate method-specific fields
  if (input.method === "FORM" && !input.loginUrl) {
    throw new Error("Login URL is required for form authentication");
  }

  // Build credentials object to encrypt
  const credentials: Record<string, string> = {};
  if (input.username) credentials.username = input.username;
  if (input.password) credentials.password = input.password;
  if (input.apiToken) credentials.apiToken = input.apiToken;
  if (input.totpSecret) credentials.totpSecret = input.totpSecret;

  // Encrypt credentials
  const encryptedCredentials =
    Object.keys(credentials).length > 0
      ? encryptCredentials(credentials, orgId)
      : "";

  // Upsert auth config
  const config = await db.$transaction(async (tx) => {
    const authConfig = await tx.authenticationConfig.upsert({
      where: { projectId },
      create: {
        projectId,
        method: input.method,
        encryptedCredentials,
        loginUrl: input.loginUrl || null,
        usernameSelector: input.usernameSelector || null,
        passwordSelector: input.passwordSelector || null,
        submitSelector: input.submitSelector || null,
        successIndicator: input.successIndicator || null,
        totpEnabled: input.totpEnabled || false,
        totpSelector: input.totpSelector || null,
        validationStatus: "untested",
      },
      update: {
        method: input.method,
        encryptedCredentials,
        loginUrl: input.loginUrl || null,
        usernameSelector: input.usernameSelector || null,
        passwordSelector: input.passwordSelector || null,
        submitSelector: input.submitSelector || null,
        successIndicator: input.successIndicator || null,
        totpEnabled: input.totpEnabled || false,
        totpSelector: input.totpSelector || null,
        validationStatus: "untested",
        lastValidatedAt: null,
      },
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        userId: user.id,
        action: "auth.configured",
        resourceType: "project",
        resourceId: projectId,
        metadata: {
          method: input.method,
          totpEnabled: input.totpEnabled || false,
        },
      },
    });

    return authConfig;
  });

  revalidatePath(`/projects/${projectId}/settings`);

  return {
    method: config.method,
    loginUrl: config.loginUrl,
    usernameSelector: config.usernameSelector,
    passwordSelector: config.passwordSelector,
    submitSelector: config.submitSelector,
    successIndicator: config.successIndicator,
    hasCredentials: !!config.encryptedCredentials,
    totpEnabled: config.totpEnabled,
    totpSelector: config.totpSelector,
    lastValidatedAt: config.lastValidatedAt,
    validationStatus: config.validationStatus,
  };
}

/**
 * Delete authentication configuration for a project.
 */
export async function deleteAuthConfig(
  orgId: string,
  projectId: string
): Promise<void> {
  const hasAccess = await hasOrgAccess(orgId, ["owner", "admin", "member"]);
  if (!hasAccess) {
    throw new Error("Not authorized");
  }

  const user = await getCurrentUser();
  if (!user) {
    throw new Error("User not found");
  }

  // Verify project belongs to org
  const project = await db.project.findFirst({
    where: {
      id: projectId,
      organizationId: orgId,
    },
    include: {
      authenticationConfig: true,
    },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  if (!project.authenticationConfig) {
    return;
  }

  await db.$transaction(async (tx) => {
    await tx.authenticationConfig.delete({
      where: { projectId },
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        userId: user.id,
        action: "auth.removed",
        resourceType: "project",
        resourceId: projectId,
        metadata: {
          previousMethod: project.authenticationConfig?.method,
        },
      },
    });
  });

  revalidatePath(`/projects/${projectId}/settings`);
}

/**
 * Validate authentication configuration.
 * Triggers validation workflow and updates status.
 */
export async function validateAuthConfig(
  orgId: string,
  projectId: string
): Promise<{ valid: boolean; error: string | null; validatedAt: Date }> {
  const hasAccess = await hasOrgAccess(orgId, ["owner", "admin", "member"]);
  if (!hasAccess) {
    throw new Error("Not authorized");
  }

  const user = await getCurrentUser();
  if (!user) {
    throw new Error("User not found");
  }

  // Get project with auth config
  const project = await db.project.findFirst({
    where: {
      id: projectId,
      organizationId: orgId,
    },
    include: {
      authenticationConfig: true,
    },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const config = project.authenticationConfig;
  if (!config) {
    throw new Error("No authentication configured");
  }

  if (config.method === "NONE") {
    return {
      valid: true,
      error: null,
      validatedAt: new Date(),
    };
  }

  // Decrypt credentials for validation
  let credentials: Record<string, string> = {};
  if (config.encryptedCredentials) {
    try {
      credentials = decryptCredentials(config.encryptedCredentials, orgId);
    } catch {
      return {
        valid: false,
        error: "Failed to decrypt credentials. Please re-enter them.",
        validatedAt: new Date(),
      };
    }
  }

  // Perform basic validation
  let validationResult: { valid: boolean; error: string | null };

  switch (config.method) {
    case "FORM":
      validationResult = await validateFormAuthBasic(config, credentials);
      break;
    case "API_TOKEN":
      validationResult = validateApiTokenBasic(credentials);
      break;
    case "BASIC":
      validationResult = validateBasicAuthBasic(credentials);
      break;
    case "SSO":
      validationResult = {
        valid: false,
        error: "SSO validation must be performed manually",
      };
      break;
    default:
      validationResult = { valid: false, error: "Unknown auth method" };
  }

  const now = new Date();

  // Update validation status
  await db.$transaction(async (tx) => {
    await tx.authenticationConfig.update({
      where: { projectId },
      data: {
        lastValidatedAt: now,
        validationStatus: validationResult.valid ? "valid" : "invalid",
      },
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        userId: user.id,
        action: "auth.validated",
        resourceType: "project",
        resourceId: projectId,
        metadata: {
          method: config.method,
          valid: validationResult.valid,
          error: validationResult.error,
        },
      },
    });
  });

  revalidatePath(`/projects/${projectId}/settings`);

  return {
    valid: validationResult.valid,
    error: validationResult.error,
    validatedAt: now,
  };
}

// Basic validation helpers (full validation via Temporal activity)
function validateFormAuthBasic(
  config: {
    loginUrl: string | null;
    usernameSelector: string | null;
    passwordSelector: string | null;
    submitSelector: string | null;
  },
  credentials: Record<string, string>
): { valid: boolean; error: string | null } {
  if (!config.loginUrl) {
    return { valid: false, error: "Login URL is not configured" };
  }
  if (!credentials.username || !credentials.password) {
    return { valid: false, error: "Username and password are required" };
  }
  if (!config.usernameSelector || !config.passwordSelector || !config.submitSelector) {
    return {
      valid: false,
      error: "CSS selectors for username, password, and submit are required",
    };
  }
  return { valid: true, error: null };
}

function validateApiTokenBasic(
  credentials: Record<string, string>
): { valid: boolean; error: string | null } {
  if (!credentials.apiToken) {
    return { valid: false, error: "API token is required" };
  }
  return { valid: true, error: null };
}

function validateBasicAuthBasic(
  credentials: Record<string, string>
): { valid: boolean; error: string | null } {
  if (!credentials.username || !credentials.password) {
    return { valid: false, error: "Username and password are required" };
  }
  return { valid: true, error: null };
}

/**
 * Get decrypted auth config for use in scan workflows.
 * Only call from server-side code (Temporal activities).
 */
export async function getDecryptedAuthConfig(
  orgId: string,
  projectId: string
): Promise<{
  method: AuthMethod;
  credentials: Record<string, string>;
  loginUrl: string | null;
  usernameSelector: string | null;
  passwordSelector: string | null;
  submitSelector: string | null;
  successIndicator: string | null;
  totpEnabled: boolean;
  totpSelector: string | null;
} | null> {
  const project = await db.project.findFirst({
    where: {
      id: projectId,
      organizationId: orgId,
    },
    include: {
      authenticationConfig: true,
    },
  });

  if (!project || !project.authenticationConfig) {
    return null;
  }

  const config = project.authenticationConfig;

  // Decrypt credentials
  let credentials: Record<string, string> = {};
  if (config.encryptedCredentials) {
    credentials = decryptCredentials(config.encryptedCredentials, orgId);
  }

  return {
    method: config.method,
    credentials,
    loginUrl: config.loginUrl,
    usernameSelector: config.usernameSelector,
    passwordSelector: config.passwordSelector,
    submitSelector: config.submitSelector,
    successIndicator: config.successIndicator,
    totpEnabled: config.totpEnabled,
    totpSelector: config.totpSelector,
  };
}
