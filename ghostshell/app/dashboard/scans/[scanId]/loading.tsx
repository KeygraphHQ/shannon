import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ScanDetailSkeleton } from "@/components/scans/scan-detail-skeleton";

export default function ScanDetailLoading() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back link */}
      <Link
        href="/dashboard/scans"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Scans
      </Link>

      {/* Header skeleton */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-8 w-36 rounded bg-gray-200 animate-pulse" />
          <div className="h-4 w-48 rounded bg-gray-200 animate-pulse" />
        </div>
      </div>

      {/* Scan details skeleton */}
      <ScanDetailSkeleton />
    </div>
  );
}
