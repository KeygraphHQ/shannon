"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  User,
  Building2,
  Shield,
  UserPlus,
  UserMinus,
  Key,
  LogIn,
  LogOut,
  AlertCircle,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import { AuditAction } from "@/lib/audit";

interface AuditLog {
  id: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: Date;
  user: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
  } | null;
}

interface AuditLogListProps {
  logs: AuditLog[];
  orgId: string;
  currentPage: number;
  totalPages: number;
  totalCount: number;
  currentAction?: string;
}

const ACTION_CONFIG: Record<
  string,
  { icon: React.ElementType; color: string; label: string }
> = {
  // User events
  "user.created": { icon: UserPlus, color: "text-green-600 bg-green-50", label: "User Created" },
  "user.updated": { icon: User, color: "text-blue-600 bg-blue-50", label: "User Updated" },
  "user.deleted": { icon: UserMinus, color: "text-red-600 bg-red-50", label: "User Deleted" },
  // Auth events
  "auth.login": { icon: LogIn, color: "text-blue-600 bg-blue-50", label: "Login" },
  "auth.logout": { icon: LogOut, color: "text-gray-600 bg-gray-50", label: "Logout" },
  "auth.password_changed": { icon: Key, color: "text-amber-600 bg-amber-50", label: "Password Changed" },
  "auth.password_reset": { icon: Key, color: "text-amber-600 bg-amber-50", label: "Password Reset" },
  "auth.email_verified": { icon: Check, color: "text-green-600 bg-green-50", label: "Email Verified" },
  "auth.2fa_enabled": { icon: Shield, color: "text-green-600 bg-green-50", label: "2FA Enabled" },
  "auth.2fa_disabled": { icon: Shield, color: "text-amber-600 bg-amber-50", label: "2FA Disabled" },
  "auth.2fa_challenge_failed": { icon: AlertCircle, color: "text-red-600 bg-red-50", label: "2FA Failed" },
  "auth.session_revoked": { icon: X, color: "text-red-600 bg-red-50", label: "Session Revoked" },
  // Organization events
  "organization.created": { icon: Building2, color: "text-green-600 bg-green-50", label: "Organization Created" },
  "organization.updated": { icon: Building2, color: "text-blue-600 bg-blue-50", label: "Organization Updated" },
  "organization.deleted": { icon: Building2, color: "text-red-600 bg-red-50", label: "Organization Deleted" },
  "organization.switched": { icon: Building2, color: "text-gray-600 bg-gray-50", label: "Organization Switched" },
  "organization.deletion_cancelled": { icon: Building2, color: "text-green-600 bg-green-50", label: "Deletion Cancelled" },
  // Member events
  "member.invited": { icon: UserPlus, color: "text-blue-600 bg-blue-50", label: "Member Invited" },
  "member.joined": { icon: UserPlus, color: "text-green-600 bg-green-50", label: "Member Joined" },
  "member.role_changed": { icon: Shield, color: "text-amber-600 bg-amber-50", label: "Role Changed" },
  "member.removed": { icon: UserMinus, color: "text-red-600 bg-red-50", label: "Member Removed" },
  // Scan events
  "scan.started": { icon: Shield, color: "text-blue-600 bg-blue-50", label: "Scan Started" },
  "scan.completed": { icon: Check, color: "text-green-600 bg-green-50", label: "Scan Completed" },
  "scan.failed": { icon: AlertCircle, color: "text-red-600 bg-red-50", label: "Scan Failed" },
  // Finding events
  "finding.created": { icon: AlertCircle, color: "text-amber-600 bg-amber-50", label: "Finding Created" },
  "finding.status_changed": { icon: AlertCircle, color: "text-blue-600 bg-blue-50", label: "Finding Updated" },
};

const ACTION_CATEGORIES = [
  { value: "", label: "All Events" },
  { value: "auth", label: "Authentication" },
  { value: "user", label: "Users" },
  { value: "organization", label: "Organization" },
  { value: "member", label: "Team" },
  { value: "scan", label: "Scans" },
  { value: "finding", label: "Findings" },
];

function formatDate(date: Date): string {
  const d = new Date(date);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMetadata(action: string, metadata: Record<string, unknown> | null): string {
  if (!metadata) return "";

  switch (action) {
    case "member.invited":
      return `Invited ${metadata.email} as ${metadata.role}`;
    case "member.joined":
      return `${metadata.email} joined as ${metadata.role}`;
    case "member.role_changed":
      return `Changed role from ${metadata.oldRole} to ${metadata.newRole}`;
    case "member.removed":
      return metadata.selfRemoved
        ? `Left the organization`
        : `Removed ${metadata.email}`;
    case "organization.created":
      return `Created "${metadata.name}"`;
    case "organization.updated":
      return Object.keys(metadata).join(", ") + " updated";
    case "organization.deleted":
      return `Scheduled for deletion`;
    case "scan.started":
      return `Target: ${metadata.targetUrl || "N/A"}`;
    default:
      return "";
  }
}

export function AuditLogList({
  logs,
  orgId,
  currentPage,
  totalPages,
  totalCount,
  currentAction,
}: AuditLogListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleFilterChange = (category: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (category) {
      params.set("action", category);
    } else {
      params.delete("action");
    }
    params.delete("page"); // Reset to page 1 when filtering
    router.push(`${pathname}?${params.toString()}`);
  };

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", page.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <span className="text-sm text-gray-500">Filter:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {ACTION_CATEGORIES.map((category) => {
            const isActive =
              category.value === ""
                ? !currentAction
                : currentAction?.startsWith(category.value);

            return (
              <button
                key={category.value}
                onClick={() => handleFilterChange(category.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-100 text-indigo-700"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {category.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results count */}
      <div className="text-sm text-gray-500">
        Showing {logs.length} of {totalCount} events
      </div>

      {/* Logs List */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        {logs.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500">No audit logs found</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {logs.map((log) => {
              const config = ACTION_CONFIG[log.action] || {
                icon: AlertCircle,
                color: "text-gray-600 bg-gray-50",
                label: log.action,
              };
              const Icon = config.icon;
              const description = formatMetadata(
                log.action,
                log.metadata as Record<string, unknown> | null
              );

              return (
                <li key={log.id} className="px-6 py-4">
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div
                      className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${config.color}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">
                          {config.label}
                        </p>
                      </div>
                      {description && (
                        <p className="text-sm text-gray-600 mt-0.5">
                          {description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        {log.user && (
                          <span>
                            by {log.user.name || log.user.email}
                          </span>
                        )}
                        {log.ipAddress && (
                          <span className="font-mono">{log.ipAddress}</span>
                        )}
                        <span>{formatDate(log.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
