/**
 * Injectable interfaces for extending the pentest pipeline.
 *
 * All interfaces have default no-op implementations.
 * Consumers can provide alternate implementations via the DI container.
 */

export type { CheckpointProvider, CheckpointContext, SkipDecision } from './checkpoint-provider.js';
export { NoOpCheckpointProvider } from './checkpoint-provider.js';
export type { FindingsProvider } from './findings-provider.js';
export { NoOpFindingsProvider } from './findings-provider.js';
export type { ReportOutputProvider } from './report-output-provider.js';
export { NoOpReportOutputProvider } from './report-output-provider.js';
