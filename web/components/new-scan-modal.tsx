"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Shield, Loader2 } from "lucide-react";
import { createScan } from "@/lib/actions/scans";

interface NewScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
}

export function NewScanModal({
  isOpen,
  onClose,
  organizationId,
}: NewScanModalProps) {
  const router = useRouter();
  const [targetUrl, setTargetUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await createScan({
        targetUrl,
        organizationId,
      });

      if (result.error) {
        setError(result.error);
        setIsSubmitting(false);
        return;
      }

      if (result.success && result.scanId) {
        // Redirect to scan progress page
        router.push(`/dashboard/scans/${result.scanId}`);
        onClose();
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
              <Shield className="h-5 w-5 text-indigo-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">
              New Security Scan
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-4">
            <div>
              <label
                htmlFor="targetUrl"
                className="block text-sm font-medium text-gray-700"
              >
                Target URL
              </label>
              <input
                type="url"
                id="targetUrl"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://example.com"
                required
                disabled={isSubmitting}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-50"
              />
              <p className="mt-2 text-sm text-gray-500">
                Enter the URL of the application you want to scan for security
                vulnerabilities.
              </p>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> The scan will test for OWASP Top 10
                vulnerabilities including injection attacks, authentication
                flaws, and more. Scan duration: 10-30 minutes.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !targetUrl}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Starting Scan...
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4" />
                  Start Scan
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
