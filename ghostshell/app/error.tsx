"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { logger } from "@/lib/logger";
import { analytics, EVENTS } from "@/lib/analytics";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error
    logger.error("Global error page triggered", {
      error,
      digest: error.digest,
    });

    // Track in analytics
    analytics.track(EVENTS.ERROR_OCCURRED, {
      errorType: "global_error",
      errorMessage: error.message,
      errorDigest: error.digest || "unknown",
    });
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-gray-50">
      <div className="max-w-md w-full text-center">
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-red-100 rounded-full">
            <AlertTriangle className="w-10 h-10 text-red-600" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          Something went wrong
        </h1>

        <p className="text-gray-600 mb-8">
          We encountered an unexpected error while processing your request.
          Please try again or return to the home page.
        </p>

        {/* Error details (development only) */}
        {process.env.NODE_ENV === "development" && (
          <div className="mb-6 p-4 bg-gray-100 rounded-lg text-left">
            <p className="text-sm font-mono text-red-600 break-all">
              {error.message}
            </p>
            {error.digest && (
              <p className="text-xs text-gray-500 mt-2">
                Error ID: {error.digest}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>

          <a
            href="/"
            className="flex items-center justify-center gap-2 px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            <Home className="w-4 h-4" />
            Go Home
          </a>
        </div>

        <p className="mt-8 text-sm text-gray-500">
          If this problem persists, please{" "}
          <a
            href="mailto:support@shannon.ai"
            className="text-blue-600 hover:underline"
          >
            contact support
          </a>
          {error.digest && (
            <span className="block mt-1 text-xs">
              Reference: {error.digest}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
