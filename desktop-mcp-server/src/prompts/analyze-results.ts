/**
 * analyze-results Prompt
 *
 * A prompt template for analyzing completed scan results.
 */

export const ANALYZE_RESULTS_PROMPT = {
  name: 'analyze-results',
  description: 'Analyze the results of a completed Shannon scan. Reads the report, metrics, and provides a conversational summary.',
  arguments: [
    {
      name: 'workflow_id',
      description: 'Workflow ID of the completed scan',
      required: true,
    },
  ],
};

export function buildAnalyzeResultsPrompt(workflowId: string): string {
  return [
    `Please analyze the results of Shannon scan: ${workflowId}`,
    '',
    'Steps:',
    '1. Query the workflow progress to confirm it completed',
    '2. Read the final report deliverable',
    '3. Summarize the key findings:',
    '   - Total vulnerabilities found by severity',
    '   - Most critical issues requiring immediate attention',
    '   - Attack vectors identified',
    '4. Provide actionable remediation recommendations',
    '5. Note the scan metrics (cost, duration, agents used)',
  ].join('\n');
}
