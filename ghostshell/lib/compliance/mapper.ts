/**
 * Compliance mapper - maps findings to compliance framework controls.
 * Uses CWE IDs and finding categories for automatic mapping.
 */

import { db } from '@/lib/db';
import type {
  ComplianceMappingEntry,
  ComplianceScorecard,
  CategoryScore,
  ScanComplianceView,
  ControlStatus,
  CategoryMapping,
  ControlMapping,
  FindingSummary,
} from './types';
import {
  COMPLIANCE_FRAMEWORKS,
  getFramework,
  findControlsByCwe,
  findControlsByCategory,
  getAllControls,
  getCategoryForControl,
} from './frameworks';

/**
 * Map a single finding to compliance controls based on CWE and category.
 */
export function mapFindingToControls(
  finding: {
    cwe: string | null;
    category: string;
  },
  frameworkIds?: string[]
): ComplianceMappingEntry[] {
  const mappings: ComplianceMappingEntry[] = [];
  const seenControls = new Set<string>();

  // Determine which frameworks to check
  const frameworks = frameworkIds
    ? frameworkIds
        .map((id) => getFramework(id))
        .filter((f): f is NonNullable<typeof f> => f !== null)
    : COMPLIANCE_FRAMEWORKS;

  // First, try mapping by CWE ID (most accurate)
  if (finding.cwe) {
    // Parse CWE ID - could be "CWE-79" or just "79"
    const cweId = finding.cwe.toUpperCase().startsWith('CWE-')
      ? finding.cwe
      : `CWE-${finding.cwe}`;

    const cweMatches = findControlsByCwe(cweId);

    for (const match of cweMatches) {
      // Filter by requested frameworks if specified
      if (
        frameworkIds &&
        !frameworkIds.includes(match.frameworkId)
      ) {
        continue;
      }

      const key = `${match.frameworkId}:${match.control.id}`;
      if (!seenControls.has(key)) {
        seenControls.add(key);
        mappings.push({
          frameworkId: match.frameworkId,
          frameworkName: match.frameworkName,
          frameworkVersion:
            frameworks.find((f) => f.id === match.frameworkId)?.version || '',
          controlId: match.control.id,
          controlName: match.control.name,
          categoryId: match.categoryId,
          categoryName: match.categoryName,
          confidence: 'auto',
        });
      }
    }
  }

  // Second, try mapping by category (fallback)
  if (finding.category) {
    const categoryMatches = findControlsByCategory(finding.category);

    for (const match of categoryMatches) {
      // Filter by requested frameworks if specified
      if (
        frameworkIds &&
        !frameworkIds.includes(match.frameworkId)
      ) {
        continue;
      }

      const key = `${match.frameworkId}:${match.control.id}`;
      if (!seenControls.has(key)) {
        seenControls.add(key);
        mappings.push({
          frameworkId: match.frameworkId,
          frameworkName: match.frameworkName,
          frameworkVersion:
            frameworks.find((f) => f.id === match.frameworkId)?.version || '',
          controlId: match.control.id,
          controlName: match.control.name,
          categoryId: match.categoryId,
          categoryName: match.categoryName,
          confidence: 'auto',
        });
      }
    }
  }

  return mappings;
}

/**
 * Create compliance mappings for a finding in the database.
 */
export async function createFindingMappings(
  findingId: string,
  finding: { cwe: string | null; category: string },
  frameworkIds?: string[]
): Promise<number> {
  const mappings = mapFindingToControls(finding, frameworkIds);

  if (mappings.length === 0) {
    return 0;
  }

  // Batch create mappings
  const created = await db.complianceMapping.createMany({
    data: mappings.map((m) => ({
      findingId,
      frameworkId: m.frameworkId,
      frameworkVersion: m.frameworkVersion,
      controlId: m.controlId,
      controlName: m.controlName,
      confidence: m.confidence,
    })),
    skipDuplicates: true,
  });

  return created.count;
}

/**
 * Map all findings for a scan to compliance controls.
 */
export async function mapScanFindings(
  scanId: string,
  frameworkIds?: string[]
): Promise<{ mappedCount: number; findingsCount: number }> {
  // Get all findings for the scan
  const findings = await db.finding.findMany({
    where: { scanId },
    select: {
      id: true,
      cwe: true,
      category: true,
    },
  });

  let mappedCount = 0;

  for (const finding of findings) {
    const count = await createFindingMappings(
      finding.id,
      { cwe: finding.cwe, category: finding.category },
      frameworkIds
    );
    mappedCount += count;
  }

  return { mappedCount, findingsCount: findings.length };
}

/**
 * Get compliance scorecard for a scan.
 */
export async function getScanScorecard(
  scanId: string,
  frameworkId: string
): Promise<ComplianceScorecard | null> {
  const framework = getFramework(frameworkId);
  if (!framework) return null;

  // Get all findings for the scan with their mappings
  const findings = await db.finding.findMany({
    where: { scanId },
    include: {
      complianceMappings: {
        where: { frameworkId },
      },
    },
  });

  // Build control status map
  const controlFindings = new Map<string, typeof findings>();

  for (const finding of findings) {
    for (const mapping of finding.complianceMappings) {
      const existing = controlFindings.get(mapping.controlId) || [];
      existing.push(finding);
      controlFindings.set(mapping.controlId, existing);
    }
  }

  // Calculate scores per category
  const categories: CategoryScore[] = [];
  let totalControls = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalNotTested = 0;

  for (const category of framework.categories) {
    let categoryPassed = 0;
    let categoryFailed = 0;
    let categoryNotTested = 0;

    for (const control of category.controls) {
      const controlFindingsList = controlFindings.get(control.id);
      totalControls++;

      if (!controlFindingsList || controlFindingsList.length === 0) {
        // No findings mapped to this control - could be tested and passed, or not tested
        // For now, assume not tested (conservative approach)
        categoryNotTested++;
        totalNotTested++;
      } else {
        // Has findings - control is non-compliant
        categoryFailed++;
        totalFailed++;
      }
    }

    // Controls without issues = passed
    categoryPassed = category.controls.length - categoryFailed - categoryNotTested;
    totalPassed += categoryPassed;

    const categoryTotal = category.controls.length;
    const score = categoryTotal > 0 ? (categoryPassed / categoryTotal) * 100 : 100;

    let status: CategoryScore['status'] = 'not_tested';
    if (categoryNotTested === categoryTotal) {
      status = 'not_tested';
    } else if (categoryFailed === 0) {
      status = 'pass';
    } else if (categoryPassed === 0) {
      status = 'fail';
    } else {
      status = 'partial';
    }

    categories.push({
      categoryId: category.id,
      categoryName: category.name,
      score: Math.round(score),
      status,
      controlsPassed: categoryPassed,
      controlsFailed: categoryFailed,
      controlsNotTested: categoryNotTested,
    });
  }

  const overallScore =
    totalControls > 0 ? (totalPassed / totalControls) * 100 : 100;

  return {
    scanId,
    frameworkId,
    frameworkName: framework.name,
    overallScore: Math.round(overallScore),
    testedControls: totalPassed + totalFailed,
    passedControls: totalPassed,
    failedControls: totalFailed,
    notTestedControls: totalNotTested,
    categories,
  };
}

/**
 * Get detailed compliance view for a scan.
 */
export async function getScanComplianceView(
  scanId: string,
  frameworkIds?: string[]
): Promise<ScanComplianceView> {
  // Use all frameworks if not specified
  const frameworks = frameworkIds
    ? frameworkIds
        .map((id) => getFramework(id))
        .filter((f): f is NonNullable<typeof f> => f !== null)
    : COMPLIANCE_FRAMEWORKS;

  // Get all findings for the scan with their mappings
  const findings = await db.finding.findMany({
    where: { scanId },
    include: {
      complianceMappings: true,
    },
  });

  // Build framework views
  const frameworkViews: ScanComplianceView['frameworks'] = [];

  for (const framework of frameworks) {
    // Build control status map for this framework
    const controlFindings = new Map<string, typeof findings>();

    for (const finding of findings) {
      const relevantMappings = finding.complianceMappings.filter(
        (m) => m.frameworkId === framework.id
      );
      for (const mapping of relevantMappings) {
        const existing = controlFindings.get(mapping.controlId) || [];
        existing.push(finding);
        controlFindings.set(mapping.controlId, existing);
      }
    }

    // Build category mappings
    const categoryMappings: CategoryMapping[] = [];
    let totalControls = 0;
    let testedControls = 0;

    for (const category of framework.categories) {
      const controlMappings: ControlMapping[] = [];
      let categoryFindingsCount = 0;

      for (const control of category.controls) {
        totalControls++;
        const controlFindingsList = controlFindings.get(control.id) || [];

        let status: ControlStatus = 'not_tested';
        if (controlFindingsList.length > 0) {
          status = 'non_compliant';
          testedControls++;
        } else {
          // Check if any finding could have mapped to this control
          // If we have findings in the scan at all, and this control has CWE mappings,
          // we can consider it tested
          const allControls = getAllControls(framework.id);
          const thisControl = allControls.find((c) => c.id === control.id);
          if (thisControl && thisControl.cweIds.length > 0 && findings.length > 0) {
            status = 'compliant';
            testedControls++;
          }
        }

        const findingSummaries: FindingSummary[] = controlFindingsList.map(
          (f) => ({
            id: f.id,
            title: f.title,
            severity: f.severity,
            status: f.status,
          })
        );

        categoryFindingsCount += controlFindingsList.length;

        controlMappings.push({
          controlId: control.id,
          controlName: control.name,
          status,
          findings: findingSummaries,
        });
      }

      // Determine category status
      const hasNonCompliant = controlMappings.some(
        (c) => c.status === 'non_compliant'
      );
      const allCompliant = controlMappings.every(
        (c) => c.status === 'compliant'
      );
      const allNotTested = controlMappings.every(
        (c) => c.status === 'not_tested'
      );

      let categoryStatus: ControlStatus = 'not_tested';
      if (hasNonCompliant) {
        categoryStatus = 'non_compliant';
      } else if (allCompliant) {
        categoryStatus = 'compliant';
      } else if (!allNotTested) {
        categoryStatus = 'compliant'; // Some tested and compliant
      }

      categoryMappings.push({
        categoryId: category.id,
        categoryName: category.name,
        status: categoryStatus,
        findingsCount: categoryFindingsCount,
        controls: controlMappings,
      });
    }

    const coveragePercent =
      totalControls > 0 ? (testedControls / totalControls) * 100 : 0;

    frameworkViews.push({
      frameworkId: framework.id,
      frameworkName: framework.name,
      coveragePercent: Math.round(coveragePercent),
      categories: categoryMappings,
    });
  }

  return {
    scanId,
    frameworks: frameworkViews,
  };
}

/**
 * Get mappings for a specific scan.
 */
export async function getScanMappings(
  scanId: string,
  frameworkId?: string
): Promise<
  Array<{
    findingId: string;
    findingTitle: string;
    findingSeverity: string;
    mappings: ComplianceMappingEntry[];
  }>
> {
  const findings = await db.finding.findMany({
    where: { scanId },
    include: {
      complianceMappings: frameworkId
        ? { where: { frameworkId } }
        : true,
    },
  });

  return findings.map((finding) => ({
    findingId: finding.id,
    findingTitle: finding.title,
    findingSeverity: finding.severity,
    mappings: finding.complianceMappings.map((m) => {
      const framework = getFramework(m.frameworkId);
      const categoryInfo = getCategoryForControl(m.frameworkId, m.controlId);

      return {
        frameworkId: m.frameworkId,
        frameworkName: framework?.name || m.frameworkId,
        frameworkVersion: m.frameworkVersion,
        controlId: m.controlId,
        controlName: m.controlName,
        categoryId: categoryInfo?.categoryId || '',
        categoryName: categoryInfo?.categoryName || '',
        confidence: m.confidence as 'auto' | 'manual' | 'verified',
      };
    }),
  }));
}

/**
 * Delete all mappings for a finding.
 */
export async function deleteFindingMappings(findingId: string): Promise<void> {
  await db.complianceMapping.deleteMany({
    where: { findingId },
  });
}

/**
 * Delete all mappings for a scan.
 */
export async function deleteScanMappings(scanId: string): Promise<void> {
  // Get all finding IDs for the scan
  const findings = await db.finding.findMany({
    where: { scanId },
    select: { id: true },
  });

  const findingIds = findings.map((f) => f.id);

  await db.complianceMapping.deleteMany({
    where: {
      findingId: { in: findingIds },
    },
  });
}
