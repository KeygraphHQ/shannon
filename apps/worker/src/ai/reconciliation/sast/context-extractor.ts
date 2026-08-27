/** Build the bounded finding context sent to the SAST enrichment model. */

import type {
  DataflowFindingContext,
  FindingContext,
  LocalizedFindingContext,
  SarifLocation,
  SarifResult,
} from './types.js';

function locationInfo(location: SarifLocation): { file: string; line: number; column: number; snippet: string } {
  const physical = location.physicalLocation;
  return {
    file: physical.artifactLocation.uri,
    line: physical.region.startLine,
    column: physical.region.startColumn ?? 1,
    snippet: physical.region.snippet?.text ?? '',
  };
}

function confidenceScore(level: SarifResult['level']): number {
  if (level === 'error') return 0.9;
  if (level === 'warning') return 0.6;
  return 0.3;
}

// Best-effort labeling for the model's context only; a wrong guess here does not affect identity,
// dedupe, or which class a finding routes to; it only changes how a step reads in the enrichment prompt.
function stepRole(message: string, index: number, lastIndex: number): string {
  const normalized = message.toLowerCase();
  if (normalized.includes('sanit')) return 'SANITIZED';
  if (normalized.startsWith('source')) return 'SOURCE';
  if (normalized.startsWith('sink')) return 'SINK';
  if (index === 0) return 'SOURCE';
  if (index === lastIndex) return 'SINK';
  return 'HOP';
}

function localizedContext(result: SarifResult): LocalizedFindingContext {
  const primary = locationInfo(result.locations[0]);
  return {
    cwe: result.ruleId,
    message: result.message.text,
    severity: result.properties.severity.toLowerCase(),
    confidence: confidenceScore(result.level),
    ...primary,
  };
}

/** Extract only validated SARIF fields; no repository identity or fallback path is synthesized. */
export function extractContext(result: SarifResult): FindingContext {
  const locations = result.codeFlows[0]?.threadFlows[0]?.locations;
  if (locations === undefined || locations.length === 0) return localizedContext(result);

  const lastIndex = locations.length - 1;
  const dataflowPath = locations.map((step, index) => {
    const info = locationInfo(step.location);
    return { ...info, role: stepRole(step.location.message?.text ?? '', index, lastIndex) };
  });
  const source = dataflowPath[0];
  const sink = dataflowPath[lastIndex];
  if (source === undefined || sink === undefined) return localizedContext(result);

  const context: DataflowFindingContext = {
    cwe: result.ruleId,
    message: result.message.text,
    severity: result.properties.severity.toLowerCase(),
    confidence: confidenceScore(result.level),
    sinkFile: sink.file,
    sinkLine: sink.line,
    sinkColumn: sink.column,
    sinkSnippet: sink.snippet,
    sourceFile: source.file,
    sourceLine: source.line,
    sourceColumn: source.column,
    sourceSnippet: source.snippet,
    dataflowPath,
    validationReason: result.properties.description,
    sanitizationStatus: dataflowPath.some((step) => step.role === 'SANITIZED') ? 'partial' : 'none',
  };
  return context;
}
