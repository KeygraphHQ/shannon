"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home, Bug } from "lucide-react";
import { logger } from "@/lib/logger";
import { analytics, EVENTS } from "@/lib/analytics";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Error Boundary - Catches JavaScript errors in child components
 *
 * Usage:
 *   <ErrorBoundary>
 *     <MyComponent />
 *   </ErrorBoundary>
 *
 *   // With custom fallback
 *   <ErrorBoundary fallback={<CustomError />}>
 *     <MyComponent />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log the error
    logger.error("React Error Boundary caught an error", {
      error,
      componentStack: errorInfo.componentStack,
    });

    // Track in analytics
    analytics.track(EVENTS.ERROR_OCCURRED, {
      errorType: "react_boundary",
      errorMessage: error.message,
      errorName: error.name,
    });

    // Store error info
    this.setState({ errorInfo });

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div
          className="min-h-[400px] flex items-center justify-center p-8"
          role="alert"
          aria-live="assertive"
        >
          <div className="max-w-md w-full text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-red-100 rounded-full">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
            </div>

            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Something went wrong
            </h2>

            <p className="text-gray-600 mb-6">
              We encountered an unexpected error. Please try again or contact
              support if the problem persists.
            </p>

            {/* Error details (development only) */}
            {process.env.NODE_ENV === "development" && this.state.error && (
              <div className="mb-6 p-4 bg-gray-100 rounded-lg text-left">
                <p className="text-sm font-mono text-red-600 mb-2">
                  {this.state.error.name}: {this.state.error.message}
                </p>
                {this.state.errorInfo?.componentStack && (
                  <details className="text-xs text-gray-600">
                    <summary className="cursor-pointer hover:text-gray-800">
                      Component Stack
                    </summary>
                    <pre className="mt-2 overflow-auto max-h-40">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>

              <button
                onClick={this.handleGoHome}
                className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Home className="w-4 h-4" />
                Go Home
              </button>
            </div>

            <p className="mt-6 text-sm text-gray-500">
              <Bug className="w-4 h-4 inline mr-1" />
              If this keeps happening, please{" "}
              <a
                href="mailto:support@shannon.ai"
                className="text-blue-600 hover:underline"
              >
                contact support
              </a>
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Error message display component for form/action errors
 */
export function ErrorMessage({
  error,
  className = "",
}: {
  error?: string | null;
  className?: string;
}) {
  if (!error) return null;

  return (
    <div
      className={`flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 ${className}`}
      role="alert"
    >
      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
      <p className="text-sm">{error}</p>
    </div>
  );
}

/**
 * User-friendly error messages for common error codes
 */
export const ERROR_MESSAGES: Record<string, string> = {
  // Authentication errors
  UNAUTHORIZED: "You need to be logged in to access this page.",
  FORBIDDEN: "You don't have permission to access this resource.",
  SESSION_EXPIRED: "Your session has expired. Please log in again.",

  // Validation errors
  INVALID_INPUT: "Please check your input and try again.",
  REQUIRED_FIELD: "This field is required.",
  INVALID_EMAIL: "Please enter a valid email address.",
  INVALID_URL: "Please enter a valid URL.",
  PASSWORD_TOO_SHORT: "Password must be at least 8 characters.",

  // Resource errors
  NOT_FOUND: "The requested resource was not found.",
  ALREADY_EXISTS: "This resource already exists.",
  CONFLICT: "There was a conflict with the current state.",

  // Rate limiting
  RATE_LIMITED: "Too many requests. Please wait a moment and try again.",

  // Network errors
  NETWORK_ERROR: "Network error. Please check your connection.",
  TIMEOUT: "The request timed out. Please try again.",

  // Server errors
  INTERNAL_ERROR: "An unexpected error occurred. Please try again later.",
  SERVICE_UNAVAILABLE: "The service is temporarily unavailable. Please try again later.",

  // Default
  UNKNOWN: "An unknown error occurred. Please try again.",
};

/**
 * Get a user-friendly error message
 */
export function getErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return ERROR_MESSAGES[error] || error;
  }

  if (error instanceof Error) {
    // Check if it's a known error code
    if (error.message in ERROR_MESSAGES) {
      return ERROR_MESSAGES[error.message];
    }
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error) {
    const msg = (error as { message: string }).message;
    return ERROR_MESSAGES[msg] || msg;
  }

  return ERROR_MESSAGES.UNKNOWN;
}
