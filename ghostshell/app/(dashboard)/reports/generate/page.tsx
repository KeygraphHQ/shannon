"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, AlertTriangle, CheckCircle } from "lucide-react";
import { TemplateSelector, type ReportTemplateType } from "@/components/reports/TemplateSelector";
import { FindingsBreakdown } from "@/components/scans/findings-breakdown";

interface Scan {
  id: string;
  status: string;
  completedAt: Date | null;
  findingsCount: number;
  criticalCount: number;
  highCount: number;
  project: {
    id: string;
    name: string;
    targetUrl: string;
  };
}

export default function GenerateReportPage() {
  const router = useRouter();
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [selectedScanId, setSelectedScanId] = useState<string>("");
  const [reportType, setReportType] = useState<ReportTemplateType>("EXECUTIVE");
  const [title, setTitle] = useState("");

  // Fetch available scans
  useEffect(() => {
    async function fetchScans() {
      try {
        const response = await fetch("/api/scans?status=COMPLETED&limit=50");
        if (response.ok) {
          const data = await response.json();
          setScans(data.scans || []);
        }
      } catch (err) {
        console.error("Failed to fetch scans:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchScans();
  }, []);

  const selectedScan = scans.find((s) => s.id === selectedScanId);

  // Generate default title when scan changes
  useEffect(() => {
    if (selectedScan && !title) {
      const typeLabel =
        reportType === "EXECUTIVE"
          ? "Executive"
          : reportType === "TECHNICAL"
            ? "Technical"
            : reportType === "COMPLIANCE"
              ? "Compliance"
              : "Custom";
      setTitle(`${typeLabel} Report - ${selectedScan.project.name}`);
    }
  }, [selectedScan, reportType, title]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!selectedScanId) {
      setError("Please select a scan");
      return;
    }

    setGenerating(true);

    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scanId: selectedScanId,
          type: reportType,
          title: title || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate report");
      }

      setSuccess("Report generated successfully!");

      // Redirect to the new report
      setTimeout(() => {
        router.push(`/dashboard/reports/${data.id}`);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back link */}
      <Link
        href="/dashboard/reports"
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Reports
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Generate Report</h1>
        <p className="mt-1 text-sm text-gray-500">
          Create a security assessment report from a completed scan
        </p>
      </div>

      {/* Error/Success messages */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <p className="text-sm text-green-700">{success}</p>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Scan selection */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Select Scan
          </label>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 text-indigo-600 animate-spin" />
            </div>
          ) : scans.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No completed scans available.</p>
              <Link
                href="/dashboard"
                className="mt-2 text-sm text-indigo-600 hover:text-indigo-500"
              >
                Start a new scan →
              </Link>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {scans.map((scan) => (
                <button
                  key={scan.id}
                  type="button"
                  onClick={() => setSelectedScanId(scan.id)}
                  className={`w-full text-left rounded-lg border-2 p-4 transition-all ${
                    selectedScanId === scan.id
                      ? "border-indigo-600 bg-indigo-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{scan.project.name}</p>
                      <p className="text-sm text-gray-500">{scan.project.targetUrl}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500">
                        {scan.completedAt
                          ? new Date(scan.completedAt).toLocaleDateString()
                          : ""}
                      </p>
                      <p className="text-sm font-medium text-gray-900">
                        {scan.findingsCount} findings
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected scan details */}
        {selectedScan && (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Scan Summary</h3>
            <FindingsBreakdown
              criticalCount={selectedScan.criticalCount}
              highCount={selectedScan.highCount}
              mediumCount={0}
              lowCount={0}
              variant="inline"
            />
          </div>
        )}

        {/* Report type selection */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Report Type
          </label>
          <TemplateSelector
            value={reportType}
            onChange={setReportType}
            disabled={generating}
          />
        </div>

        {/* Title */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
            Report Title (optional)
          </label>
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter a custom title for the report"
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            disabled={generating}
          />
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3">
          <Link
            href="/dashboard/reports"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={!selectedScanId || generating}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              "Generate Report"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
