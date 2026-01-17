"use client";

import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

interface PaginationControlsProps {
  /** Whether there are more items to load */
  hasMore: boolean;
  /** Total count of items (optional) */
  total?: number;
  /** Current number of items shown */
  currentCount: number;
  /** Callback to load more items */
  onLoadMore: () => Promise<void>;
  /** Available page sizes */
  pageSizes?: number[];
  /** Current page size */
  pageSize?: number;
  /** Callback when page size changes */
  onPageSizeChange?: (size: number) => void;
  /** Loading state */
  isLoading?: boolean;
}

export function PaginationControls({
  hasMore,
  total,
  currentCount,
  onLoadMore,
  pageSizes = [20, 50, 100],
  pageSize = 20,
  onPageSizeChange,
  isLoading = false,
}: PaginationControlsProps) {
  const [loading, setLoading] = useState(false);

  const handleLoadMore = async () => {
    if (loading || isLoading || !hasMore) return;
    setLoading(true);
    try {
      await onLoadMore();
    } finally {
      setLoading(false);
    }
  };

  const showLoading = loading || isLoading;

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      {/* Item count */}
      <div className="text-sm text-gray-500">
        Showing {currentCount}
        {total !== undefined && ` of ${total}`} scans
      </div>

      {/* Load more button */}
      {hasMore && (
        <button
          onClick={handleLoadMore}
          disabled={showLoading}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {showLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </>
          ) : (
            "Load More"
          )}
        </button>
      )}

      {/* Page size selector */}
      {onPageSizeChange && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>Show</span>
          <div className="relative">
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="appearance-none rounded-md border border-gray-300 bg-white py-1 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {pageSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
          <span>per page</span>
        </div>
      )}

      {/* End of list indicator */}
      {!hasMore && currentCount > 0 && (
        <p className="text-sm text-gray-400">No more scans to load</p>
      )}
    </div>
  );
}
