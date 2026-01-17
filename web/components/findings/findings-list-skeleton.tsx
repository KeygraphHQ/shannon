"use client";

/**
 * Loading skeleton for the findings list page.
 * Displays placeholder content while findings are being fetched.
 */
export function FindingsListSkeleton() {
  return (
    <div className="space-y-4">
      {/* Filters Row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          {/* Filter dropdowns */}
          <div className="h-10 w-32 rounded-lg bg-gray-200 animate-pulse" />
          <div className="h-10 w-32 rounded-lg bg-gray-200 animate-pulse" />
        </div>
        {/* Search input */}
        <div className="w-full sm:w-64">
          <div className="h-10 w-full rounded-lg bg-gray-200 animate-pulse" />
        </div>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between text-sm">
        <div className="h-4 w-24 rounded bg-gray-200 animate-pulse" />
      </div>

      {/* Findings List */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="divide-y divide-gray-200">
          {[...Array(5)].map((_, i) => (
            <FindingsListItemSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for a single finding list item.
 */
export function FindingsListItemSkeleton() {
  return (
    <div className="flex items-start gap-4 p-4">
      {/* Checkbox */}
      <div className="flex-shrink-0 pt-1">
        <div className="h-4 w-4 rounded bg-gray-200 animate-pulse" />
      </div>

      {/* Severity badge */}
      <div className="flex-shrink-0 pt-0.5">
        <div className="h-5 w-14 rounded-full bg-gray-200 animate-pulse" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            {/* Title */}
            <div className="h-5 w-3/4 rounded bg-gray-200 animate-pulse" />
            {/* Description */}
            <div className="h-4 w-full rounded bg-gray-200 animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-gray-200 animate-pulse" />
          </div>
          {/* Status Badge */}
          <div className="flex-shrink-0 h-5 w-16 rounded-full bg-gray-200 animate-pulse" />
        </div>

        {/* Metadata */}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div className="h-3 w-32 rounded bg-gray-200 animate-pulse" />
          <div className="h-4 w-16 rounded-full bg-gray-200 animate-pulse" />
          <div className="h-3 w-16 rounded bg-gray-200 animate-pulse" />
          <div className="h-3 w-20 rounded bg-gray-200 animate-pulse" />
        </div>
      </div>

      {/* View Button */}
      <div className="flex-shrink-0 h-8 w-16 rounded-lg bg-gray-200 animate-pulse" />
    </div>
  );
}
