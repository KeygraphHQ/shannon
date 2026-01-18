import { cookies } from "next/headers";
import Link from "next/link";
import { getCurrentUser, getUserOrganizations } from "@/lib/auth";
import { getScans, getScanStats } from "@/lib/actions/scans";
import { getFindingsSummary } from "@/lib/actions/findings";
import {
  Shield,
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  ExternalLink,
} from "lucide-react";
import { NewScanButton } from "@/components/new-scan-button";
import { SeverityBadge } from "@/components/severity-badge";
import { FindingsWidget } from "@/components/dashboard/findings-widget";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const organizations = await getUserOrganizations();

  // Get current org
  const cookieStore = await cookies();
  const currentOrgCookie = cookieStore.get("current_org")?.value;
  const currentOrg =
    organizations.find((o) => o.id === currentOrgCookie) || organizations[0];

  // Fetch scans, stats, and findings summary
  const scans = await getScans(currentOrg.id);
  const stats = await getScanStats(currentOrg.id) ?? {
    totalScans: 0,
    openFindings: 0,
    fixedFindings: 0,
    completedScans: 0,
  };
  const findingsSummary = await getFindingsSummary();

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 p-8 text-white">
        <h1 className="text-2xl font-bold">
          Welcome back, {user?.name?.split(" ")[0] || "there"}!
        </h1>
        <p className="mt-2 text-indigo-100">
          {scans.length === 0
            ? "Start your first security scan in under 5 minutes."
            : "Monitor your security scans and review findings."}
        </p>
        <NewScanButton organizationId={currentOrg.id} />
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Scans"
          value={stats.totalScans.toString()}
          icon={Shield}
          color="indigo"
          description="All time"
        />
        <StatCard
          title="Open Findings"
          value={stats.openFindings.toString()}
          icon={AlertTriangle}
          color="amber"
          description="Needs attention"
        />
        <StatCard
          title="Fixed"
          value={stats.fixedFindings.toString()}
          icon={CheckCircle}
          color="emerald"
          description="Resolved issues"
        />
        <StatCard
          title="Reports"
          value={stats.completedScans.toString()}
          icon={FileText}
          color="purple"
          description="Generated"
        />
      </div>

      {/* Findings Summary Widget */}
      <FindingsWidget summary={findingsSummary} />

      {/* Recent Scans */}
      {scans.length > 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Recent Scans
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Monitor the status of your security scans
            </p>
          </div>

          <div className="divide-y divide-gray-200">
            {scans.slice(0, 10).map((scan) => (
              <Link
                key={scan.id}
                href={`/dashboard/scans/${scan.id}`}
                className="block p-6 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {scan.targetUrl}
                      </p>
                      <ExternalLink className="h-4 w-4 shrink-0 text-gray-400" />
                    </div>

                    <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {scan.startedAt ? new Date(scan.startedAt).toLocaleDateString() : "Pending"}
                      </div>
                      {scan._count.findings > 0 && (
                        <div className="flex items-center gap-1">
                          <AlertTriangle className="h-4 w-4" />
                          {scan._count.findings} findings
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="ml-4 flex shrink-0 items-center gap-3">
                    <ScanStatusBadge status={scan.status} />
                    {scan.status === "RUNNING" && (
                      <div className="text-sm text-gray-500">
                        {scan.progress}%
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        /* Getting Started */
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">
            Getting Started
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Complete these steps to get the most out of Shannon.
          </p>

          <div className="mt-6 space-y-4">
            <StepItem
              number={1}
              title="Create your account"
              description="Sign up and verify your email"
              completed={true}
            />
            <StepItem
              number={2}
              title="Set up your organization"
              description={`You're in "${currentOrg.name}"`}
              completed={true}
            />
            <StepItem
              number={3}
              title="Run your first scan"
              description="Enter a URL and start scanning"
              completed={false}
            />
            <StepItem
              number={4}
              title="Review findings"
              description="Triage and assign vulnerabilities"
              completed={false}
              disabled
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  description,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: "indigo" | "amber" | "emerald" | "purple";
  description: string;
}) {
  const colors = {
    indigo: "bg-indigo-50 text-indigo-600",
    amber: "bg-amber-50 text-amber-600",
    emerald: "bg-emerald-50 text-emerald-600",
    purple: "bg-purple-50 text-purple-600",
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex items-center gap-4">
        <div className={`rounded-lg p-3 ${colors[color]}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-sm text-gray-500">{title}</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-400">{description}</p>
    </div>
  );
}

function ScanStatusBadge({ status }: { status: string }) {
  const config: Record<
    string,
    { label: string; className: string }
  > = {
    pending: {
      label: "Pending",
      className: "bg-gray-100 text-gray-800 border-gray-200",
    },
    running: {
      label: "Running",
      className: "bg-blue-100 text-blue-800 border-blue-200",
    },
    completed: {
      label: "Completed",
      className: "bg-emerald-100 text-emerald-800 border-emerald-200",
    },
    failed: {
      label: "Failed",
      className: "bg-red-100 text-red-800 border-red-200",
    },
  };

  const { label, className } = config[status] || config.pending;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}

function StepItem({
  number,
  title,
  description,
  completed,
  disabled,
}: {
  number: number;
  title: string;
  description: string;
  completed: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-4 ${disabled ? "opacity-50" : ""}`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          completed
            ? "bg-emerald-100 text-emerald-600"
            : "bg-gray-100 text-gray-400"
        }`}
      >
        {completed ? (
          <CheckCircle className="h-5 w-5" />
        ) : (
          <span className="text-sm font-medium">{number}</span>
        )}
      </div>
      <div>
        <p
          className={`font-medium ${completed ? "text-gray-900" : "text-gray-500"}`}
        >
          {title}
        </p>
        <p className="text-sm text-gray-400">{description}</p>
      </div>
    </div>
  );
}
