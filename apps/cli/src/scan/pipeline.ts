/**
 * Static description of the Shannon scan pipeline, plus the worker types the CLI
 * reads back from Temporal.
 *
 * The CLI cannot import from the worker package, so this mirrors it. Keep in sync with:
 *   - apps/worker/src/types/agents.ts        (agent names / ordering)
 *   - apps/worker/src/session-manager.ts     (phase membership)
 *   - apps/worker/src/temporal/activities.ts (the run*Agent activity names → `activityType`)
 *   - apps/worker/src/temporal/shared.ts     (PipelineState / PipelineSummary)
 *   - apps/worker/src/types/metrics.ts       (AgentMetrics)
 */

export interface AgentSpec {
  /** Canonical agent name as it appears in PipelineState.completedAgents / agentMetrics. */
  readonly name: string;
  /** Short label for the progress tree. */
  readonly label: string;
  /** Temporal activity type name — how a running agent shows up in pendingActivities. */
  readonly activityType: string;
}

export interface PhaseSpec {
  readonly key: string;
  readonly label: string;
  readonly parallel: boolean;
  readonly agents: readonly AgentSpec[];
}

/** The five pipeline phases in execution order, each with its agents. */
export const PIPELINE: readonly PhaseSpec[] = [
  {
    key: 'pre-recon',
    label: 'Pre-Recon',
    parallel: false,
    agents: [{ name: 'pre-recon', label: 'pre-recon', activityType: 'runPreReconAgent' }],
  },
  {
    key: 'recon',
    label: 'Recon',
    parallel: false,
    agents: [{ name: 'recon', label: 'recon', activityType: 'runReconAgent' }],
  },
  {
    key: 'vulnerability-analysis',
    label: 'Vulnerability Analysis',
    parallel: true,
    agents: [
      { name: 'injection-vuln', label: 'injection', activityType: 'runInjectionVulnAgent' },
      { name: 'xss-vuln', label: 'xss', activityType: 'runXssVulnAgent' },
      { name: 'auth-vuln', label: 'auth', activityType: 'runAuthVulnAgent' },
      { name: 'ssrf-vuln', label: 'ssrf', activityType: 'runSsrfVulnAgent' },
      { name: 'authz-vuln', label: 'authz', activityType: 'runAuthzVulnAgent' },
    ],
  },
  {
    key: 'exploitation',
    label: 'Exploitation',
    parallel: true,
    agents: [
      { name: 'injection-exploit', label: 'injection', activityType: 'runInjectionExploitAgent' },
      { name: 'xss-exploit', label: 'xss', activityType: 'runXssExploitAgent' },
      { name: 'auth-exploit', label: 'auth', activityType: 'runAuthExploitAgent' },
      { name: 'ssrf-exploit', label: 'ssrf', activityType: 'runSsrfExploitAgent' },
      { name: 'authz-exploit', label: 'authz', activityType: 'runAuthzExploitAgent' },
    ],
  },
  {
    key: 'reporting',
    label: 'Reporting',
    parallel: false,
    agents: [{ name: 'report', label: 'report', activityType: 'runReportAgent' }],
  },
];

/** Temporal activity type name → canonical agent name, for mapping pendingActivities. */
export const ACTIVITY_TO_AGENT: Readonly<Record<string, string>> = Object.fromEntries(
  PIPELINE.flatMap((phase) => phase.agents.map((agent) => [agent.activityType, agent.name])),
);

/** The vuln/exploit class of an agent (e.g. "authz-vuln" → "authz"), for failedPipelines matching. */
export function agentClass(name: string): string {
  return name.replace(/-(vuln|exploit)$/, '');
}

// === Worker types read back from Temporal (mirror of shared.ts / metrics.ts) ===

export interface AgentMetrics {
  readonly durationMs: number;
  readonly costUsd: number | null;
  readonly numTurns: number | null;
  readonly model?: string;
  readonly skipped?: boolean;
}

export interface PipelineSummary {
  readonly totalCostUsd: number;
  readonly totalDurationMs: number; // Wall-clock (end - start)
  readonly totalTurns: number;
  readonly agentCount: number;
}

export type PipelineStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'partial';

export interface PipelineState {
  readonly status: PipelineStatus;
  readonly currentPhase: string | null;
  readonly currentAgent: string | null;
  readonly completedAgents: string[];
  readonly failedPipelines: { vulnType: string; error: string }[];
  readonly failedAgent: string | null;
  readonly error: string | null;
  readonly startTime: number;
  readonly agentMetrics: Record<string, AgentMetrics>;
  readonly summary: PipelineSummary | null;
}
