"use client";

import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, Shield } from "lucide-react";
import type { FrameworkSummary } from "@/lib/compliance/types";

interface FrameworkSelectorProps {
  frameworks: FrameworkSummary[];
  selectedId: string;
  onSelect: (frameworkId: string) => void;
  /** Compact mode for embedding */
  variant?: "default" | "compact";
  /** Label to display */
  label?: string;
}

export function FrameworkSelector({
  frameworks,
  selectedId,
  onSelect,
  variant = "default",
  label = "Framework",
}: FrameworkSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedFramework = frameworks.find((f) => f.id === selectedId);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = () => setIsOpen(false);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [isOpen]);

  if (variant === "compact") {
    return (
      <div className="relative inline-block">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Shield className="h-4 w-4 text-indigo-600" />
          {selectedFramework?.name || "Select framework"}
          <ChevronsUpDown className="h-4 w-4 text-gray-400" />
        </button>

        {isOpen && (
          <div className="absolute z-10 mt-1 w-64 rounded-lg border border-gray-200 bg-white shadow-lg">
            <div className="max-h-60 overflow-auto py-1">
              {frameworks.map((framework) => (
                <button
                  key={framework.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(framework.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 ${
                    framework.id === selectedId ? "bg-indigo-50" : ""
                  }`}
                >
                  {framework.id === selectedId ? (
                    <Check className="h-4 w-4 text-indigo-600" />
                  ) : (
                    <span className="w-4" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{framework.name}</p>
                    <p className="text-xs text-gray-500">
                      v{framework.version} • {framework.controlsCount} controls
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          className="relative w-full cursor-pointer rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-10 text-left shadow-sm hover:border-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <span className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-indigo-600" />
            <span className="block truncate">
              {selectedFramework?.name || "Select a framework"}
            </span>
          </span>
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
            <ChevronsUpDown className="h-5 w-5 text-gray-400" />
          </span>
        </button>

        {isOpen && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
            <div className="max-h-80 overflow-auto py-1">
              {frameworks.map((framework) => (
                <button
                  key={framework.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(framework.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 ${
                    framework.id === selectedId ? "bg-indigo-50" : ""
                  }`}
                >
                  {framework.id === selectedId ? (
                    <Check className="h-5 w-5 text-indigo-600 mt-0.5" />
                  ) : (
                    <span className="w-5" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{framework.name}</p>
                    <p className="text-sm text-gray-500">{framework.description}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                      <span>Version {framework.version}</span>
                      <span>•</span>
                      <span>{framework.categoriesCount} categories</span>
                      <span>•</span>
                      <span>{framework.controlsCount} controls</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
