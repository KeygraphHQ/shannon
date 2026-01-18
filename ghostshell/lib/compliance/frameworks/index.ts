/**
 * Compliance framework registry.
 * Exports all available frameworks and provides lookup utilities.
 */

import type { ComplianceFramework, FrameworkSummary, Control } from '../types';
import { OWASP_TOP_10_2021 } from './owasp-top-10-2021';
import { PCI_DSS_4_0 } from './pci-dss-4.0';
import { SOC2_TRUST_PRINCIPLES } from './soc2-trust-principles';
import { CIS_CONTROLS_V8 } from './cis-controls-v8';

// Export individual frameworks
export { OWASP_TOP_10_2021 } from './owasp-top-10-2021';
export { PCI_DSS_4_0 } from './pci-dss-4.0';
export { SOC2_TRUST_PRINCIPLES } from './soc2-trust-principles';
export { CIS_CONTROLS_V8 } from './cis-controls-v8';

/**
 * All available compliance frameworks.
 */
export const COMPLIANCE_FRAMEWORKS: ComplianceFramework[] = [
  OWASP_TOP_10_2021,
  PCI_DSS_4_0,
  SOC2_TRUST_PRINCIPLES,
  CIS_CONTROLS_V8,
];

/**
 * Framework lookup map for O(1) access.
 */
export const FRAMEWORK_MAP: Record<string, ComplianceFramework> = {
  [OWASP_TOP_10_2021.id]: OWASP_TOP_10_2021,
  [PCI_DSS_4_0.id]: PCI_DSS_4_0,
  [SOC2_TRUST_PRINCIPLES.id]: SOC2_TRUST_PRINCIPLES,
  [CIS_CONTROLS_V8.id]: CIS_CONTROLS_V8,
};

/**
 * Get a framework by ID.
 */
export function getFramework(frameworkId: string): ComplianceFramework | null {
  return FRAMEWORK_MAP[frameworkId] ?? null;
}

/**
 * Get all framework summaries for list views.
 */
export function getFrameworkSummaries(): FrameworkSummary[] {
  return COMPLIANCE_FRAMEWORKS.map((framework) => ({
    id: framework.id,
    name: framework.name,
    version: framework.version,
    description: framework.description,
    categoriesCount: framework.categories.length,
    controlsCount: framework.categories.reduce(
      (sum, category) => sum + category.controls.length,
      0
    ),
  }));
}

/**
 * Get a specific control by framework and control ID.
 */
export function getControl(
  frameworkId: string,
  controlId: string
): Control | null {
  const framework = getFramework(frameworkId);
  if (!framework) return null;

  for (const category of framework.categories) {
    const control = category.controls.find((c) => c.id === controlId);
    if (control) return control;
  }
  return null;
}

/**
 * Get category for a control.
 */
export function getCategoryForControl(
  frameworkId: string,
  controlId: string
): { categoryId: string; categoryName: string } | null {
  const framework = getFramework(frameworkId);
  if (!framework) return null;

  for (const category of framework.categories) {
    const control = category.controls.find((c) => c.id === controlId);
    if (control) {
      return {
        categoryId: category.id,
        categoryName: category.name,
      };
    }
  }
  return null;
}

/**
 * Get all controls for a framework as a flat list.
 */
export function getAllControls(frameworkId: string): Control[] {
  const framework = getFramework(frameworkId);
  if (!framework) return [];

  return framework.categories.flatMap((category) => category.controls);
}

/**
 * Get total control count for a framework.
 */
export function getControlCount(frameworkId: string): number {
  return getAllControls(frameworkId).length;
}

/**
 * Find controls by CWE ID across all frameworks.
 */
export function findControlsByCwe(cweId: string): Array<{
  frameworkId: string;
  frameworkName: string;
  categoryId: string;
  categoryName: string;
  control: Control;
}> {
  const results: Array<{
    frameworkId: string;
    frameworkName: string;
    categoryId: string;
    categoryName: string;
    control: Control;
  }> = [];

  for (const framework of COMPLIANCE_FRAMEWORKS) {
    for (const category of framework.categories) {
      for (const control of category.controls) {
        if (control.cweIds.includes(cweId)) {
          results.push({
            frameworkId: framework.id,
            frameworkName: framework.name,
            categoryId: category.id,
            categoryName: category.name,
            control,
          });
        }
      }
    }
  }

  return results;
}

/**
 * Find controls by category string across all frameworks.
 */
export function findControlsByCategory(category: string): Array<{
  frameworkId: string;
  frameworkName: string;
  categoryId: string;
  categoryName: string;
  control: Control;
}> {
  const results: Array<{
    frameworkId: string;
    frameworkName: string;
    categoryId: string;
    categoryName: string;
    control: Control;
  }> = [];

  for (const framework of COMPLIANCE_FRAMEWORKS) {
    for (const cat of framework.categories) {
      for (const control of cat.controls) {
        if (control.relatedCategories?.includes(category)) {
          results.push({
            frameworkId: framework.id,
            frameworkName: framework.name,
            categoryId: cat.id,
            categoryName: cat.name,
            control,
          });
        }
      }
    }
  }

  return results;
}

/**
 * Default framework for compliance views.
 */
export const DEFAULT_FRAMEWORK_ID = 'owasp-top-10-2021';
