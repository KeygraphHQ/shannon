"use client";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for the finding detail page.
 * Displays placeholder content while finding details are being fetched.
 */
export function FindingDetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        {/* Back link */}
        <div className="h-5 w-24 rounded bg-gray-200 animate-pulse" />

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              {/* Severity badge */}
              <div className="h-6 w-16 rounded-full bg-gray-200 animate-pulse" />
              {/* Title */}
              <div className="h-8 w-64 rounded bg-gray-200 animate-pulse" />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <div className="h-4 w-48 rounded bg-gray-200 animate-pulse" />
              <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
            </div>
          </div>
          {/* Status select */}
          <div className="h-10 w-36 rounded-lg bg-gray-200 animate-pulse" />
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Description & Evidence */}
        <div className="space-y-6 lg:col-span-2">
          {/* Description */}
          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-6 py-4">
              <div className="h-6 w-28 rounded bg-gray-200 animate-pulse" />
            </div>
            <div className="px-6 py-4 space-y-2">
              <div className="h-4 w-full rounded bg-gray-200 animate-pulse" />
              <div className="h-4 w-full rounded bg-gray-200 animate-pulse" />
              <div className="h-4 w-3/4 rounded bg-gray-200 animate-pulse" />
            </div>
          </section>

          {/* Evidence */}
          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-6 py-4">
              <div className="h-6 w-20 rounded bg-gray-200 animate-pulse" />
              <div className="mt-1 h-4 w-56 rounded bg-gray-200 animate-pulse" />
            </div>
            <div className="px-6 py-4 space-y-4">
              {/* Evidence item placeholders */}
              {[...Array(3)].map((_, i) => (
                <div key={i} className="rounded-lg border border-gray-200 p-4 space-y-2">
                  <div className="h-4 w-24 rounded bg-gray-200 animate-pulse" />
                  <div className="h-4 w-full rounded bg-gray-200 animate-pulse" />
                  <div className="h-4 w-2/3 rounded bg-gray-200 animate-pulse" />
                </div>
              ))}
            </div>
          </section>

          {/* Remediation */}
          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-6 py-4">
              <div className="h-6 w-44 rounded bg-gray-200 animate-pulse" />
            </div>
            <div className="px-6 py-4">
              <div className="rounded-lg bg-green-50 border border-green-100 p-4 space-y-2">
                <div className="h-4 w-full rounded bg-green-200 animate-pulse" />
                <div className="h-4 w-full rounded bg-green-200 animate-pulse" />
                <div className="h-4 w-3/4 rounded bg-green-200 animate-pulse" />
              </div>
            </div>
          </section>
        </div>

        {/* Right Column - Metadata */}
        <div className="space-y-6">
          {/* Technical Details */}
          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-6 py-4">
              <div className="h-6 w-36 rounded bg-gray-200 animate-pulse" />
            </div>
            <div className="px-6 py-4 space-y-4">
              {/* Category */}
              <div className="space-y-1">
                <div className="h-3 w-16 rounded bg-gray-200 animate-pulse" />
                <div className="h-6 w-24 rounded-full bg-gray-200 animate-pulse" />
              </div>
              {/* CWE */}
              <div className="space-y-1">
                <div className="h-3 w-24 rounded bg-gray-200 animate-pulse" />
                <div className="h-4 w-20 rounded bg-gray-200 animate-pulse" />
              </div>
              {/* CVSS */}
              <div className="space-y-1">
                <div className="h-3 w-20 rounded bg-gray-200 animate-pulse" />
                <div className="h-6 w-16 rounded-full bg-gray-200 animate-pulse" />
              </div>
              {/* Severity */}
              <div className="space-y-1">
                <div className="h-3 w-16 rounded bg-gray-200 animate-pulse" />
                <div className="h-6 w-16 rounded-full bg-gray-200 animate-pulse" />
              </div>
            </div>
          </section>

          {/* Timeline */}
          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-6 py-4">
              <div className="h-6 w-20 rounded bg-gray-200 animate-pulse" />
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="space-y-1">
                <div className="h-3 w-20 rounded bg-gray-200 animate-pulse" />
                <div className="h-4 w-36 rounded bg-gray-200 animate-pulse" />
              </div>
              <div className="space-y-1">
                <div className="h-3 w-24 rounded bg-gray-200 animate-pulse" />
                <div className="h-4 w-36 rounded bg-gray-200 animate-pulse" />
              </div>
            </div>
          </section>

          {/* Scan Info */}
          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-6 py-4">
              <div className="h-6 w-28 rounded bg-gray-200 animate-pulse" />
            </div>
            <div className="px-6 py-4">
              <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
            </div>
          </section>
        </div>
      </div>

      {/* Activity Section Skeleton */}
      <FindingActivitySkeleton />
    </div>
  );
}

/**
 * Loading skeleton for the activity section.
 */
export function FindingActivitySkeleton() {
  return (
    <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div>
          <div className="h-6 w-20 rounded bg-gray-200 animate-pulse" />
          <div className="mt-1 h-4 w-56 rounded bg-gray-200 animate-pulse" />
        </div>
        <div className="h-8 w-20 rounded-lg bg-gray-200 animate-pulse" />
      </div>

      {/* Note Form placeholder */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="h-20 w-full rounded-lg bg-gray-200 animate-pulse" />
        <div className="mt-2 flex justify-end">
          <div className="h-9 w-24 rounded-lg bg-gray-200 animate-pulse" />
        </div>
      </div>

      {/* Activity Items */}
      <div className="px-6 py-4 space-y-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className="h-8 w-8 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-4 w-24 rounded bg-gray-200 animate-pulse" />
                <div className="h-3 w-32 rounded bg-gray-200 animate-pulse" />
              </div>
              <div className="h-4 w-full rounded bg-gray-200 animate-pulse" />
              <div className="h-4 w-2/3 rounded bg-gray-200 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
