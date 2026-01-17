"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ScanDetailError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log error to console in development
    console.error("Scan detail page error:", error);
  }, [error]);

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

      {/* Error card */}
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <AlertTriangle className="h-6 w-6 text-red-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-red-800">
              Unable to Load Scan Details
            </h2>
            <p className="mt-2 text-sm text-red-700">
              {error.message || "An unexpected error occurred while loading the scan details."}
            </p>
            {error.digest && (
              <p className="mt-1 text-xs text-red-600">
                Error ID: {error.digest}
              </p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500"
              >
                <RefreshCw className="h-4 w-4" />
                Try Again
              </button>
              <Link
                href="/dashboard/scans"
                className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                View All Scans
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Help text */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h3 className="text-sm font-medium text-gray-900">Common Issues</h3>
        <ul className="mt-2 text-sm text-gray-600 space-y-1">
          <li>The scan may have been deleted or does not exist</li>
          <li>You may not have permission to view this scan</li>
          <li>There may be a temporary server issue - try again in a few moments</li>
        </ul>
      </div>
    </div>
  );
}
