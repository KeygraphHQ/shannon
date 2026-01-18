/**
 * Types for compliance framework definitions and mappings.
 */

/**
 * Compliance framework definition (e.g., OWASP Top 10, PCI-DSS).
 */
export interface ComplianceFramework {
  /** Unique identifier (e.g., 'owasp-top-10-2021') */
  id: string;
  /** Display name */
  name: string;
  /** Version of the framework */
  version: string;
  /** Framework description */
  description: string;
  /** Framework publisher/organization */
  publisher: string;
  /** URL to official documentation */
  url?: string;
  /** Control categories */
  categories: ControlCategory[];
}

/**
 * Category of controls within a framework.
 */
export interface ControlCategory {
  /** Category identifier (e.g., 'A01') */
  id: string;
  /** Category name */
  name: string;
  /** Category description */
  description: string;
  /** Severity level of this category */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Individual controls in this category */
  controls: Control[];
}

/**
 * Individual control within a category.
 */
export interface Control {
  /** Control identifier (e.g., 'A01.01') */
  id: string;
  /** Control name */
  name: string;
  /** Control description */
  description: string;
  /** Test criteria for this control */
  testCriteria: string[];
  /** Remediation guidance */
  remediationGuidance: string;
  /** Related CWE IDs for auto-mapping */
  cweIds: string[];
  /** Related finding categories for fallback mapping */
  relatedCategories?: string[];
}

/**
 * Summary of a framework for list views.
 */
export interface FrameworkSummary {
  id: string;
  name: string;
  version: string;
  description: string;
  categoriesCount: number;
  controlsCount: number;
}

/**
 * Compliance mapping for a finding.
 */
export interface ComplianceMappingEntry {
  frameworkId: string;
  frameworkName: string;
  frameworkVersion: string;
  controlId: string;
  controlName: string;
  categoryId: string;
  categoryName: string;
  confidence: 'auto' | 'manual' | 'verified';
}

/**
 * Compliance scorecard for a scan.
 */
export interface ComplianceScorecard {
  scanId: string;
  frameworkId: string;
  frameworkName: string;
  overallScore: number;
  testedControls: number;
  passedControls: number;
  failedControls: number;
  notTestedControls: number;
  categories: CategoryScore[];
}

/**
 * Score for a single category.
 */
export interface CategoryScore {
  categoryId: string;
  categoryName: string;
  score: number;
  status: 'pass' | 'fail' | 'partial' | 'not_tested';
  controlsPassed: number;
  controlsFailed: number;
  controlsNotTested: number;
}

/**
 * Status for a control based on findings.
 */
export type ControlStatus = 'compliant' | 'non_compliant' | 'not_tested';

/**
 * Control mapping with findings.
 */
export interface ControlMapping {
  controlId: string;
  controlName: string;
  status: ControlStatus;
  findings: FindingSummary[];
}

/**
 * Finding summary for compliance views.
 */
export interface FindingSummary {
  id: string;
  title: string;
  severity: string;
  status: string;
}

/**
 * Category mapping with controls.
 */
export interface CategoryMapping {
  categoryId: string;
  categoryName: string;
  status: ControlStatus;
  findingsCount: number;
  controls: ControlMapping[];
}

/**
 * Compliance view for a scan.
 */
export interface ScanComplianceView {
  scanId: string;
  frameworks: {
    frameworkId: string;
    frameworkName: string;
    coveragePercent: number;
    categories: CategoryMapping[];
  }[];
}
