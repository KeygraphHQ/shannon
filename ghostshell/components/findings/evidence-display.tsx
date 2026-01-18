"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Code,
  Image,
  ListOrdered,
  AlertCircle,
  Copy,
  Check,
} from "lucide-react";
import type { Evidence } from "@/lib/types/findings";

interface EvidenceDisplayProps {
  evidence: Evidence | null;
}

export function EvidenceDisplay({ evidence }: EvidenceDisplayProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["steps", "payloads", "proofOfImpact"])
  );
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  if (!evidence) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-gray-400" />
        <p className="mt-2 text-sm text-gray-600">
          No evidence data available for this finding.
        </p>
      </div>
    );
  }

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItem(id);
      setTimeout(() => setCopiedItem(null), 2000);
    } catch {
      console.error("Failed to copy to clipboard");
    }
  };

  const hasSteps = evidence.steps && evidence.steps.length > 0;
  const hasPayloads = evidence.payloads && evidence.payloads.length > 0;
  const hasScreenshots = evidence.screenshots && evidence.screenshots.length > 0;
  const hasProofOfImpact = evidence.proofOfImpact;

  // Get any additional custom fields
  const customFields = Object.entries(evidence).filter(
    ([key]) => !["steps", "payloads", "screenshots", "proofOfImpact"].includes(key)
  );

  return (
    <div className="space-y-4">
      {/* Exploitation Steps */}
      {hasSteps && (
        <EvidenceSection
          title="Exploitation Steps"
          icon={ListOrdered}
          isExpanded={expandedSections.has("steps")}
          onToggle={() => toggleSection("steps")}
        >
          <ol className="list-decimal space-y-2 pl-5">
            {evidence.steps!.map((step, index) => (
              <li key={index} className="text-sm text-gray-700">
                {step}
              </li>
            ))}
          </ol>
        </EvidenceSection>
      )}

      {/* Payloads */}
      {hasPayloads && (
        <EvidenceSection
          title="Payloads Used"
          icon={Code}
          isExpanded={expandedSections.has("payloads")}
          onToggle={() => toggleSection("payloads")}
        >
          <div className="space-y-2">
            {evidence.payloads!.map((payload, index) => (
              <div
                key={index}
                className="group relative rounded-md bg-gray-900 p-3"
              >
                <button
                  onClick={() => copyToClipboard(payload, `payload-${index}`)}
                  className="absolute right-2 top-2 rounded p-1 text-gray-400 opacity-0 transition-opacity hover:bg-gray-800 hover:text-white group-hover:opacity-100"
                  title="Copy to clipboard"
                >
                  {copiedItem === `payload-${index}` ? (
                    <Check className="h-4 w-4 text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
                <code className="block overflow-x-auto whitespace-pre-wrap break-all text-sm text-green-400">
                  {payload}
                </code>
              </div>
            ))}
          </div>
        </EvidenceSection>
      )}

      {/* Screenshots */}
      {hasScreenshots && (
        <EvidenceSection
          title="Screenshots"
          icon={Image}
          isExpanded={expandedSections.has("screenshots")}
          onToggle={() => toggleSection("screenshots")}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {evidence.screenshots!.map((screenshot, index) => (
              <a
                key={index}
                href={screenshot}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-lg border border-gray-200 transition-shadow hover:shadow-md"
              >
                <img
                  src={screenshot}
                  alt={`Evidence screenshot ${index + 1}`}
                  className="h-auto w-full object-cover"
                />
              </a>
            ))}
          </div>
        </EvidenceSection>
      )}

      {/* Proof of Impact */}
      {hasProofOfImpact && (
        <EvidenceSection
          title="Proof of Impact"
          icon={AlertCircle}
          isExpanded={expandedSections.has("proofOfImpact")}
          onToggle={() => toggleSection("proofOfImpact")}
        >
          <div className="rounded-md bg-red-50 border border-red-100 p-4">
            <p className="whitespace-pre-wrap text-sm text-red-800">
              {evidence.proofOfImpact}
            </p>
          </div>
        </EvidenceSection>
      )}

      {/* Custom Fields */}
      {customFields.length > 0 && (
        <EvidenceSection
          title="Additional Details"
          icon={Code}
          isExpanded={expandedSections.has("custom")}
          onToggle={() => toggleSection("custom")}
        >
          <div className="rounded-md bg-gray-50 p-4">
            <pre className="overflow-x-auto text-sm text-gray-700">
              {JSON.stringify(
                Object.fromEntries(customFields),
                null,
                2
              )}
            </pre>
          </div>
        </EvidenceSection>
      )}
    </div>
  );
}

interface EvidenceSectionProps {
  title: string;
  icon: typeof Code;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function EvidenceSection({
  title,
  icon: Icon,
  isExpanded,
  onToggle,
  children,
}: EvidenceSectionProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400" />
        )}
        <Icon className="h-4 w-4 text-gray-600" />
        <span className="text-sm font-medium text-gray-900">{title}</span>
      </button>
      {isExpanded && (
        <div className="border-t border-gray-200 px-4 py-3">{children}</div>
      )}
    </div>
  );
}
