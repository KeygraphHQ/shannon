import { FindingsListSkeleton } from "@/components/findings/findings-list-skeleton";

export default function FindingsLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="h-8 w-48 rounded bg-gray-200 animate-pulse" />
        <div className="mt-1 h-4 w-80 rounded bg-gray-200 animate-pulse" />
      </div>

      {/* Findings List Skeleton */}
      <FindingsListSkeleton />
    </div>
  );
}
