"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Shield,
  FileText,
  Settings,
  Users,
  BarChart3,
  User,
  Key,
  ClipboardList,
} from "lucide-react";
import { TwoFactorStatus } from "./two-factor-status";

interface DashboardNavProps {
  currentOrgId: string;
}

const getMainNavigation = (orgId: string): Array<{ name: string; href: string; icon: typeof Home; disabled?: boolean }> => [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Scans", href: "/dashboard/scans", icon: Shield },
  { name: "Findings", href: "/findings", icon: FileText },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Team", href: `/org/${orgId}/team`, icon: Users },
];

const getSettingsNavigation = (orgId: string) => [
  { name: "Organization", href: `/org/${orgId}/settings`, icon: Settings },
  { name: "Account", href: "/settings/account", icon: User },
  { name: "Security", href: "/settings/security", icon: Key, show2FAStatus: true },
  { name: "Audit Log", href: `/org/${orgId}/audit`, icon: ClipboardList },
];

export function DashboardNav({ currentOrgId }: DashboardNavProps) {
  const pathname = usePathname();
  const mainNavigation = getMainNavigation(currentOrgId);
  const settingsNavigation = getSettingsNavigation(currentOrgId);

  return (
    <nav className="space-y-6">
      {/* Main Navigation */}
      <div className="space-y-1">
        {mainNavigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;

          if (item.disabled) {
            return (
              <div
                key={item.name}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-400 cursor-not-allowed"
              >
                <Icon className="h-5 w-5" />
                <span>{item.name}</span>
                <span className="ml-auto text-xs bg-gray-100 px-2 py-0.5 rounded">
                  Soon
                </span>
              </div>
            );
          }

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <Icon
                className={`h-5 w-5 ${isActive ? "text-indigo-600" : "text-gray-400"}`}
              />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </div>

      {/* Settings Navigation */}
      <div>
        <h3 className="px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Settings
        </h3>
        <div className="mt-2 space-y-1">
          {settingsNavigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            const show2FA = 'show2FAStatus' in item && item.show2FAStatus;

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <Icon
                  className={`h-5 w-5 ${isActive ? "text-indigo-600" : "text-gray-400"}`}
                />
                <span className="flex-1">{item.name}</span>
                {show2FA && <TwoFactorStatus variant="badge" showLink={false} />}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
