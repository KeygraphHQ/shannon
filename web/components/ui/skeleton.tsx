"use client";

import { type HTMLAttributes } from "react";

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
}

/**
 * Base skeleton component with pulse animation
 */
export function Skeleton({ className = "", ...props }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-gray-200 rounded ${className}`}
      {...props}
    />
  );
}

/**
 * Text skeleton - single line of text
 */
export function SkeletonText({
  width = "w-full",
  className = "",
}: {
  width?: string;
  className?: string;
}) {
  return <Skeleton className={`h-4 ${width} ${className}`} />;
}

/**
 * Heading skeleton - larger text
 */
export function SkeletonHeading({
  width = "w-48",
  className = "",
}: {
  width?: string;
  className?: string;
}) {
  return <Skeleton className={`h-6 ${width} ${className}`} />;
}

/**
 * Avatar skeleton - circular
 */
export function SkeletonAvatar({
  size = "w-10 h-10",
  className = "",
}: {
  size?: string;
  className?: string;
}) {
  return <Skeleton className={`rounded-full ${size} ${className}`} />;
}

/**
 * Button skeleton
 */
export function SkeletonButton({
  width = "w-24",
  className = "",
}: {
  width?: string;
  className?: string;
}) {
  return <Skeleton className={`h-10 ${width} rounded-md ${className}`} />;
}

/**
 * Card skeleton - full card placeholder
 */
export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`border rounded-lg p-4 space-y-4 ${className}`}>
      <div className="flex items-center gap-3">
        <SkeletonAvatar />
        <div className="flex-1 space-y-2">
          <SkeletonText width="w-32" />
          <SkeletonText width="w-24" />
        </div>
      </div>
      <div className="space-y-2">
        <SkeletonText />
        <SkeletonText width="w-3/4" />
      </div>
    </div>
  );
}

/**
 * Table row skeleton
 */
export function SkeletonTableRow({
  columns = 4,
  className = "",
}: {
  columns?: number;
  className?: string;
}) {
  return (
    <tr className={className}>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <SkeletonText width={i === 0 ? "w-24" : i === columns - 1 ? "w-16" : "w-full"} />
        </td>
      ))}
    </tr>
  );
}

/**
 * Table skeleton - full table with header
 */
export function SkeletonTable({
  rows = 5,
  columns = 4,
  className = "",
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <table className={`w-full ${className}`}>
      <thead>
        <tr className="border-b">
          {Array.from({ length: columns }).map((_, i) => (
            <th key={i} className="px-4 py-3 text-left">
              <SkeletonText width="w-20" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonTableRow key={i} columns={columns} />
        ))}
      </tbody>
    </table>
  );
}

/**
 * List item skeleton
 */
export function SkeletonListItem({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 p-3 ${className}`}>
      <SkeletonAvatar size="w-8 h-8" />
      <div className="flex-1 space-y-1.5">
        <SkeletonText width="w-40" />
        <SkeletonText width="w-24" className="h-3" />
      </div>
      <SkeletonButton width="w-16" className="h-8" />
    </div>
  );
}

/**
 * Dashboard stats skeleton
 */
export function SkeletonStats({ className = "" }: { className?: string }) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 ${className}`}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="border rounded-lg p-4 space-y-2">
          <SkeletonText width="w-20" className="h-3" />
          <Skeleton className="h-8 w-16" />
          <SkeletonText width="w-32" className="h-3" />
        </div>
      ))}
    </div>
  );
}

/**
 * Form skeleton
 */
export function SkeletonForm({
  fields = 3,
  className = "",
}: {
  fields?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <SkeletonText width="w-24" className="h-3" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      ))}
      <SkeletonButton width="w-full" className="mt-4" />
    </div>
  );
}
