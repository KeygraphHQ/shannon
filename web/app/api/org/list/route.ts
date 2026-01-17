import { NextResponse } from "next/server";
import { getUserOrganizations } from "@/lib/auth";

export async function GET() {
  try {
    const organizations = await getUserOrganizations();

    return NextResponse.json({
      organizations: organizations.map((org) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        role: org.role,
        createdAt: org.createdAt,
        updatedAt: org.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching organizations:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
