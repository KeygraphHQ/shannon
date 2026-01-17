"use client";

import { useState } from "react";
import { Play, Loader2, CheckCircle, XCircle, AlertCircle } from "lucide-react";

interface TestAuthButtonProps {
  projectId: string;
  disabled?: boolean;
  onValidationComplete?: (result: {
    valid: boolean;
    error: string | null;
  }) => void;
}

type ValidationState = "idle" | "testing" | "success" | "error";

export function TestAuthButton({
  projectId,
  disabled = false,
  onValidationComplete,
}: TestAuthButtonProps) {
  const [state, setState] = useState<ValidationState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [validatedAt, setValidatedAt] = useState<Date | null>(null);

  const handleTest = async () => {
    setState("testing");
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/auth/validate`, {
        method: "POST",
      });

      const result = await response.json();

      if (result.valid) {
        setState("success");
        setValidatedAt(new Date(result.validatedAt));
      } else {
        setState("error");
        setError(result.error || "Validation failed");
      }

      onValidationComplete?.({
        valid: result.valid,
        error: result.error || null,
      });
    } catch (err) {
      setState("error");
      const errorMessage = err instanceof Error ? err.message : "Failed to test authentication";
      setError(errorMessage);
      onValidationComplete?.({
        valid: false,
        error: errorMessage,
      });
    }
  };

  const resetState = () => {
    setState("idle");
    setError(null);
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleTest}
        disabled={disabled || state === "testing"}
        className="inline-flex items-center gap-2 rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {state === "testing" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Testing...
          </>
        ) : (
          <>
            <Play className="h-4 w-4" />
            Test Authentication
          </>
        )}
      </button>

      {state === "success" && (
        <div className="rounded-md bg-green-50 p-3">
          <div className="flex items-start">
            <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800">
                Authentication validated successfully
              </p>
              {validatedAt && (
                <p className="text-xs text-green-700 mt-1">
                  Validated at {validatedAt.toLocaleTimeString()}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={resetState}
              className="ml-auto text-green-600 hover:text-green-500 text-xs"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="rounded-md bg-red-50 p-3">
          <div className="flex items-start">
            <XCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
            <div className="ml-3 flex-1">
              <p className="text-sm font-medium text-red-800">
                Authentication validation failed
              </p>
              {error && (
                <p className="text-sm text-red-700 mt-1">{error}</p>
              )}
              <div className="mt-2">
                <button
                  type="button"
                  onClick={resetState}
                  className="text-sm text-red-600 hover:text-red-500 underline"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {state === "idle" && (
        <p className="text-xs text-gray-500 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Test your credentials before starting a scan
        </p>
      )}
    </div>
  );
}
