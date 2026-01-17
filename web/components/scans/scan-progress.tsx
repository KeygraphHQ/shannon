"use client";

import { useEffect, useState } from "react";
import { Loader2, CheckCircle, AlertCircle, XCircle, Clock } from "lucide-react";

interface ScanProgress {
  status: string;
  currentPhase: string | null;
  currentAgent: string | null;
  progressPercent: number;
  elapsedMs: number;
  estimatedRemainingMs: number | null;
  findingsCount: number;
  completedAgents: string[];
  complete?: boolean;
  error?: string;
}

interface ScanProgressProps {
  scanId: string;
  initialStatus?: string;
  onComplete?: () => void;
}

const PHASE_LABELS: Record<string, string> = {
  "pre-recon": "Pre-Reconnaissance",
  recon: "Reconnaissance",
  "vulnerability-exploitation": "Vulnerability Analysis",
  exploitation: "Exploitation",
  reporting: "Generating Report",
};

const AGENT_LABELS: Record<string, string> = {
  "pre-recon": "External Scan",
  recon: "Analysis",
  "injection-vuln": "Injection Testing",
  "xss-vuln": "XSS Testing",
  "auth-vuln": "Authentication Testing",
  "authz-vuln": "Authorization Testing",
  "ssrf-vuln": "SSRF Testing",
  "injection-exploit": "Exploiting Injections",
  "xss-exploit": "Exploiting XSS",
  "auth-exploit": "Exploiting Auth",
  "authz-exploit": "Exploiting Authz",
  "ssrf-exploit": "Exploiting SSRF",
  report: "Report Generation",
};

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export function ScanProgress({ scanId, initialStatus, onComplete }: ScanProgressProps) {
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Don't connect if scan is already complete
    if (initialStatus && ["COMPLETED", "FAILED", "CANCELLED", "TIMEOUT"].includes(initialStatus)) {
      return;
    }

    const eventSource = new EventSource(`/api/scans/${scanId}/progress`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as ScanProgress;
        setProgress(data);

        if (data.complete || data.error) {
          eventSource.close();
          if (onComplete) {
            onComplete();
          }
        }
      } catch (err) {
        console.error("Failed to parse progress:", err);
      }
    };

    eventSource.onerror = () => {
      setError("Connection lost. Refresh to reconnect.");
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [scanId, initialStatus, onComplete]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="flex items-center gap-2 text-red-700">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!progress) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
        <div className="flex items-center justify-center gap-2 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Connecting to scan...</span>
        </div>
      </div>
    );
  }

  const phaseLabel = progress.currentPhase
    ? PHASE_LABELS[progress.currentPhase] || progress.currentPhase
    : "Initializing";

  const agentLabel = progress.currentAgent
    ? AGENT_LABELS[progress.currentAgent] || progress.currentAgent
    : null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {progress.status === "RUNNING" && (
            <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
          )}
          {progress.status === "COMPLETED" && (
            <CheckCircle className="h-5 w-5 text-green-600" />
          )}
          {progress.status === "FAILED" && (
            <XCircle className="h-5 w-5 text-red-600" />
          )}
          {progress.status === "CANCELLED" && (
            <XCircle className="h-5 w-5 text-gray-600" />
          )}
          <span className="font-medium text-gray-900">
            {progress.status === "RUNNING" && "Scan in Progress"}
            {progress.status === "COMPLETED" && "Scan Complete"}
            {progress.status === "FAILED" && "Scan Failed"}
            {progress.status === "CANCELLED" && "Scan Cancelled"}
            {progress.status === "TIMEOUT" && "Scan Timed Out"}
            {progress.status === "PENDING" && "Scan Pending"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Clock className="h-4 w-4" />
          <span>{formatDuration(progress.elapsedMs)}</span>
          {progress.estimatedRemainingMs && progress.status === "RUNNING" && (
            <span className="text-gray-400">
              (~{formatDuration(progress.estimatedRemainingMs)} remaining)
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>{phaseLabel}</span>
          <span>{progress.progressPercent}%</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-600 transition-all duration-500"
            style={{ width: `${progress.progressPercent}%` }}
          />
        </div>
        {agentLabel && progress.status === "RUNNING" && (
          <p className="mt-1 text-sm text-gray-500">{agentLabel}</p>
        )}
      </div>

      {/* Completed agents */}
      {progress.completedAgents.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Completed Phases</p>
          <div className="flex flex-wrap gap-2">
            {progress.completedAgents.map((agent) => (
              <span
                key={agent}
                className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700"
              >
                <CheckCircle className="h-3 w-3" />
                {AGENT_LABELS[agent] || agent}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Findings count preview */}
      {progress.findingsCount > 0 && (
        <div className="pt-2 border-t border-gray-100">
          <p className="text-sm text-gray-600">
            <span className="font-medium">{progress.findingsCount}</span> findings discovered so far
          </p>
        </div>
      )}
    </div>
  );
}
