"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";

interface DeleteOrgModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  orgName: string;
  isPending: boolean;
}

export function DeleteOrgModal({
  isOpen,
  onClose,
  onConfirm,
  orgName,
  isPending,
}: DeleteOrgModalProps) {
  const [confirmText, setConfirmText] = useState("");

  if (!isOpen) return null;

  const isConfirmValid = confirmText === orgName;

  const handleClose = () => {
    if (isPending) return;
    setConfirmText("");
    onClose();
  };

  const handleConfirm = async () => {
    if (!isConfirmValid || isPending) return;
    await onConfirm();
    setConfirmText("");
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
              Delete Organization
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
          <div className="rounded-lg bg-red-50 border border-red-100 p-4">
            <p className="text-sm text-red-800">
              <strong>Warning:</strong> This action will schedule{" "}
              <strong>{orgName}</strong> for deletion. After 30 days, all data
              including:
            </p>
            <ul className="mt-2 text-sm text-red-700 list-disc list-inside space-y-1">
              <li>All security scans and findings</li>
              <li>Team members and their access</li>
              <li>Organization settings and configurations</li>
              <li>Audit logs and activity history</li>
            </ul>
            <p className="mt-2 text-sm text-red-800">
              will be <strong>permanently deleted</strong> and cannot be recovered.
            </p>
          </div>

          <div className="rounded-lg bg-amber-50 border border-amber-100 p-4">
            <p className="text-sm text-amber-800">
              <strong>Grace period:</strong> You will have 30 days to cancel the
              deletion before data is permanently removed.
            </p>
          </div>

          <div>
            <label
              htmlFor="confirm-text"
              className="block text-sm font-medium text-gray-700"
            >
              Type <span className="font-mono font-bold">{orgName}</span> to
              confirm:
            </label>
            <input
              type="text"
              id="confirm-text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={orgName}
              disabled={isPending}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
            />
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
            onClick={handleConfirm}
            disabled={!isConfirmValid || isPending}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Scheduling Deletion..." : "Delete Organization"}
          </button>
        </div>
      </div>
    </div>
  );
}
