import { cookies } from "next/headers";
import { getUserOrganizations } from "@/lib/auth";
import { getOrganization } from "@/lib/actions/organizations";
import { Building2, Users, CreditCard, Bell } from "lucide-react";

export default async function SettingsPage() {
  const organizations = await getUserOrganizations();

  // Get current org
  const cookieStore = await cookies();
  const currentOrgCookie = cookieStore.get("current_org")?.value;
  const currentOrgId =
    organizations.find((o) => o.id === currentOrgCookie)?.id ||
    organizations[0]?.id;

  const organization = currentOrgId
    ? await getOrganization(currentOrgId)
    : null;

  if (!organization) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Organization not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your organization settings and team.
        </p>
      </div>

      {/* Organization Details */}
      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">
              Organization
            </h2>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Name
            </label>
            <input
              type="text"
              defaultValue={organization.name}
              disabled
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 bg-gray-50 cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-gray-500">
              Organization editing coming soon
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Slug
            </label>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm text-gray-500">shannon.io/</span>
              <input
                type="text"
                defaultValue={organization.slug}
                disabled
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 bg-gray-50 cursor-not-allowed"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Plan
            </label>
            <div className="mt-1 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1">
              <span className="text-sm font-medium text-gray-700 capitalize">
                {organization.plan}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Team Members */}
      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900">
                Team Members
              </h2>
            </div>
            <span className="text-sm text-gray-500">
              {organization.memberships.length} member
              {organization.memberships.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <div className="divide-y divide-gray-200">
          {organization.memberships.map((membership) => (
            <div
              key={membership.id}
              className="flex items-center justify-between px-6 py-4"
            >
              <div className="flex items-center gap-3">
                {membership.user.avatarUrl ? (
                  <img
                    src={membership.user.avatarUrl}
                    alt={membership.user.name || ""}
                    className="h-10 w-10 rounded-full"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200">
                    <span className="text-sm font-medium text-gray-600">
                      {(membership.user.name || membership.user.email)[0].toUpperCase()}
                    </span>
                  </div>
                )}
                <div>
                  <p className="font-medium text-gray-900">
                    {membership.user.name || "Unnamed"}
                  </p>
                  <p className="text-sm text-gray-500">
                    {membership.user.email}
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 capitalize">
                {membership.role}
              </span>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-200 px-6 py-4">
          <button
            disabled
            className="text-sm font-medium text-indigo-600 opacity-50 cursor-not-allowed"
          >
            + Invite team member (Coming soon)
          </button>
        </div>
      </section>

      {/* Coming Soon Sections */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ComingSoonCard
          icon={CreditCard}
          title="Billing"
          description="Manage your subscription and payment methods"
        />
        <ComingSoonCard
          icon={Bell}
          title="Notifications"
          description="Configure alerts and notification preferences"
        />
      </div>
    </div>
  );
}

function ComingSoonCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 opacity-60">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-gray-100 p-2">
          <Icon className="h-5 w-5 text-gray-400" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
      </div>
      <div className="mt-4">
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
          Coming Soon
        </span>
      </div>
    </div>
  );
}
