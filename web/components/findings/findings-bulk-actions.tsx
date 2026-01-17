"use client";

import { useState } from "react";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  X,
} from "lucide-react";
import { BulkStatusModal } from "./bulk-status-modal";
import type { FindingStatus } from "@/lib/types/findings";

interface FindingsBulkActionsProps {
  selectedCount: number;
  selectedIds: string[];
  totalCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onSuccess: () => void;
  allSelected: boolean;
}

const BULK_ACTIONS: {
  status: FindingStatus;
  label: string;
  icon: typeof CheckCircle;
  color: string;
}[] = [
  {
    status: "fixed",
    label: "Mark Fixed",
    icon: CheckCircle,
    color: "text-green-600 hover:bg-green-50",
  },
  {
    status: "open",
    label: "Reopen",
    icon: AlertTriangle,
    color: "text-yellow-600 hover:bg-yellow-50",
  },
  {
    status: "accepted_risk",
    label: "Accept Risk",
    icon: ShieldCheck,
    color: "text-blue-600 hover:bg-blue-50",
  },
  {
    status: "false_positive",
    label: "False Positive",
    icon: XCircle,
    color: "text-gray-600 hover:bg-gray-50",
  },
];

export function FindingsBulkActions({
  selectedCount,
  selectedIds,
  totalCount,
  onSelectAll,
  onClearSelection,
  onSuccess,
  allSelected,
}: FindingsBulkActionsProps) {
  const [modalStatus, setModalStatus] = useState<FindingStatus | null>(null);

  if (selectedCount === 0) {
    return null;
  }

  return (
    <>
      <div className="sticky top-0 z-10 flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center h-6 min-w-6 px-2 rounded-full bg-indigo-600 text-xs font-bold text-white">
              {selectedCount}
            </span>
            <span className="text-sm font-medium text-indigo-900">
              {selectedCount === 1 ? "finding" : "findings"} selected
            </span>
          </div>

          <div className="h-4 w-px bg-indigo-200" />

          {!allSelected && selectedCount < totalCount && (
            <button
              onClick={onSelectAll}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              Select all {totalCount}
            </button>
          )}

          <button
            onClick={onClearSelection}
            className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        </div>

        <div className="flex items-center gap-2">
          {BULK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.status}
                onClick={() => setModalStatus(action.status)}
                className={`inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium transition-colors ${action.color}`}
              >
                <Icon className="h-4 w-4" />
                {action.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bulk Status Modal */}
      {modalStatus && (
        <BulkStatusModal
          isOpen={true}
          onClose={() => setModalStatus(null)}
          onSuccess={() => {
            onSuccess();
            onClearSelection();
          }}
          selectedIds={selectedIds}
          targetStatus={modalStatus}
        />
      )}
    </>
  );
}
