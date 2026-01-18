"use client";

import { Loader2 } from "lucide-react";
import { type HTMLAttributes } from "react";

interface SpinnerProps extends HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "w-4 h-4",
  md: "w-6 h-6",
  lg: "w-8 h-8",
};

/**
 * Animated spinner for loading states
 */
export function Spinner({ size = "md", className = "", ...props }: SpinnerProps) {
  return (
    <div role="status" aria-label="Loading" {...props}>
      <Loader2 className={`animate-spin ${sizeClasses[size]} ${className}`} />
      <span className="sr-only">Loading...</span>
    </div>
  );
}

/**
 * Full page loading overlay
 */
export function LoadingOverlay({
  message = "Loading...",
  className = "",
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div
      className={`fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50 ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4">
        <Spinner size="lg" className="text-blue-600" />
        <p className="text-gray-600 font-medium">{message}</p>
      </div>
    </div>
  );
}

/**
 * Inline loading state for sections
 */
export function LoadingSection({
  message = "Loading...",
  className = "",
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-12 ${className}`}
      role="status"
      aria-live="polite"
    >
      <Spinner size="lg" className="text-gray-400" />
      <p className="mt-4 text-gray-500">{message}</p>
    </div>
  );
}

/**
 * Button loading state - replace button text with spinner
 */
export function ButtonSpinner({ className = "" }: { className?: string }) {
  return <Spinner size="sm" className={className} />;
}
