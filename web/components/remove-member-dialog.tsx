"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, X } from "lucide-react";
import { removeMember } from "@/lib/actions/memberships";

interface TeamMember {
  id: string;
  role: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

interface RemoveMemberDialogProps {
  isOpen: boolean;
  onClose: () => void;
  member: TeamMember;
  orgId: string;
}

export function RemoveMemberDialog({
  isOpen,
  onClose,
  member,
  orgId,
}: RemoveMemberDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;

  const handleRemove = () => {
    setError(null);
    startTransition(async () => {
      try {
        await removeMember(orgId, member.user.id);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove member");
      }
    });
  };

  const handleClose = () => {
    if (isPending) return;
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              Remove Team Member
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isPending}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-100 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
              <span className="text-lg font-medium text-gray-600">
                {(member.user.name || member.user.email)[0].toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">
                {member.user.name || member.user.email.split("@")[0]}
              </p>
              <p className="text-sm text-gray-500">{member.user.email}</p>
            </div>
          </div>

          <div className="rounded-lg bg-amber-50 border border-amber-100 p-4">
            <p className="text-sm text-amber-800">
              Are you sure you want to remove this member from the organization?
              They will lose access to all scans and data immediately.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            onClick={handleClose}
            disabled={isPending}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleRemove}
            disabled={isPending}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Removing..." : "Remove Member"}
          </button>
        </div>
      </div>
    </div>
  );
}
