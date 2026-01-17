"use client";

/**
 * Loading skeleton for the scan history table.
 * Displays placeholder rows while scan data is being fetched.
 */
export function ScanHistorySkeleton() {
  return (
    <div className="space-y-4">
      {/* Filter skeleton */}
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 rounded bg-gray-200 animate-pulse" />
        <div className="h-8 w-32 rounded bg-gray-200 animate-pulse" />
        <div className="h-4 w-24 rounded bg-gray-200 animate-pulse" />
      </div>

      {/* Table skeleton */}
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">
                <div className="h-3 w-16 rounded bg-gray-300 animate-pulse" />
              </th>
              <th className="px-4 py-3 text-left">
                <div className="h-3 w-12 rounded bg-gray-300 animate-pulse" />
              </th>
              <th className="px-4 py-3 text-left">
                <div className="h-3 w-14 rounded bg-gray-300 animate-pulse" />
              </th>
              <th className="px-4 py-3 text-left">
                <div className="h-3 w-16 rounded bg-gray-300 animate-pulse" />
              </th>
              <th className="px-4 py-3 text-left">
                <div className="h-3 w-16 rounded bg-gray-300 animate-pulse" />
              </th>
              <th className="px-4 py-3 text-right">
                <div className="h-3 w-12 rounded bg-gray-300 animate-pulse ml-auto" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {[...Array(5)].map((_, i) => (
              <tr key={i}>
                <td className="px-4 py-4">
                  <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-1.5">
                    <div className="h-4 w-4 rounded-full bg-gray-200 animate-pulse" />
                    <div className="h-4 w-16 rounded bg-gray-200 animate-pulse" />
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="h-4 w-24 rounded bg-gray-200 animate-pulse" />
                </td>
                <td className="px-4 py-4">
                  <div className="h-4 w-12 rounded bg-gray-200 animate-pulse" />
                </td>
                <td className="px-4 py-4">
                  <div className="h-5 w-20 rounded-full bg-gray-200 animate-pulse" />
                </td>
                <td className="px-4 py-4 text-right">
                  <div className="h-4 w-12 rounded bg-gray-200 animate-pulse ml-auto" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
