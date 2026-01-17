/**
 * Analytics - Client-side analytics tracking
 *
 * This module provides a unified interface for tracking user actions.
 * It's designed to work with various analytics providers (GA, Mixpanel, etc.)
 *
 * Usage:
 *   import { analytics } from '@/lib/analytics';
 *
 *   analytics.track('scan_started', { targetUrl: 'https://example.com' });
 *   analytics.page('/dashboard');
 *   analytics.identify(userId, { email: 'user@example.com' });
 */

import { logger } from "@/lib/logger";

type EventProperties = Record<string, string | number | boolean | null>;
type UserProperties = Record<string, string | number | boolean | null>;

interface AnalyticsConfig {
  /** Enable analytics tracking */
  enabled: boolean;
  /** Log events to console (development) */
  debug: boolean;
}

// Analytics configuration from environment
const config: AnalyticsConfig = {
  enabled: process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === "true",
  debug: process.env.NODE_ENV === "development",
};

// Standard event names for consistency
export const EVENTS = {
  // Authentication
  USER_SIGNED_UP: "user_signed_up",
  USER_SIGNED_IN: "user_signed_in",
  USER_SIGNED_OUT: "user_signed_out",
  PASSWORD_RESET_REQUESTED: "password_reset_requested",
  TWO_FACTOR_ENABLED: "two_factor_enabled",
  TWO_FACTOR_DISABLED: "two_factor_disabled",

  // Scans
  SCAN_STARTED: "scan_started",
  SCAN_COMPLETED: "scan_completed",
  SCAN_FAILED: "scan_failed",
  SCAN_VIEWED: "scan_viewed",
  REPORT_DOWNLOADED: "report_downloaded",

  // Organizations
  ORG_CREATED: "organization_created",
  ORG_UPDATED: "organization_updated",
  ORG_DELETED: "organization_deleted",
  ORG_SWITCHED: "organization_switched",

  // Team
  MEMBER_INVITED: "member_invited",
  MEMBER_JOINED: "member_joined",
  MEMBER_REMOVED: "member_removed",
  MEMBER_ROLE_CHANGED: "member_role_changed",

  // Projects
  PROJECT_CREATED: "project_created",
  PROJECT_UPDATED: "project_updated",
  PROJECT_DELETED: "project_deleted",

  // User Actions
  PROFILE_UPDATED: "profile_updated",
  SETTINGS_CHANGED: "settings_changed",
  ONBOARDING_STARTED: "onboarding_started",
  ONBOARDING_COMPLETED: "onboarding_completed",
  ONBOARDING_STEP_COMPLETED: "onboarding_step_completed",

  // Errors
  ERROR_OCCURRED: "error_occurred",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

/**
 * Track a user action/event
 */
function track(event: EventName | string, properties?: EventProperties): void {
  if (!config.enabled && !config.debug) return;

  const eventData = {
    event,
    properties: properties || {},
    timestamp: new Date().toISOString(),
  };

  if (config.debug) {
    logger.debug("Analytics event", eventData);
  }

  if (config.enabled && typeof window !== "undefined") {
    // Send to analytics provider
    // Example: Google Analytics 4
    if (typeof (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag === "function") {
      (window as unknown as { gtag: (...args: unknown[]) => void }).gtag("event", event, properties);
    }

    // Example: Mixpanel
    if (typeof (window as unknown as { mixpanel?: { track: (event: string, props?: EventProperties) => void } }).mixpanel?.track === "function") {
      (window as unknown as { mixpanel: { track: (event: string, props?: EventProperties) => void } }).mixpanel.track(event, properties);
    }

    // Example: PostHog
    if (typeof (window as unknown as { posthog?: { capture: (event: string, props?: EventProperties) => void } }).posthog?.capture === "function") {
      (window as unknown as { posthog: { capture: (event: string, props?: EventProperties) => void } }).posthog.capture(event, properties);
    }
  }
}

/**
 * Track a page view
 */
function page(path: string, properties?: EventProperties): void {
  if (!config.enabled && !config.debug) return;

  const pageData = {
    path,
    properties: properties || {},
    timestamp: new Date().toISOString(),
  };

  if (config.debug) {
    logger.debug("Analytics page view", pageData);
  }

  if (config.enabled && typeof window !== "undefined") {
    // Google Analytics
    if (typeof (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag === "function") {
      (window as unknown as { gtag: (...args: unknown[]) => void }).gtag("event", "page_view", {
        page_path: path,
        ...properties,
      });
    }

    // Mixpanel
    if (typeof (window as unknown as { mixpanel?: { track_pageview: (props?: EventProperties) => void } }).mixpanel?.track_pageview === "function") {
      (window as unknown as { mixpanel: { track_pageview: (props?: EventProperties) => void } }).mixpanel.track_pageview({ path, ...properties });
    }

    // PostHog
    if (typeof (window as unknown as { posthog?: { capture: (event: string, props?: EventProperties) => void } }).posthog?.capture === "function") {
      (window as unknown as { posthog: { capture: (event: string, props?: EventProperties) => void } }).posthog.capture("$pageview", { path, ...properties });
    }
  }
}

/**
 * Identify a user for analytics
 */
function identify(userId: string, properties?: UserProperties): void {
  if (!config.enabled && !config.debug) return;

  const identifyData = {
    userId,
    properties: properties || {},
    timestamp: new Date().toISOString(),
  };

  if (config.debug) {
    logger.debug("Analytics identify", identifyData);
  }

  if (config.enabled && typeof window !== "undefined") {
    // Google Analytics
    if (typeof (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag === "function") {
      (window as unknown as { gtag: (...args: unknown[]) => void }).gtag("config", "GA_MEASUREMENT_ID", {
        user_id: userId,
        ...properties,
      });
    }

    // Mixpanel
    if (typeof (window as unknown as { mixpanel?: { identify: (id: string) => void; people: { set: (props: UserProperties) => void } } }).mixpanel !== "undefined") {
      (window as unknown as { mixpanel: { identify: (id: string) => void; people: { set: (props: UserProperties) => void } } }).mixpanel.identify(userId);
      if (properties) {
        (window as unknown as { mixpanel: { identify: (id: string) => void; people: { set: (props: UserProperties) => void } } }).mixpanel.people.set(properties);
      }
    }

    // PostHog
    if (typeof (window as unknown as { posthog?: { identify: (id: string, props?: UserProperties) => void } }).posthog?.identify === "function") {
      (window as unknown as { posthog: { identify: (id: string, props?: UserProperties) => void } }).posthog.identify(userId, properties);
    }
  }
}

/**
 * Reset analytics state (on logout)
 */
function reset(): void {
  if (!config.enabled && !config.debug) return;

  if (config.debug) {
    logger.debug("Analytics reset");
  }

  if (config.enabled && typeof window !== "undefined") {
    // Mixpanel
    if (typeof (window as unknown as { mixpanel?: { reset: () => void } }).mixpanel?.reset === "function") {
      (window as unknown as { mixpanel: { reset: () => void } }).mixpanel.reset();
    }

    // PostHog
    if (typeof (window as unknown as { posthog?: { reset: () => void } }).posthog?.reset === "function") {
      (window as unknown as { posthog: { reset: () => void } }).posthog.reset();
    }
  }
}

/**
 * Set analytics group/organization context
 */
function group(groupId: string, properties?: EventProperties): void {
  if (!config.enabled && !config.debug) return;

  if (config.debug) {
    logger.debug("Analytics group", { groupId, properties });
  }

  if (config.enabled && typeof window !== "undefined") {
    // Mixpanel
    if (typeof (window as unknown as { mixpanel?: { set_group: (key: string, id: string) => void } }).mixpanel?.set_group === "function") {
      (window as unknown as { mixpanel: { set_group: (key: string, id: string) => void } }).mixpanel.set_group("organization", groupId);
    }

    // PostHog
    if (typeof (window as unknown as { posthog?: { group: (type: string, id: string, props?: EventProperties) => void } }).posthog?.group === "function") {
      (window as unknown as { posthog: { group: (type: string, id: string, props?: EventProperties) => void } }).posthog.group("organization", groupId, properties);
    }
  }
}

export const analytics = {
  track,
  page,
  identify,
  reset,
  group,
  EVENTS,
};
