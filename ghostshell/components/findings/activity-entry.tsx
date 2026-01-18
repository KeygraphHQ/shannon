"use client";

import {
  MessageSquare,
  ArrowRight,
  User,
  Loader2,
} from "lucide-react";
import type { ActivityEntry as ActivityEntryType, FindingStatus } from "@/lib/types/findings";

interface ActivityEntryProps {
  entry: ActivityEntryType;
  isPending?: boolean;
}

const STATUS_LABELS: Record<FindingStatus, string> = {
  open: "Open",
  fixed: "Fixed",
  accepted_risk: "Accepted Risk",
  false_positive: "False Positive",
};

const STATUS_COLORS: Record<FindingStatus, string> = {
  open: "text-yellow-700 bg-yellow-50",
  fixed: "text-green-700 bg-green-50",
  accepted_risk: "text-blue-700 bg-blue-50",
  false_positive: "text-gray-700 bg-gray-50",
};

export function ActivityEntry({ entry, isPending = false }: ActivityEntryProps) {
  const userName = entry.user?.name || (isPending ? "You" : "Unknown User");
  const avatarUrl = entry.user?.avatarUrl;
  const formattedDate = isPending ? "Saving..." : formatRelativeTime(entry.createdAt);

  if (entry.type === "note") {
    return (
      <div className={`flex gap-3 ${isPending ? "opacity-70" : ""}`}>
        {/* Avatar */}
        <div className="flex-shrink-0">
          {isPending ? (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100">
              <Loader2 className="h-4 w-4 text-indigo-600 animate-spin" />
            </div>
          ) : avatarUrl ? (
            <img
              src={avatarUrl}
              alt={userName}
              className="h-8 w-8 rounded-full"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100">
              <User className="h-4 w-4 text-indigo-600" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900">{userName}</span>
            <span className="text-gray-400">added a note</span>
            <span className="text-xs text-gray-500">{formattedDate}</span>
          </div>
          <div className={`mt-2 rounded-lg border p-3 ${
            isPending
              ? "border-indigo-200 bg-indigo-50"
              : "border-gray-200 bg-gray-50"
          }`}>
            <div className="flex items-start gap-2">
              <MessageSquare className={`h-4 w-4 flex-shrink-0 mt-0.5 ${
                isPending ? "text-indigo-400" : "text-gray-400"
              }`} />
              <p className={`text-sm whitespace-pre-wrap break-words ${
                isPending ? "text-indigo-700" : "text-gray-700"
              }`}>
                {entry.content}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Status change entry
  return (
    <div className="flex gap-3">
      {/* Avatar */}
      <div className="flex-shrink-0">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={userName}
            className="h-8 w-8 rounded-full"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
            <User className="h-4 w-4 text-gray-600" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-gray-900">{userName}</span>
          <span className="text-gray-400">changed status</span>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              STATUS_COLORS[entry.previousStatus]
            }`}
          >
            {STATUS_LABELS[entry.previousStatus]}
          </span>
          <ArrowRight className="h-3 w-3 text-gray-400" />
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              STATUS_COLORS[entry.newStatus]
            }`}
          >
            {STATUS_LABELS[entry.newStatus]}
          </span>
          <span className="text-xs text-gray-500">{formattedDate}</span>
        </div>

        {entry.justification && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm text-amber-800">
              <span className="font-medium">Justification:</span>{" "}
              {entry.justification}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  if (hours < 24) {
    return `${hours}h ago`;
  }
  if (days < 7) {
    return `${days}d ago`;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: now.getFullYear() !== new Date(date).getFullYear() ? "numeric" : undefined,
  }).format(new Date(date));
}
