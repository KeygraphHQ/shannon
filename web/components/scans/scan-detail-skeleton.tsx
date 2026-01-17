"use client";

/**
 * Loading skeleton for the scan detail card.
 * Displays placeholder content while scan details are being fetched.
 */
export function ScanDetailSkeleton() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Header skeleton */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-5 w-48 rounded bg-gray-200 animate-pulse" />
            <div className="h-4 w-64 rounded bg-gray-200 animate-pulse" />
          </div>
          <div className="h-7 w-24 rounded-full bg-gray-200 animate-pulse" />
        </div>
      </div>

      {/* Body skeleton */}
      <div className="px-6 py-4 space-y-4">
        {/* Timing info skeleton */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="h-3 w-12 rounded bg-gray-200 animate-pulse" />
            <div className="h-4 w-36 rounded bg-gray-200 animate-pulse" />
          </div>
          <div className="space-y-1">
            <div className="h-3 w-14 rounded bg-gray-200 animate-pulse" />
            <div className="h-4 w-20 rounded bg-gray-200 animate-pulse" />
          </div>
        </div>

        {/* Findings summary skeleton */}
        <div>
          <div className="h-4 w-32 rounded bg-gray-200 animate-pulse mb-2" />
          <div className="grid grid-cols-4 gap-2">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="rounded-md bg-gray-100 p-3 text-center space-y-2"
              >
                <div className="h-5 w-5 rounded bg-gray-200 animate-pulse mx-auto" />
                <div className="h-8 w-8 rounded bg-gray-200 animate-pulse mx-auto" />
                <div className="h-3 w-12 rounded bg-gray-200 animate-pulse mx-auto" />
              </div>
            ))}
          </div>
        </div>

        {/* Risk score skeleton */}
        <div>
          <div className="h-4 w-20 rounded bg-gray-200 animate-pulse mb-2" />
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-gray-200 rounded-full" />
            <div className="h-4 w-12 rounded bg-gray-200 animate-pulse" />
          </div>
        </div>

        {/* Executive summary skeleton */}
        <div>
          <div className="h-4 w-36 rounded bg-gray-200 animate-pulse mb-2" />
          <div className="space-y-1.5">
            <div className="h-3 w-full rounded bg-gray-200 animate-pulse" />
            <div className="h-3 w-full rounded bg-gray-200 animate-pulse" />
            <div className="h-3 w-3/4 rounded bg-gray-200 animate-pulse" />
          </div>
        </div>

        {/* Report links skeleton */}
        <div className="flex gap-3 pt-2">
          <div className="h-4 w-28 rounded bg-gray-200 animate-pulse" />
          <div className="h-4 w-28 rounded bg-gray-200 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
