import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { encryptCredentials } from "@/lib/encryption";
import type { AuthMethod } from "@/lib/types/auth";

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/auth - Get authentication configuration
 * Returns auth config with credentials masked (hasCredentials: true/false)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
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
      return NextResponse.json(
        { error: "Project not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const config = project.authenticationConfig;
    if (!config) {
      return NextResponse.json({
        method: "NONE",
        hasCredentials: false,
        totpEnabled: false,
        lastValidatedAt: null,
        validationStatus: null,
      });
    }

    // Return config with credentials masked
    return NextResponse.json({
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
    });
  } catch (error) {
    console.error("Error getting auth config:", error);
    return NextResponse.json(
      { error: "Failed to get auth config", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/projects/[projectId]/auth - Update authentication configuration
 * Encrypts credentials with org-specific key before storage
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
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

    // Verify project belongs to org
    const project = await db.project.findFirst({
      where: {
        id: projectId,
        organizationId: orgId,
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { method } = body as { method: AuthMethod };

    if (!method) {
      return NextResponse.json(
        { error: "Method is required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Validate method-specific fields
    if (method === "FORM") {
      if (!body.loginUrl) {
        return NextResponse.json(
          { error: "Login URL is required for form authentication", code: "VALIDATION_ERROR" },
          { status: 400 }
        );
      }
    }

    // Build credentials object to encrypt
    const credentials: Record<string, string> = {};
    if (body.username) credentials.username = body.username;
    if (body.password) credentials.password = body.password;
    if (body.apiToken) credentials.apiToken = body.apiToken;
    if (body.totpSecret) credentials.totpSecret = body.totpSecret;

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
          method,
          encryptedCredentials,
          loginUrl: body.loginUrl || null,
          usernameSelector: body.usernameSelector || null,
          passwordSelector: body.passwordSelector || null,
          submitSelector: body.submitSelector || null,
          successIndicator: body.successIndicator || null,
          totpEnabled: body.totpEnabled || false,
          totpSelector: body.totpSelector || null,
          validationStatus: "untested",
        },
        update: {
          method,
          encryptedCredentials,
          loginUrl: body.loginUrl || null,
          usernameSelector: body.usernameSelector || null,
          passwordSelector: body.passwordSelector || null,
          submitSelector: body.submitSelector || null,
          successIndicator: body.successIndicator || null,
          totpEnabled: body.totpEnabled || false,
          totpSelector: body.totpSelector || null,
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
            method,
            totpEnabled: body.totpEnabled || false,
          },
        },
      });

      return authConfig;
    });

    return NextResponse.json({
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
    });
  } catch (error) {
    console.error("Error saving auth config:", error);
    return NextResponse.json(
      { error: "Failed to save auth config", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/[projectId]/auth - Remove authentication configuration
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
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
      return NextResponse.json(
        { error: "Project not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    if (!project.authenticationConfig) {
      return new NextResponse(null, { status: 204 });
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

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting auth config:", error);
    return NextResponse.json(
      { error: "Failed to delete auth config", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
