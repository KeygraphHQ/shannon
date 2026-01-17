/**
 * Risk score calculation for security reports.
 * Calculates an overall risk score (0-100) based on findings.
 */

import type { Finding } from '@prisma/client';

/**
 * Severity weights for risk calculation.
 * Higher weights indicate more severe vulnerabilities.
 */
const SEVERITY_WEIGHTS = {
  critical: 40,
  high: 25,
  medium: 10,
  low: 3,
  info: 0,
} as const;

/**
 * Category multipliers to adjust risk based on vulnerability type.
 * Some categories are inherently more dangerous than others.
 */
const CATEGORY_MULTIPLIERS: Record<string, number> = {
  injection: 1.3, // SQL/command injection - direct system access
  auth: 1.2, // Authentication bypass - account takeover
  authz: 1.2, // Authorization issues - data exposure
  ssrf: 1.1, // SSRF - internal network access
  xss: 1.0, // XSS - client-side attacks
  crypto: 1.0, // Cryptographic issues
  config: 0.9, // Misconfiguration - depends on context
};

/**
 * Status adjustments for findings that have been addressed.
 */
const STATUS_ADJUSTMENTS: Record<string, number> = {
  open: 1.0, // Full weight
  fixed: 0, // No weight (resolved)
  accepted_risk: 0.3, // Reduced weight (acknowledged)
  false_positive: 0, // No weight (not real)
};

export interface RiskScoreResult {
  /** Overall risk score from 0-100 */
  score: number;
  /** Risk level classification */
  level: 'critical' | 'high' | 'medium' | 'low' | 'minimal';
  /** Breakdown by severity */
  breakdown: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  /** Weighted score before normalization */
  rawScore: number;
  /** Maximum possible score based on finding count */
  maxPossibleScore: number;
}

/**
 * Calculate risk score from findings.
 *
 * The algorithm:
 * 1. Calculate weighted score for each finding based on severity
 * 2. Apply category multipliers for certain vulnerability types
 * 3. Adjust for finding status (fixed, accepted risk, etc.)
 * 4. Normalize to 0-100 scale with diminishing returns for high counts
 *
 * @param findings - Array of findings to analyze
 * @returns Risk score result with breakdown
 */
export function calculateRiskScore(
  findings: Pick<Finding, 'severity' | 'category' | 'status' | 'cvss'>[]
): RiskScoreResult {
  if (findings.length === 0) {
    return {
      score: 0,
      level: 'minimal',
      breakdown: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      rawScore: 0,
      maxPossibleScore: 0,
    };
  }

  // Count findings by severity
  const breakdown = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  // Calculate raw weighted score
  let rawScore = 0;

  for (const finding of findings) {
    const severity = finding.severity as keyof typeof SEVERITY_WEIGHTS;
    const weight = SEVERITY_WEIGHTS[severity] || 0;
    const categoryMultiplier = CATEGORY_MULTIPLIERS[finding.category] || 1.0;
    const statusAdjustment = STATUS_ADJUSTMENTS[finding.status] ?? 1.0;

    // Use CVSS if available, otherwise use severity weight
    const baseScore = finding.cvss ? finding.cvss * 4 : weight;

    // Calculate finding contribution
    const findingScore = baseScore * categoryMultiplier * statusAdjustment;
    rawScore += findingScore;

    // Count by severity (only open/accepted findings)
    if (finding.status === 'open' || finding.status === 'accepted_risk') {
      if (severity in breakdown) {
        breakdown[severity]++;
      }
    }
  }

  // Calculate maximum possible score (for normalization)
  // Assume worst case: all findings are critical with max multiplier
  const maxPossibleScore = findings.length * SEVERITY_WEIGHTS.critical * 1.3;

  // Normalize score with logarithmic scaling to prevent extreme scores
  // This ensures the score stays reasonable even with many findings
  let normalizedScore: number;

  if (rawScore === 0) {
    normalizedScore = 0;
  } else if (maxPossibleScore === 0) {
    normalizedScore = 0;
  } else {
    // Use logarithmic scaling for more meaningful differentiation
    // Score = 100 * (1 - e^(-rawScore/scaleFactor))
    const scaleFactor = maxPossibleScore * 0.3;
    normalizedScore = Math.round(100 * (1 - Math.exp(-rawScore / scaleFactor)));
  }

  // Ensure minimum score if critical findings exist
  if (breakdown.critical > 0 && normalizedScore < 60) {
    normalizedScore = Math.max(normalizedScore, 60 + breakdown.critical * 5);
  }

  // Cap at 100
  const score = Math.min(normalizedScore, 100);

  // Determine risk level
  const level = getRiskLevel(score);

  return {
    score,
    level,
    breakdown,
    rawScore: Math.round(rawScore),
    maxPossibleScore: Math.round(maxPossibleScore),
  };
}

/**
 * Get risk level classification from score.
 */
export function getRiskLevel(
  score: number
): 'critical' | 'high' | 'medium' | 'low' | 'minimal' {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  if (score >= 20) return 'low';
  return 'minimal';
}

/**
 * Get risk level description.
 */
export function getRiskLevelDescription(level: RiskScoreResult['level']): string {
  const descriptions = {
    critical:
      'Critical risk level indicates severe vulnerabilities that require immediate attention. The application may be actively exploitable.',
    high: 'High risk level indicates significant vulnerabilities that should be prioritized for remediation.',
    medium:
      'Medium risk level indicates notable vulnerabilities that should be addressed in the near term.',
    low: 'Low risk level indicates minor vulnerabilities that should be addressed as part of regular maintenance.',
    minimal:
      'Minimal risk level indicates the application has no significant security issues identified.',
  };
  return descriptions[level];
}

/**
 * Calculate summary counts from findings.
 */
export function calculateFindingsSummary(
  findings: Pick<Finding, 'severity' | 'status'>[]
): {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
} {
  const summary = {
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  for (const finding of findings) {
    // Only count open/accepted findings
    if (finding.status !== 'fixed' && finding.status !== 'false_positive') {
      summary.total++;
      const severity = finding.severity as keyof typeof summary;
      if (severity in summary && severity !== 'total') {
        summary[severity]++;
      }
    }
  }

  return summary;
}
