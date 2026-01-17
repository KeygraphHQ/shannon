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
} from "lucide-react";

interface DashboardNavProps {
  currentOrgId: string;
}

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Scans", href: "/dashboard/scans", icon: Shield },
  {
    name: "Findings",
    href: "/dashboard/findings",
    icon: FileText,
    disabled: true,
  },
  {
    name: "Reports",
    href: "/dashboard/reports",
    icon: BarChart3,
    disabled: true,
  },
  { name: "Team", href: "/dashboard/team", icon: Users, disabled: true },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function DashboardNav({ currentOrgId }: DashboardNavProps) {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {navigation.map((item) => {
        // Check if current path matches or is a subpath
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
    </nav>
  );
}
