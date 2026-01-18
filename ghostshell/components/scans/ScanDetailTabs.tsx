"use client";

import { useState } from "react";
import { List, Shield, FileText } from "lucide-react";
import { ScanComplianceTab } from "./ScanComplianceTab";

interface Tab {
  id: string;
  label: string;
  icon: React.ElementType;
}

const TABS: Tab[] = [
  { id: "findings", label: "Findings", icon: List },
  { id: "compliance", label: "Compliance", icon: Shield },
];

interface ScanDetailTabsProps {
  scanId: string;
  scanStatus: string;
  /** The findings content from the server component */
  findingsContent: React.ReactNode;
  /** Show compliance tab */
  showCompliance?: boolean;
}

export function ScanDetailTabs({
  scanId,
  scanStatus,
  findingsContent,
  showCompliance = true,
}: ScanDetailTabsProps) {
  const [activeTab, setActiveTab] = useState("findings");

  const visibleTabs = showCompliance
    ? TABS
    : TABS.filter((tab) => tab.id !== "compliance");

  return (
    <div>
      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-4" aria-label="Tabs">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === "findings" && findingsContent}
        {activeTab === "compliance" && showCompliance && (
          <ScanComplianceTab scanId={scanId} scanStatus={scanStatus} />
        )}
      </div>
    </div>
  );
}
