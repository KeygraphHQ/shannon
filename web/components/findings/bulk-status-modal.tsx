"use client";

import { useState, useTransition } from "react";
import {
  X,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { bulkUpdateFindingStatus } from "@/lib/actions/findings";
import type { FindingStatus } from "@/lib/types/findings";

interface BulkStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selectedIds: string[];
  targetStatus: FindingStatus;
}

const STATUS_CONFIG: Record<
  FindingStatus,
  { label: string; icon: typeof CheckCircle; color: string; description: string }
> = {
  open: {
    label: "Open",
    icon: AlertTriangle,
    color: "text-yellow-600",
    description: "Mark these findings as open issues that need attention.",
  },
  fixed: {
    label: "Fixed",
    icon: CheckCircle,
    color: "text-green-600",
    description: "Mark these findings as resolved.",
  },
  accepted_risk: {
    label: "Accepted Risk",
    icon: ShieldCheck,
    color: "text-blue-600",
    description: "Accept the risk for these findings. Justification is required.",
  },
  false_positive: {
    label: "False Positive",
    icon: XCircle,
    color: "text-gray-600",
    description: "Mark these findings as false positives. Justification is required.",
  },
};

const JUSTIFICATION_REQUIRED: FindingStatus[] = ["accepted_risk", "false_positive"];

export function BulkStatusModal({
  isOpen,
  onClose,
  onSuccess,
  selectedIds,
  targetStatus,
}: BulkStatusModalProps) {
  const [justification, setJustification] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;

  const config = STATUS_CONFIG[targetStatus];
  const Icon = config.icon;
  const requiresJustification = JUSTIFICATION_REQUIRED.includes(targetStatus);

  const handleSubmit = () => {
    if (requiresJustification && !justification.trim()) {
      setError("Justification is required for this status");
      return;
    }

    setError(null);

    startTransition(async () => {
      try {
        await bulkUpdateFindingStatus(
          selectedIds,
          targetStatus,
          justification.trim() || undefined
        );
        setJustification("");
        onSuccess();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update findings");
      }
    });
  };

  const handleClose = () => {
    if (isPending) return;
    setJustification("");
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <Icon className={`h-5 w-5 ${config.color}`} />
            <h2 className="text-lg font-semibold text-gray-900">
              Update {selectedIds.length} Finding{selectedIds.length !== 1 ? "s" : ""}
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
          <p className="text-sm text-gray-600">{config.description}</p>

          <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
            <p className="text-sm text-gray-700">
              <span className="font-medium">{selectedIds.length}</span> finding
              {selectedIds.length !== 1 ? "s" : ""} will be marked as{" "}
              <span className={`font-medium ${config.color}`}>{config.label}</span>
            </p>
          </div>

          {requiresJustification && (
            <div>
              <label
                htmlFor="bulk-justification"
                className="block text-sm font-medium text-gray-700"
              >
                Justification <span className="text-red-500">*</span>
              </label>
              <textarea
                id="bulk-justification"
                rows={3}
                value={justification}
                onChange={(e) => {
                  setJustification(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={
                  targetStatus === "accepted_risk"
                    ? "e.g., Risk accepted per security review. Compensating controls in place."
                    : "e.g., These are test environment endpoints not exposed in production."
                }
                disabled={isPending}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
              />
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
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
            onClick={handleSubmit}
            disabled={isPending || (requiresJustification && !justification.trim())}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              <>
                <Icon className="h-4 w-4" />
                Update Status
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
