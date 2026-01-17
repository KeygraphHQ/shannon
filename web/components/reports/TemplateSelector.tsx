"use client";

import { useState } from "react";
import {
  BarChart3,
  FileCode,
  Shield,
  FileText,
  Check,
  ChevronRight,
} from "lucide-react";

export type ReportTemplateType = "EXECUTIVE" | "TECHNICAL" | "COMPLIANCE" | "CUSTOM";

interface TemplateSelectorProps {
  value: ReportTemplateType;
  onChange: (value: ReportTemplateType) => void;
  disabled?: boolean;
  showCustom?: boolean;
}

interface TemplateOption {
  id: ReportTemplateType;
  name: string;
  description: string;
  icon: React.ElementType;
  features: string[];
  recommended?: boolean;
}

const TEMPLATES: TemplateOption[] = [
  {
    id: "EXECUTIVE",
    name: "Executive Summary",
    description: "High-level overview for leadership and stakeholders",
    icon: BarChart3,
    features: [
      "Risk score visualization",
      "Key metrics dashboard",
      "Business impact analysis",
      "Trend comparisons",
    ],
    recommended: true,
  },
  {
    id: "TECHNICAL",
    name: "Technical Report",
    description: "Detailed findings for security teams and developers",
    icon: FileCode,
    features: [
      "Full finding details",
      "Evidence and proof-of-concept",
      "Remediation steps",
      "Technical references (CWE, CVSS)",
    ],
  },
  {
    id: "COMPLIANCE",
    name: "Compliance Report",
    description: "Framework-aligned assessment for audit requirements",
    icon: Shield,
    features: [
      "Control mapping (OWASP, PCI-DSS, SOC2)",
      "Compliance score",
      "Gap analysis",
      "Remediation timeline",
    ],
  },
  {
    id: "CUSTOM",
    name: "Custom Template",
    description: "Use a custom template for specialized reporting",
    icon: FileText,
    features: [
      "Custom sections",
      "Branded output",
      "Flexible content",
      "Configurable metrics",
    ],
  },
];

export function TemplateSelector({
  value,
  onChange,
  disabled = false,
  showCustom = false,
}: TemplateSelectorProps) {
  const templates = showCustom ? TEMPLATES : TEMPLATES.filter((t) => t.id !== "CUSTOM");

  return (
    <div className="space-y-3">
      {templates.map((template) => {
        const Icon = template.icon;
        const isSelected = value === template.id;

        return (
          <button
            key={template.id}
            type="button"
            onClick={() => onChange(template.id)}
            disabled={disabled}
            className={`w-full text-left rounded-lg border-2 p-4 transition-all ${
              isSelected
                ? "border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600"
                : "border-gray-200 bg-white hover:border-gray-300"
            } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <div className="flex items-start gap-4">
              {/* Icon */}
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  isSelected ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className={`font-medium ${isSelected ? "text-indigo-900" : "text-gray-900"}`}>
                    {template.name}
                  </h3>
                  {template.recommended && (
                    <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      Recommended
                    </span>
                  )}
                </div>
                <p className={`mt-1 text-sm ${isSelected ? "text-indigo-700" : "text-gray-500"}`}>
                  {template.description}
                </p>
                <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                  {template.features.map((feature, idx) => (
                    <li
                      key={idx}
                      className={`flex items-center gap-1 text-xs ${
                        isSelected ? "text-indigo-600" : "text-gray-500"
                      }`}
                    >
                      <ChevronRight className="h-3 w-3" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Selection indicator */}
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full ${
                  isSelected ? "bg-indigo-600 text-white" : "border-2 border-gray-300"
                }`}
              >
                {isSelected && <Check className="h-4 w-4" />}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Compact version of template selector for forms
 */
export function TemplateSelectorCompact({
  value,
  onChange,
  disabled = false,
  showCustom = false,
}: TemplateSelectorProps) {
  const templates = showCustom ? TEMPLATES : TEMPLATES.filter((t) => t.id !== "CUSTOM");

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {templates.map((template) => {
        const Icon = template.icon;
        const isSelected = value === template.id;

        return (
          <button
            key={template.id}
            type="button"
            onClick={() => onChange(template.id)}
            disabled={disabled}
            className={`flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-all ${
              isSelected
                ? "border-indigo-600 bg-indigo-50"
                : "border-gray-200 bg-white hover:border-gray-300"
            } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                isSelected ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"
              }`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <span
              className={`text-xs font-medium ${isSelected ? "text-indigo-900" : "text-gray-700"}`}
            >
              {template.name.split(" ")[0]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
