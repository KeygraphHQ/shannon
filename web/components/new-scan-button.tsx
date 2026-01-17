"use client";

import { useState } from "react";
import { Shield } from "lucide-react";
import { NewScanModal } from "./new-scan-modal";

interface NewScanButtonProps {
  organizationId: string;
}

export function NewScanButton({ organizationId }: NewScanButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors"
      >
        <Shield className="h-4 w-4" />
        New Scan
      </button>

      <NewScanModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        organizationId={organizationId}
      />
    </>
  );
}
