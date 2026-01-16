import { cookies } from "next/headers";
import { getCurrentUser, getUserOrganizations } from "@/lib/auth";
import { Shield, FileText, AlertTriangle, CheckCircle } from "lucide-react";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const organizations = await getUserOrganizations();

  // Get current org
  const cookieStore = await cookies();
  const currentOrgCookie = cookieStore.get("current_org")?.value;
  const currentOrg =
    organizations.find((o) => o.id === currentOrgCookie) || organizations[0];

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 p-8 text-white">
        <h1 className="text-2xl font-bold">
          Welcome back, {user?.name?.split(" ")[0] || "there"}!
        </h1>
        <p className="mt-2 text-indigo-100">
          Start your first security scan in under 5 minutes.
        </p>
        <button
          disabled
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-indigo-600 opacity-75 cursor-not-allowed"
        >
          <Shield className="h-4 w-4" />
          New Scan
          <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded ml-2">
            Coming Soon
          </span>
        </button>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Scans"
          value="0"
          icon={Shield}
          color="indigo"
          description="All time"
        />
        <StatCard
          title="Open Findings"
          value="0"
          icon={AlertTriangle}
          color="amber"
          description="Needs attention"
        />
        <StatCard
          title="Fixed"
          value="0"
          icon={CheckCircle}
          color="emerald"
          description="Resolved issues"
        />
        <StatCard
          title="Reports"
          value="0"
          icon={FileText}
          color="purple"
          description="Generated"
        />
      </div>

      {/* Getting Started */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Getting Started</h2>
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
            disabled
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
