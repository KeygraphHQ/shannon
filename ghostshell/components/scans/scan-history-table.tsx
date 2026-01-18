"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Timer,
  ChevronRight,
  Filter,
} from "lucide-react";

interface Scan {
  id: string;
  projectId: string;
  projectName: string;
  status: string;
  source: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  findingsCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  createdAt: string;
}

interface ScanHistoryTableProps {
  scans: Scan[];
  nextCursor: string | null;
  total: number;
  onLoadMore?: (cursor: string) => Promise<void>;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; color: string }
> = {
  PENDING: { label: "Pending", icon: Clock, color: "text-gray-600" },
  RUNNING: { label: "Running", icon: Loader2, color: "text-blue-600" },
  COMPLETED: { label: "Completed", icon: CheckCircle, color: "text-green-600" },
  FAILED: { label: "Failed", icon: XCircle, color: "text-red-600" },
  CANCELLED: { label: "Cancelled", icon: XCircle, color: "text-gray-600" },
  TIMEOUT: { label: "Timed Out", icon: Timer, color: "text-orange-600" },
};

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `Today at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (diffDays === 1) {
    return `Yesterday at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: "long", hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ScanHistoryTable({
  scans,
  nextCursor,
  total,
  onLoadMore,
}: ScanHistoryTableProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || !onLoadMore) return;
    setIsLoading(true);
    try {
      await onLoadMore(nextCursor);
    } finally {
      setIsLoading(false);
    }
  }, [nextCursor, onLoadMore]);

  const filteredScans = statusFilter === "all"
    ? scans
    : scans.filter((scan) => scan.status === statusFilter);

  if (scans.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No scans yet</p>
        <Link
          href="/dashboard/scans/new"
          className="mt-2 inline-block text-sm text-indigo-600 hover:text-indigo-500"
        >
          Start your first scan
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-gray-400" />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="all">All Statuses</option>
          <option value="RUNNING">Running</option>
          <option value="COMPLETED">Completed</option>
          <option value="FAILED">Failed</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="PENDING">Pending</option>
        </select>
        <span className="text-sm text-gray-500">
          Showing {filteredScans.length} of {total} scans
        </span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Project
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Started
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Duration
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Findings
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {filteredScans.map((scan) => {
              const statusConfig = STATUS_CONFIG[scan.status] || STATUS_CONFIG.PENDING;
              const StatusIcon = statusConfig.icon;
              const isRunning = scan.status === "RUNNING";

              return (
                <tr key={scan.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {scan.projectName}
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className={`flex items-center gap-1.5 ${statusConfig.color}`}>
                      <StatusIcon
                        className={`h-4 w-4 ${isRunning ? "animate-spin" : ""}`}
                      />
                      <span className="text-sm">{statusConfig.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-500">
                      {scan.startedAt ? formatDate(scan.startedAt) : "-"}
                    </span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-500">
                      {scan.durationMs ? formatDuration(scan.durationMs) : isRunning ? "..." : "-"}
                    </span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {scan.criticalCount > 0 && (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          {scan.criticalCount} critical
                        </span>
                      )}
                      {scan.highCount > 0 && (
                        <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                          {scan.highCount} high
                        </span>
                      )}
                      {scan.criticalCount === 0 && scan.highCount === 0 && scan.findingsCount > 0 && (
                        <span className="text-sm text-gray-500">
                          {scan.findingsCount} total
                        </span>
                      )}
                      {scan.findingsCount === 0 && scan.status === "COMPLETED" && (
                        <span className="text-sm text-green-600">No findings</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-right">
                    <Link
                      href={`/dashboard/scans/${scan.id}`}
                      className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-500"
                    >
                      View
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Load more */}
      {nextCursor && onLoadMore && (
        <div className="flex justify-center pt-4">
          <button
            onClick={handleLoadMore}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              "Load More"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
