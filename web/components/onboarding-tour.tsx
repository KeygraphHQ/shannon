"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { X, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { analytics, EVENTS } from "@/lib/analytics";

interface TourStep {
  id: string;
  title: string;
  description: string;
  target?: string; // CSS selector for the element to highlight
  position?: "top" | "bottom" | "left" | "right";
  action?: () => void; // Optional action when step is shown
}

interface OnboardingTourProps {
  steps: TourStep[];
  onComplete: () => void;
  onSkip?: () => void;
  storageKey?: string; // Key for localStorage to remember completion
  children?: ReactNode;
}

const DEFAULT_STORAGE_KEY = "shannon_onboarding_complete";

export function OnboardingTour({
  steps,
  onComplete,
  onSkip,
  storageKey = DEFAULT_STORAGE_KEY,
  children,
}: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  // Check if onboarding was already completed
  useEffect(() => {
    if (typeof window === "undefined") return;

    const completed = localStorage.getItem(storageKey);
    if (!completed) {
      setIsVisible(true);
      analytics.track(EVENTS.ONBOARDING_STARTED, { totalSteps: steps.length });
    }
  }, [storageKey, steps.length]);

  // Update target element position
  useEffect(() => {
    if (!isVisible) return;

    const step = steps[currentStep];
    if (!step?.target) {
      setTargetRect(null);
      return;
    }

    const updatePosition = () => {
      const element = document.querySelector(step.target as string);
      if (element) {
        setTargetRect(element.getBoundingClientRect());
      }
    };

    updatePosition();

    // Update on scroll and resize
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    // Run step action if defined
    step.action?.();

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [currentStep, isVisible, steps]);

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      analytics.track(EVENTS.ONBOARDING_STEP_COMPLETED, {
        step: steps[currentStep].id,
        stepNumber: currentStep + 1,
      });
      setCurrentStep((prev) => prev + 1);
    } else {
      handleComplete();
    }
  }, [currentStep, steps]);

  const handlePrevious = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const handleComplete = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, "true");
    }
    analytics.track(EVENTS.ONBOARDING_COMPLETED, {
      totalSteps: steps.length,
      completedSteps: currentStep + 1,
    });
    setIsVisible(false);
    onComplete();
  }, [storageKey, steps.length, currentStep, onComplete]);

  const handleSkip = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, "true");
    }
    analytics.track(EVENTS.ONBOARDING_COMPLETED, {
      totalSteps: steps.length,
      completedSteps: currentStep,
      skipped: true,
    });
    setIsVisible(false);
    onSkip?.();
  }, [storageKey, steps.length, currentStep, onSkip]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleSkip();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        handleNext();
      } else if (e.key === "ArrowLeft") {
        handlePrevious();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isVisible, handleNext, handlePrevious, handleSkip]);

  if (!isVisible) {
    return <>{children}</>;
  }

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  // Calculate tooltip position
  const getTooltipStyle = (): React.CSSProperties => {
    if (!targetRect) {
      return {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };
    }

    const padding = 16;
    const position = step.position || "bottom";

    switch (position) {
      case "top":
        return {
          position: "fixed",
          bottom: window.innerHeight - targetRect.top + padding,
          left: targetRect.left + targetRect.width / 2,
          transform: "translateX(-50%)",
        };
      case "left":
        return {
          position: "fixed",
          top: targetRect.top + targetRect.height / 2,
          right: window.innerWidth - targetRect.left + padding,
          transform: "translateY(-50%)",
        };
      case "right":
        return {
          position: "fixed",
          top: targetRect.top + targetRect.height / 2,
          left: targetRect.right + padding,
          transform: "translateY(-50%)",
        };
      case "bottom":
      default:
        return {
          position: "fixed",
          top: targetRect.bottom + padding,
          left: targetRect.left + targetRect.width / 2,
          transform: "translateX(-50%)",
        };
    }
  };

  return (
    <>
      {children}

      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        aria-hidden="true"
        onClick={handleSkip}
      />

      {/* Spotlight on target element */}
      {targetRect && (
        <div
          className="fixed z-40 ring-4 ring-blue-500 ring-opacity-50 rounded-lg pointer-events-none"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.5)",
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className="z-50 bg-white rounded-lg shadow-xl max-w-sm w-full"
        style={getTooltipStyle()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-description"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <span className="text-sm text-gray-500">
            Step {currentStep + 1} of {steps.length}
          </span>
          <button
            onClick={handleSkip}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
            aria-label="Skip tour"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <h3 id="tour-title" className="font-semibold text-lg">
            {step.title}
          </h3>
          <p id="tour-description" className="mt-2 text-gray-600 text-sm">
            {step.description}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t bg-gray-50 rounded-b-lg">
          <button
            onClick={handlePrevious}
            disabled={currentStep === 0}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>

          <div className="flex gap-1">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`w-2 h-2 rounded-full ${
                  index === currentStep
                    ? "bg-blue-600"
                    : index < currentStep
                    ? "bg-blue-300"
                    : "bg-gray-300"
                }`}
              />
            ))}
          </div>

          <button
            onClick={handleNext}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {isLastStep ? (
              <>
                <Check className="w-4 h-4" />
                Finish
              </>
            ) : (
              <>
                Next
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}

// Pre-defined tour for new users
export const dashboardTourSteps: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to Shannon!",
    description:
      "Let's take a quick tour to help you get started with AI-powered security testing.",
  },
  {
    id: "new-scan",
    title: "Start a New Scan",
    description:
      "Click here to start a new security scan. Enter a URL and we'll analyze it for vulnerabilities.",
    target: '[data-tour="new-scan"]',
    position: "bottom",
  },
  {
    id: "scans-list",
    title: "View Your Scans",
    description:
      "All your scans will appear here. You can view their status, results, and download reports.",
    target: '[data-tour="scans-list"]',
    position: "top",
  },
  {
    id: "org-switcher",
    title: "Organization Switcher",
    description:
      "If you belong to multiple organizations, use this to switch between them.",
    target: '[data-tour="org-switcher"]',
    position: "bottom",
  },
  {
    id: "settings",
    title: "Account Settings",
    description:
      "Manage your profile, security settings, and team members from here.",
    target: '[data-tour="settings"]',
    position: "bottom",
  },
  {
    id: "complete",
    title: "You're All Set!",
    description:
      "You're ready to start scanning. If you need help, check out our documentation or contact support.",
  },
];

/**
 * Hook to manually trigger the onboarding tour
 */
export function useOnboardingTour(storageKey = DEFAULT_STORAGE_KEY) {
  const [shouldShowTour, setShouldShowTour] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const completed = localStorage.getItem(storageKey);
    setShouldShowTour(!completed);
  }, [storageKey]);

  const resetTour = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(storageKey);
      setShouldShowTour(true);
    }
  }, [storageKey]);

  const completeTour = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, "true");
      setShouldShowTour(false);
    }
  }, [storageKey]);

  return {
    shouldShowTour,
    resetTour,
    completeTour,
  };
}
