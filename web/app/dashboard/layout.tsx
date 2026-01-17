import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { getCurrentUser, getUserOrganizations } from "@/lib/auth";
import { OrgSwitcher } from "@/components/org-switcher";
import { DashboardNav } from "@/components/dashboard-nav";
import { DashboardProviders } from "@/components/providers/dashboard-providers";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/sign-in");
  }

  const organizations = await getUserOrganizations();

  if (organizations.length === 0) {
    // This shouldn't happen, but just in case
    redirect("/sign-in");
  }

  // Get current org from cookie or use first org
  const cookieStore = await cookies();
  const currentOrgCookie = cookieStore.get("current_org")?.value;
  const currentOrgId =
    organizations.find((o) => o.id === currentOrgCookie)?.id ||
    organizations[0].id;

  return (
    <DashboardProviders>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="sticky top-0 z-30 border-b border-gray-200 bg-white">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            {/* Logo & Org Switcher */}
            <div className="flex items-center gap-4">
              <a href="/dashboard" className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
                  <span className="text-lg font-bold text-white">S</span>
                </div>
                <span className="text-lg font-semibold text-gray-900">
                  Shannon
                </span>
              </a>
              <div className="hidden sm:block">
                <OrgSwitcher
                  organizations={organizations}
                  currentOrgId={currentOrgId}
                />
              </div>
            </div>

            {/* User Menu */}
            <div className="flex items-center gap-4">
              <UserButton
                afterSignOutUrl="/"
                appearance={{
                  elements: {
                    avatarBox: "h-8 w-8",
                  },
                }}
              />
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex gap-8 py-8">
            {/* Sidebar Navigation */}
            <aside className="hidden w-56 shrink-0 lg:block">
              <DashboardNav currentOrgId={currentOrgId} />
            </aside>

            {/* Page Content */}
            <main className="min-w-0 flex-1">{children}</main>
          </div>
        </div>
      </div>
    </DashboardProviders>
  );
}
