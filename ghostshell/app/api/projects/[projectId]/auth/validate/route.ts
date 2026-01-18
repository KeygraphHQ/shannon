import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { decryptCredentials } from "@/lib/encryption";

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * POST /api/projects/[projectId]/auth/validate - Validate authentication credentials
 * Tests credentials without starting a full scan.
 * Returns { valid, error, validatedAt }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getCurrentUser();
    if (!user || user.memberships.length === 0) {
      return NextResponse.json(
        { error: "No organization found", code: "NO_ORGANIZATION" },
        { status: 400 }
      );
    }

    const { projectId } = await params;
    const orgId = user.memberships[0].organizationId;

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
      return NextResponse.json(
        { error: "Project not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const config = project.authenticationConfig;
    if (!config) {
      return NextResponse.json(
        { error: "No authentication configured", code: "NO_AUTH_CONFIG" },
        { status: 400 }
      );
    }

    if (config.method === "NONE") {
      return NextResponse.json({
        valid: true,
        error: null,
        validatedAt: new Date().toISOString(),
      });
    }

    // Decrypt credentials for validation
    let credentials: Record<string, string> = {};
    if (config.encryptedCredentials) {
      try {
        credentials = decryptCredentials(config.encryptedCredentials, orgId);
      } catch {
        return NextResponse.json({
          valid: false,
          error: "Failed to decrypt credentials. Please re-enter them.",
          validatedAt: new Date().toISOString(),
        });
      }
    }

    // Perform validation based on auth method
    let validationResult: { valid: boolean; error: string | null };

    try {
      switch (config.method) {
        case "FORM":
          validationResult = await validateFormAuth(config, credentials, project.targetUrl);
          break;
        case "API_TOKEN":
          validationResult = await validateApiToken(credentials, project.targetUrl);
          break;
        case "BASIC":
          validationResult = await validateBasicAuth(credentials, project.targetUrl);
          break;
        case "SSO":
          // SSO validation is complex and typically requires manual setup
          validationResult = {
            valid: false,
            error: "SSO validation must be performed manually",
          };
          break;
        default:
          validationResult = { valid: false, error: "Unknown auth method" };
      }
    } catch (err) {
      validationResult = {
        valid: false,
        error: err instanceof Error ? err.message : "Validation failed",
      };
    }

    const now = new Date();

    // Update validation status in database
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

    return NextResponse.json({
      valid: validationResult.valid,
      error: validationResult.error,
      validatedAt: now.toISOString(),
    });
  } catch (error) {
    console.error("Error validating auth:", error);
    return NextResponse.json(
      { error: "Failed to validate authentication", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

/**
 * Validate form-based authentication
 * This is a simplified validation - full validation would use Playwright via Temporal
 */
async function validateFormAuth(
  config: {
    loginUrl: string | null;
    usernameSelector: string | null;
    passwordSelector: string | null;
    submitSelector: string | null;
    successIndicator: string | null;
  },
  credentials: Record<string, string>,
  targetUrl: string
): Promise<{ valid: boolean; error: string | null }> {
  // Check required fields
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

  // For now, just verify the login URL is accessible
  // Full Playwright-based validation will be done via Temporal activity
  try {
    const response = await fetch(config.loginUrl, {
      method: "HEAD",
      redirect: "follow",
    });

    if (!response.ok && response.status !== 405) {
      return {
        valid: false,
        error: `Login URL returned status ${response.status}`,
      };
    }

    // Return success with note that full validation requires Temporal
    return {
      valid: true,
      error: null,
    };
  } catch (err) {
    return {
      valid: false,
      error: `Cannot reach login URL: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

/**
 * Validate API token authentication
 */
async function validateApiToken(
  credentials: Record<string, string>,
  targetUrl: string
): Promise<{ valid: boolean; error: string | null }> {
  if (!credentials.apiToken) {
    return { valid: false, error: "API token is required" };
  }

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${credentials.apiToken}`,
      },
      redirect: "follow",
    });

    if (response.status === 401 || response.status === 403) {
      return { valid: false, error: "Invalid API token" };
    }

    return { valid: true, error: null };
  } catch (err) {
    return {
      valid: false,
      error: `Cannot validate token: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

/**
 * Validate HTTP Basic authentication
 */
async function validateBasicAuth(
  credentials: Record<string, string>,
  targetUrl: string
): Promise<{ valid: boolean; error: string | null }> {
  if (!credentials.username || !credentials.password) {
    return { valid: false, error: "Username and password are required" };
  }

  try {
    const basicAuth = Buffer.from(
      `${credentials.username}:${credentials.password}`
    ).toString("base64");

    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        Authorization: `Basic ${basicAuth}`,
      },
      redirect: "follow",
    });

    if (response.status === 401 || response.status === 403) {
      return { valid: false, error: "Invalid credentials" };
    }

    return { valid: true, error: null };
  } catch (err) {
    return {
      valid: false,
      error: `Cannot validate credentials: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}
