/**
 * Pipeline entry point — re-exports the extracted pipeline function and shared types.
 *
 * Consumers import from this module to call the pipeline as a library function
 * within their own workflow context.
 */

export { pentestPipeline } from './workflows.js';
export type {
  AgentMetrics,
  PipelineInput,
  PipelineState,
  PipelineSummary,
  ResumeState,
  VulnExploitPipelineResult,
} from './shared.js';
export type { ActivityInput } from './activities.js';
