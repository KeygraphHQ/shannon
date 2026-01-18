"use client";

import { useState, useCallback } from "react";
import { Download, FileJson, FileText, ChevronDown, Loader2 } from "lucide-react";

export type ExportFormat = "pdf" | "json" | "html";

interface ExportButtonProps {
  scanId: string;
  /** Whether the scan is completed (export only available for completed scans) */
  isCompleted: boolean;
  /** Callback after successful export */
  onExport?: (format: ExportFormat) => void;
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string; icon: React.ElementType; description: string }[] = [
  {
    value: "pdf",
    label: "PDF Report",
    icon: FileText,
    description: "Professional formatted report",
  },
  {
    value: "json",
    label: "SARIF JSON",
    icon: FileJson,
    description: "GitHub Code Scanning compatible",
  },
  {
    value: "html",
    label: "HTML Report",
    icon: FileText,
    description: "Web-viewable report",
  },
];

export function ExportButton({ scanId, isCompleted, onExport }: ExportButtonProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);

  const handleExport = useCallback(async (format: ExportFormat) => {
    setIsExporting(true);
    setExportingFormat(format);
    setShowDropdown(false);

    try {
      // Create download link
      const url = `/api/scans/${scanId}/export?format=${format}`;

      // Fetch the file
      const response = await fetch(url);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Export failed");
      }

      // Get filename from Content-Disposition header or generate one
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = `scan-report-${scanId}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) {
          filename = match[1];
        }
      } else {
        // Add extension based on format
        const extensions: Record<ExportFormat, string> = {
          pdf: ".pdf",
          json: ".sarif.json",
          html: ".html",
        };
        filename += extensions[format];
      }

      // Create blob and download
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      onExport?.(format);
    } catch (error) {
      console.error("Export failed:", error);
      // Could add toast notification here
    } finally {
      setIsExporting(false);
      setExportingFormat(null);
    }
  }, [scanId, onExport]);

  if (!isCompleted) {
    return (
      <button
        disabled
        className="inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-400"
        title="Export is only available for completed scans"
      >
        <Download className="h-4 w-4" />
        Export
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={isExporting}
        className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isExporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        Export
        <ChevronDown className="h-4 w-4" />
      </button>

      {showDropdown && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowDropdown(false)}
          />
          <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
            {FORMAT_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isCurrentlyExporting = exportingFormat === option.value;

              return (
                <button
                  key={option.value}
                  onClick={() => handleExport(option.value)}
                  disabled={isExporting}
                  className="flex w-full items-start gap-3 px-4 py-2 text-left hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCurrentlyExporting ? (
                    <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-gray-400" />
                  ) : (
                    <Icon className="mt-0.5 h-4 w-4 text-gray-400" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {option.label}
                    </p>
                    <p className="text-xs text-gray-500">{option.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
