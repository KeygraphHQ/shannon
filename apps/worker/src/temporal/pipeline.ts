/**
 * Pipeline entry point — re-exports the extracted pipeline function and shared types.
 *
 * Consumers import from this module to call the pipeline as a library function
 * within their own workflow context.
 */

export type { ActivityInput } from './activities.js';
export type {
  BlackboxTerminalStatus,
  BlackboxWorkflowInput,
  BlackboxWorkflowResult,
} from '../blackbox/activities.js';
export type { BlackboxWorkflowProgress } from './blackbox-workflow.js';
export type {
  AgentMetrics,
  PipelineInput,
  PipelineState,
  PipelineSummary,
  ResumeState,
  VulnExploitPipelineResult,
} from './shared.js';
export { blackboxAuthzWorkflow, pentestPipeline } from './workflows.js';
