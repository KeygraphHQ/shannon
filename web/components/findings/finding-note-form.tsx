"use client";

import { useState, useTransition } from "react";
import { Send, Loader2 } from "lucide-react";
import { addFindingNote } from "@/lib/actions/findings";

interface FindingNoteFormProps {
  findingId: string;
  onNoteSubmit?: (content: string) => void;
  onNoteSuccess?: () => void;
  onNoteError?: () => void;
}

export function FindingNoteForm({
  findingId,
  onNoteSubmit,
  onNoteSuccess,
  onNoteError,
}: FindingNoteFormProps) {
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      setError("Note content cannot be empty");
      return;
    }

    setError(null);

    // Trigger optimistic update immediately
    onNoteSubmit?.(trimmedContent);

    // Clear the input optimistically
    const previousContent = content;
    setContent("");

    startTransition(async () => {
      try {
        await addFindingNote(findingId, trimmedContent);
        onNoteSuccess?.();
      } catch (err) {
        // Restore content on error
        setContent(previousContent);
        setError(err instanceof Error ? err.message : "Failed to add note");
        onNoteError?.();
      }
    });
  };

  const characterCount = content.length;
  const maxLength = 10000;
  const isOverLimit = characterCount > maxLength;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="note-content" className="sr-only">
          Add a note
        </label>
        <textarea
          id="note-content"
          rows={3}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Add a note about this finding..."
          disabled={isPending}
          className={`block w-full rounded-lg border px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 transition-colors ${
            isOverLimit || error
              ? "border-red-300 focus:border-red-500 focus:ring-red-500"
              : "border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
          } ${isPending ? "bg-gray-50 cursor-not-allowed" : ""}`}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className={`text-xs ${
              isOverLimit ? "text-red-600 font-medium" : "text-gray-500"
            }`}
          >
            {characterCount.toLocaleString()} / {maxLength.toLocaleString()}
          </span>
          {error && (
            <span className="text-xs text-red-600">{error}</span>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending || !content.trim() || isOverLimit}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Adding...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Add Note
            </>
          )}
        </button>
      </div>
    </form>
  );
}
