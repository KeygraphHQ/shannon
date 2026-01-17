import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Settings, ExternalLink } from "lucide-react";
import { getCurrentUser, hasOrgAccess } from "@/lib/auth";
import { getAuthConfig } from "@/lib/actions/auth-config";
import { db } from "@/lib/db";
import { AuthConfigForm } from "@/components/auth-config/auth-config-form";

interface ProjectSettingsPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectSettingsPage({
  params,
}: ProjectSettingsPageProps) {
  const { projectId } = await params;
  const user = await getCurrentUser();

  if (!user || user.memberships.length === 0) {
    redirect("/sign-in");
  }

  const orgId = user.memberships[0].organizationId;
  const hasAccess = await hasOrgAccess(orgId);

  if (!hasAccess) {
    redirect("/dashboard");
  }

  // Get project details
  const project = await db.project.findFirst({
    where: {
      id: projectId,
      organizationId: orgId,
    },
  });

  if (!project) {
    redirect("/dashboard/projects");
  }

  // Get auth config
  const authConfig = await getAuthConfig(orgId, projectId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/projects/${projectId}`}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to project
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
          <Settings className="h-5 w-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Project Settings</h1>
          <p className="text-sm text-gray-500">{project.name}</p>
        </div>
      </div>

      {/* Project Info Card */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Project Details
        </h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-gray-500">Name</dt>
            <dd className="mt-1 text-sm text-gray-900">{project.name}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Target URL</dt>
            <dd className="mt-1 text-sm text-gray-900">
              <a
                href={project.targetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-500"
              >
                {project.targetUrl}
                <ExternalLink className="h-3 w-3" />
              </a>
            </dd>
          </div>
          {project.description && (
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-gray-500">Description</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {project.description}
              </dd>
            </div>
          )}
          {project.repositoryUrl && (
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-gray-500">Repository</dt>
              <dd className="mt-1 text-sm text-gray-900">
                <a
                  href={project.repositoryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-500"
                >
                  {project.repositoryUrl}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Auth Config Form */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <AuthConfigForm
          projectId={projectId}
          initialConfig={authConfig || undefined}
        />
      </div>
    </div>
  );
}
