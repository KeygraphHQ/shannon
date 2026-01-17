"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  ChevronDown,
  X,
  Loader2,
} from "lucide-react";
import { updateFindingStatus } from "@/lib/actions/findings";
import type { FindingStatus } from "@/lib/types/findings";

interface FindingStatusSelectProps {
  findingId: string;
  currentStatus: FindingStatus;
  onStatusChange?: (newStatus: FindingStatus) => void;
}

const STATUS_CONFIG: Record<
  FindingStatus,
  { label: string; icon: typeof CheckCircle; className: string }
> = {
  open: {
    label: "Open",
    icon: AlertTriangle,
    className: "text-yellow-700 bg-yellow-50 border-yellow-200",
  },
  fixed: {
    label: "Fixed",
    icon: CheckCircle,
    className: "text-green-700 bg-green-50 border-green-200",
  },
  accepted_risk: {
    label: "Accepted Risk",
    icon: ShieldCheck,
    className: "text-blue-700 bg-blue-50 border-blue-200",
  },
  false_positive: {
    label: "False Positive",
    icon: XCircle,
    className: "text-gray-700 bg-gray-50 border-gray-200",
  },
};

const JUSTIFICATION_REQUIRED: FindingStatus[] = ["accepted_risk", "false_positive"];

export function FindingStatusSelect({
  findingId,
  currentStatus,
  onStatusChange,
}: FindingStatusSelectProps) {
  const [status, setStatus] = useState<FindingStatus>(currentStatus);
  const [isOpen, setIsOpen] = useState(false);
  const [showJustificationModal, setShowJustificationModal] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<FindingStatus | null>(null);
  const [justification, setJustification] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleStatusSelect = (newStatus: FindingStatus) => {
    setIsOpen(false);
    setError(null);

    if (newStatus === status) return;

    if (JUSTIFICATION_REQUIRED.includes(newStatus)) {
      setPendingStatus(newStatus);
      setShowJustificationModal(true);
      return;
    }

    // Direct status change (no justification needed)
    performStatusUpdate(newStatus);
  };

  const performStatusUpdate = (newStatus: FindingStatus, justificationText?: string) => {
    const previousStatus = status;

    // Optimistic update
    setStatus(newStatus);
    onStatusChange?.(newStatus);

    startTransition(async () => {
      try {
        await updateFindingStatus(findingId, newStatus, justificationText);
        setError(null);
      } catch (err) {
        // Rollback on error
        setStatus(previousStatus);
        onStatusChange?.(previousStatus);
        setError(err instanceof Error ? err.message : "Failed to update status");
      }
    });
  };

  const handleJustificationSubmit = () => {
    if (!pendingStatus || !justification.trim()) return;

    performStatusUpdate(pendingStatus, justification.trim());
    setShowJustificationModal(false);
    setPendingStatus(null);
    setJustification("");
  };

  const handleJustificationCancel = () => {
    setShowJustificationModal(false);
    setPendingStatus(null);
    setJustification("");
  };

  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <>
      {/* Status Dropdown */}
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={isPending}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${config.className} ${
            isPending ? "opacity-50 cursor-not-allowed" : "hover:opacity-80"
          }`}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Icon className="h-4 w-4" />
          )}
          {config.label}
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>

        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
            />

            {/* Dropdown Menu */}
            <div className="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-gray-200 bg-white shadow-lg">
              <div className="py-1">
                {(Object.keys(STATUS_CONFIG) as FindingStatus[]).map((statusOption) => {
                  const optionConfig = STATUS_CONFIG[statusOption];
                  const OptionIcon = optionConfig.icon;
                  const isSelected = statusOption === status;

                  return (
                    <button
                      key={statusOption}
                      onClick={() => handleStatusSelect(statusOption)}
                      className={`flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors ${
                        isSelected
                          ? "bg-gray-100 font-medium"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <OptionIcon className={`h-4 w-4 ${optionConfig.className.split(" ")[0]}`} />
                      {optionConfig.label}
                      {JUSTIFICATION_REQUIRED.includes(statusOption) && (
                        <span className="ml-auto text-xs text-gray-400">
                          Requires reason
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Error Message */}
        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
      </div>

      {/* Justification Modal */}
      {showJustificationModal && pendingStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {pendingStatus === "accepted_risk"
                  ? "Accept Risk"
                  : "Mark as False Positive"}
              </h2>
              <button
                onClick={handleJustificationCancel}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                {pendingStatus === "accepted_risk"
                  ? "Please provide a justification for accepting this risk. This will be recorded in the audit log."
                  : "Please explain why this finding is a false positive. This will be recorded in the audit log."}
              </p>

              <div>
                <label
                  htmlFor="justification"
                  className="block text-sm font-medium text-gray-700"
                >
                  Justification <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="justification"
                  rows={4}
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder={
                    pendingStatus === "accepted_risk"
                      ? "e.g., Risk accepted per security review on 2026-01-15. Compensating controls in place."
                      : "e.g., This is a test environment endpoint not exposed in production."
                  }
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <button
                onClick={handleJustificationCancel}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleJustificationSubmit}
                disabled={!justification.trim() || isPending}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? "Saving..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
