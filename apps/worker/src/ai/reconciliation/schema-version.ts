/**
 * Schema version shared by every reconciliation artifact and publication.
 *
 * Keep this leaf module free of runtime imports so workflow-safe type modules can
 * refer to the version without pulling filesystem code into a workflow bundle.
 */
export const RECONCILIATION_SCHEMA_VERSION = 1 as const;
