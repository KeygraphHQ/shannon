"use client";

import { useState, useEffect } from "react";
import { Shield, RefreshCw, AlertCircle } from "lucide-react";
import {
  ComplianceScorecard,
  ControlList,
  FrameworkSelector,
} from "@/components/compliance";
import type {
  ComplianceScorecard as ScorecardType,
  ScanComplianceView,
  FrameworkSummary,
} from "@/lib/compliance/types";

interface ScanComplianceTabProps {
  scanId: string;
  scanStatus: string;
}

export function ScanComplianceTab({ scanId, scanStatus }: ScanComplianceTabProps) {
  const [frameworks, setFrameworks] = useState<FrameworkSummary[]>([]);
  const [selectedFrameworkId, setSelectedFrameworkId] = useState<string>("");
  const [scorecard, setScorecard] = useState<ScorecardType | null>(null);
  const [complianceView, setComplianceView] = useState<ScanComplianceView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRemapping, setIsRemapping] = useState(false);

  // Fetch available frameworks
  useEffect(() => {
    async function fetchFrameworks() {
      try {
        const res = await fetch("/api/compliance/frameworks");
        if (!res.ok) throw new Error("Failed to fetch frameworks");
        const data = await res.json();
        setFrameworks(data.frameworks);
        if (data.frameworks.length > 0) {
          setSelectedFrameworkId(data.frameworks[0].id);
        }
      } catch (err) {
        setError("Failed to load compliance frameworks");
        console.error(err);
      }
    }
    fetchFrameworks();
  }, []);

  // Fetch compliance data when framework changes
  useEffect(() => {
    if (!selectedFrameworkId || scanStatus !== "COMPLETED") {
      setLoading(false);
      return;
    }

    async function fetchComplianceData() {
      setLoading(true);
      setError(null);

      try {
        // Fetch scorecard and detailed view in parallel
        const [scorecardRes, viewRes] = await Promise.all([
          fetch(
            `/api/compliance/scans/${scanId}/scorecard?frameworkId=${selectedFrameworkId}`
          ),
          fetch(
            `/api/compliance/scans/${scanId}/mappings?frameworkId=${selectedFrameworkId}`
          ),
        ]);

        if (!scorecardRes.ok) {
          const data = await scorecardRes.json();
          throw new Error(data.error || "Failed to fetch scorecard");
        }

        if (!viewRes.ok) {
          const data = await viewRes.json();
          throw new Error(data.error || "Failed to fetch compliance view");
        }

        const [scorecardData, viewData] = await Promise.all([
          scorecardRes.json(),
          viewRes.json(),
        ]);

        setScorecard(scorecardData);
        setComplianceView(viewData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load compliance data");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchComplianceData();
  }, [scanId, selectedFrameworkId, scanStatus]);

  // Handle remapping findings
  async function handleRemap() {
    if (isRemapping) return;

    setIsRemapping(true);
    setError(null);

    try {
      // We don't have a remap endpoint yet, but this shows the UI pattern
      // For now, just refetch the data
      const [scorecardRes, viewRes] = await Promise.all([
        fetch(
          `/api/compliance/scans/${scanId}/scorecard?frameworkId=${selectedFrameworkId}`
        ),
        fetch(
          `/api/compliance/scans/${scanId}/mappings?frameworkId=${selectedFrameworkId}`
        ),
      ]);

      const [scorecardData, viewData] = await Promise.all([
        scorecardRes.json(),
        viewRes.json(),
      ]);

      setScorecard(scorecardData);
      setComplianceView(viewData);
    } catch (err) {
      setError("Failed to refresh compliance data");
    } finally {
      setIsRemapping(false);
    }
  }

  // Navigate to finding detail
  function handleFindingClick(findingId: string) {
    window.location.href = `/dashboard/findings/${findingId}`;
  }

  if (scanStatus !== "COMPLETED") {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
        <Shield className="mx-auto h-12 w-12 text-gray-300" />
        <h3 className="mt-4 text-lg font-medium text-gray-900">
          Compliance View Unavailable
        </h3>
        <p className="mt-2 text-sm text-gray-500">
          Compliance mapping is available once the scan is completed.
        </p>
      </div>
    );
  }

  if (error && !loading) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
        <h3 className="mt-4 text-lg font-medium text-red-900">
          Error Loading Compliance Data
        </h3>
        <p className="mt-2 text-sm text-red-700">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Framework Selector */}
      <div className="flex items-center justify-between">
        <FrameworkSelector
          frameworks={frameworks}
          selectedId={selectedFrameworkId}
          onSelect={setSelectedFrameworkId}
          variant="compact"
        />

        <button
          type="button"
          onClick={handleRemap}
          disabled={isRemapping || loading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw
            className={`h-4 w-4 ${isRemapping ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {/* Loading skeleton */}
          <div className="h-48 animate-pulse rounded-lg bg-gray-100" />
          <div className="h-32 animate-pulse rounded-lg bg-gray-100" />
          <div className="h-32 animate-pulse rounded-lg bg-gray-100" />
        </div>
      ) : (
        <>
          {/* Scorecard */}
          {scorecard && (
            <ComplianceScorecard scorecard={scorecard} showCategories />
          )}

          {/* Control List */}
          {complianceView && complianceView.frameworks.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <ControlList
                categories={complianceView.frameworks[0].categories}
                frameworkName={complianceView.frameworks[0].frameworkName}
                collapsedByDefault
                showFindingCounts
                onFindingClick={handleFindingClick}
              />
            </div>
          )}

          {/* Empty state */}
          {(!complianceView || complianceView.frameworks.length === 0) && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
              <Shield className="mx-auto h-12 w-12 text-gray-300" />
              <h3 className="mt-4 text-lg font-medium text-gray-900">
                No Compliance Mappings
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                No findings have been mapped to compliance controls yet. Run a
                scan with findings to see compliance mappings.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
