"use client";

import { useState, useEffect, useCallback, useOptimistic } from "react";
import { History, RefreshCw, Loader2 } from "lucide-react";
import { getFindingActivity } from "@/lib/actions/findings";
import { FindingNoteForm } from "./finding-note-form";
import { ActivityEntry } from "./activity-entry";
import type { ActivityEntry as ActivityEntryType, NoteActivity } from "@/lib/types/findings";

interface FindingActivityProps {
  findingId: string;
  initialActivity?: ActivityEntryType[];
}

// Optimistic note with pending state
interface OptimisticNote extends NoteActivity {
  isPending?: boolean;
}

export function FindingActivity({ findingId, initialActivity = [] }: FindingActivityProps) {
  const [activity, setActivity] = useState<ActivityEntryType[]>(initialActivity);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Optimistic updates for notes
  const [optimisticActivity, addOptimisticNote] = useOptimistic<
    (ActivityEntryType | OptimisticNote)[],
    OptimisticNote
  >(
    activity,
    (state, newNote) => [newNote, ...state]
  );

  const loadActivity = useCallback(async (showRefreshState = false) => {
    if (showRefreshState) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const data = await getFindingActivity(findingId);
      setActivity(data);
    } catch (error) {
      console.error("Failed to load activity:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [findingId]);

  // Load activity on mount if no initial data
  useEffect(() => {
    if (initialActivity.length === 0) {
      loadActivity();
    }
  }, [initialActivity.length, loadActivity]);

  // Create optimistic note for immediate display
  const createOptimisticNote = useCallback((content: string): OptimisticNote => {
    return {
      type: "note" as const,
      id: `optimistic-${Date.now()}`,
      content,
      createdAt: new Date(),
      user: null, // Will be replaced with actual user after server confirms
      isPending: true,
    };
  }, []);

  const handleNoteSubmit = useCallback((content: string) => {
    const optimisticNote = createOptimisticNote(content);
    addOptimisticNote(optimisticNote);
  }, [addOptimisticNote, createOptimisticNote]);

  const handleNoteSuccess = useCallback(() => {
    // Refresh to get the real note from server
    loadActivity(true);
  }, [loadActivity]);

  const handleNoteError = useCallback(() => {
    // On error, refresh to remove optimistic note and show real state
    loadActivity(true);
  }, [loadActivity]);

  return (
    <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <History className="h-5 w-5" />
            Activity
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Notes and status changes for this finding
          </p>
        </div>
        <button
          onClick={() => loadActivity(true)}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRefreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </button>
      </div>

      {/* Add Note Form */}
      <div className="border-b border-gray-200 px-6 py-4">
        <FindingNoteForm
          findingId={findingId}
          onNoteSubmit={handleNoteSubmit}
          onNoteSuccess={handleNoteSuccess}
          onNoteError={handleNoteError}
        />
      </div>

      {/* Activity Timeline */}
      <div className="px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-500">Loading activity...</span>
          </div>
        ) : optimisticActivity.length === 0 ? (
          <div className="py-8 text-center">
            <History className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-2 text-sm text-gray-500">
              No activity yet. Add a note or change the status to start tracking.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {optimisticActivity.map((entry) => (
              <ActivityEntry
                key={entry.id}
                entry={entry}
                isPending={"isPending" in entry && entry.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
