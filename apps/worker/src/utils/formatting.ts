// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Formatting Utilities
 *
 * Generic formatting functions for durations, timestamps, and percentages.
 */

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const totalSeconds = ms / 1000;
  // Round before branching — otherwise a value like 59.95s takes the sub-minute
  // branch (seconds < 60) but toFixed(1) then rounds its *display* up to "60.0s",
  // which reads as a full minute while the unit says seconds.
  const roundedSeconds = Math.round(totalSeconds * 10) / 10;
  if (roundedSeconds < 60) {
    return `${roundedSeconds.toFixed(1)}s`;
  }

  const wholeSeconds = Math.round(totalSeconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Format timestamp to ISO 8601 string
 */
export function formatTimestamp(timestamp: number = Date.now()): string {
  return new Date(timestamp).toISOString();
}

/**
 * Calculate percentage
 */
export function calculatePercentage(part: number, total: number): number {
  if (total === 0) return 0;
  return (part / total) * 100;
}

/**
 * Extract agent type from description string for display purposes
 */
export function extractAgentType(description: string): string {
  if (description.includes('Pre-recon')) {
    return 'pre-reconnaissance';
  }
  if (description.includes('Recon')) {
    return 'reconnaissance';
  }
  if (description.includes('Report')) {
    return 'report generation';
  }
  return 'analysis';
}
