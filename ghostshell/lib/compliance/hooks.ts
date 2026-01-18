/**
 * Compliance mapping hooks.
 * Functions to be called at various points in the application lifecycle.
 */

import { db } from '@/lib/db';
import { createFindingMappings, mapScanFindings } from './mapper';

/**
 * Auto-map a single finding when it's created.
 * Call this after creating a new finding to automatically generate compliance mappings.
 */
export async function onFindingCreated(
  findingId: string,
  finding: { cwe: string | null; category: string }
): Promise<void> {
  try {
    await createFindingMappings(findingId, finding);
  } catch (error) {
    // Log but don't fail - mapping is non-critical
    console.error(`Failed to create compliance mappings for finding ${findingId}:`, error);
  }
}

/**
 * Auto-map all findings for a scan when it completes.
 * Call this after scan completion to ensure all findings have compliance mappings.
 */
export async function onScanCompleted(scanId: string): Promise<{
  mappedCount: number;
  findingsCount: number;
}> {
  try {
    return await mapScanFindings(scanId);
  } catch (error) {
    // Log but don't fail - mapping is non-critical
    console.error(`Failed to create compliance mappings for scan ${scanId}:`, error);
    return { mappedCount: 0, findingsCount: 0 };
  }
}

/**
 * Batch create findings with auto-mapping.
 * Use this to create multiple findings and their mappings efficiently.
 */
export async function createFindingsWithMappings(
  findings: Array<{
    scanId: string;
    title: string;
    description: string | null;
    severity: string;
    category: string;
    status: string;
    cvss: number | null;
    cwe: string | null;
    remediation: string | null;
    evidence: string | null;
    location: string | null;
    affectedAsset: string | null;
    request: string | null;
    response: string | null;
    toolSource: string | null;
  }>
): Promise<{ createdCount: number; mappedCount: number }> {
  let createdCount = 0;
  let mappedCount = 0;

  // Create findings in a transaction
  for (const finding of findings) {
    const created = await db.finding.create({
      data: finding,
    });

    createdCount++;

    // Create compliance mappings
    const count = await createFindingMappings(created.id, {
      cwe: finding.cwe,
      category: finding.category,
    });

    mappedCount += count;
  }

  return { createdCount, mappedCount };
}

/**
 * Re-map all findings for a scan.
 * Use this to regenerate mappings after framework updates or to fix mapping issues.
 */
export async function remapScanFindings(scanId: string): Promise<{
  deletedCount: number;
  mappedCount: number;
  findingsCount: number;
}> {
  // Get all finding IDs for the scan
  const findings = await db.finding.findMany({
    where: { scanId },
    select: { id: true },
  });

  const findingIds = findings.map((f) => f.id);

  // Delete existing mappings
  const deleted = await db.complianceMapping.deleteMany({
    where: {
      findingId: { in: findingIds },
    },
  });

  // Create new mappings
  const result = await mapScanFindings(scanId);

  return {
    deletedCount: deleted.count,
    mappedCount: result.mappedCount,
    findingsCount: result.findingsCount,
  };
}

/**
 * Get mapping statistics for an organization.
 */
export async function getOrgMappingStats(organizationId: string): Promise<{
  totalFindings: number;
  mappedFindings: number;
  totalMappings: number;
  frameworkCoverage: Record<string, number>;
}> {
  // Get all scans for the organization
  const scans = await db.scan.findMany({
    where: { organizationId },
    select: { id: true },
  });

  const scanIds = scans.map((s) => s.id);

  // Get findings with their mappings
  const findings = await db.finding.findMany({
    where: {
      scanId: { in: scanIds },
    },
    include: {
      complianceMappings: true,
    },
  });

  const totalFindings = findings.length;
  const mappedFindings = findings.filter(
    (f) => f.complianceMappings.length > 0
  ).length;
  const totalMappings = findings.reduce(
    (sum, f) => sum + f.complianceMappings.length,
    0
  );

  // Count mappings per framework
  const frameworkCoverage: Record<string, number> = {};
  for (const finding of findings) {
    for (const mapping of finding.complianceMappings) {
      frameworkCoverage[mapping.frameworkId] =
        (frameworkCoverage[mapping.frameworkId] || 0) + 1;
    }
  }

  return {
    totalFindings,
    mappedFindings,
    totalMappings,
    frameworkCoverage,
  };
}
