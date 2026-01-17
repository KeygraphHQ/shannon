import Link from "next/link";
import { Plus } from "lucide-react";
import { ScanHistorySkeleton } from "@/components/scans/scan-history-skeleton";

export default function ScansLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scans</h1>
          <p className="mt-1 text-sm text-gray-500">
            View and manage your security scans
          </p>
        </div>
        <Link
          href="/dashboard/scans/new"
          className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" />
          New Scan
        </Link>
      </div>

      {/* Scan history skeleton */}
      <ScanHistorySkeleton />
    </div>
  );
}
