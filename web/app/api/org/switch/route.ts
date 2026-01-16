import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orgId } = await request.json();

    if (!orgId) {
      return NextResponse.json(
        { error: "Organization ID is required" },
        { status: 400 }
      );
    }

    // Verify user has access to this organization
    const membership = user.memberships.find(
      (m) => m.organizationId === orgId
    );

    if (!membership) {
      return NextResponse.json(
        { error: "You don't have access to this organization" },
        { status: 403 }
      );
    }

    // Set the current organization cookie
    const cookieStore = await cookies();
    cookieStore.set("current_org", orgId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    // Create audit log entry
    await createAuditLog({
      organizationId: orgId,
      userId: user.id,
      action: "organization.switched",
      resourceType: "organization",
      resourceId: orgId,
      metadata: {
        toOrg: orgId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error switching organization:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
