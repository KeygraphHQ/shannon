import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { StartScanForm } from "@/components/scans/start-scan-form";

export const dynamic = "force-dynamic";

export default async function NewScanPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/sign-in");
  }

  if (user.memberships.length === 0) {
    redirect("/dashboard");
  }

  const orgId = user.memberships[0].organizationId;

  // Fetch projects for the dropdown
  const projects = await db.project.findMany({
    where: { organizationId: orgId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      targetUrl: true,
    },
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back link */}
      <Link
        href="/dashboard/scans"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Scans
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Start New Scan</h1>
        <p className="mt-1 text-sm text-gray-500">
          Select a project to run a security scan
        </p>
      </div>

      {/* Form */}
      {projects.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
          <p className="text-gray-600">No projects found.</p>
          <p className="mt-2 text-sm text-gray-500">
            Create a project first to run security scans.
          </p>
          <Link
            href="/dashboard/projects/new"
            className="mt-4 inline-block text-sm text-indigo-600 hover:text-indigo-500"
          >
            Create a Project
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <StartScanForm projects={projects} />
        </div>
      )}
    </div>
  );
}
