/**
 * Compliance framework mapping library.
 * Maps findings to OWASP, PCI-DSS, SOC 2, and CIS controls.
 */

// Export types
export * from './types';

// Export frameworks
export * from './frameworks';

// Export mapper functions
export {
  mapFindingToControls,
  createFindingMappings,
  mapScanFindings,
  getScanScorecard,
  getScanComplianceView,
  getScanMappings,
  deleteFindingMappings,
  deleteScanMappings,
} from './mapper';

// Export hooks for auto-mapping integration
export {
  onFindingCreated,
  onScanCompleted,
  createFindingsWithMappings,
  remapScanFindings,
  getOrgMappingStats,
} from './hooks';
