/** Strict SARIF and SAST-enrichment contracts. */

export type ShannonCategory = 'INJECTION' | 'XSS' | 'AUTH' | 'AUTHZ' | 'SSRF' | 'MISC';
export type Priority = 'P1' | 'P2' | 'P3';
export type Confidence = 'high' | 'medium' | 'low';
// Which analysis phase produced a finding, detected from the SARIF driver's tool name (see
// `detectPhase` in sarif-parser.ts): 0 is an early check-style phase, 4 is business-logic analysis,
// and 3 is every other phase. Kept as a small closed set of numbers rather than named phase strings
// because it only needs to round-trip through enrichment, not describe the phase to a person.
export type SastPhase = 0 | 3 | 4;

export interface CWEMapping {
  category: ShannonCategory;
  name: string;
  priority: Priority;
}

export interface SarifRegion {
  startLine: number;
  startColumn?: number;
  snippet?: { text: string };
}

export interface SarifArtifactLocation {
  uri: string;
  uriBaseId?: '%SRCROOT%';
}

export interface SarifLocation {
  physicalLocation: {
    artifactLocation: SarifArtifactLocation;
    region: SarifRegion;
  };
  message?: { text: string };
}

export interface SarifThreadFlowLocation {
  location: SarifLocation;
  importance: string;
}

export interface SarifResult {
  ruleId: string;
  level: 'error' | 'warning' | 'note';
  message: { text: string };
  locations: [SarifLocation, ...unknown[]];
  codeFlows: Array<{
    threadFlows: Array<{
      locations: SarifThreadFlowLocation[];
    }>;
  }>;
  properties: {
    severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
    cwe: string;
    status: 'verified';
    description: string;
    findingSubType: 'AGENT_SAST';
  };
}

export type SarifFindingDropReason =
  | 'malformed'
  | 'rule'
  | 'location'
  | 'traversal'
  | 'line'
  | 'severity'
  | 'status'
  | 'subtype';

export interface ParsedSarifFinding {
  result: SarifResult;
  phase: SastPhase;
  toolName: string;
}

export interface DroppedSarifFinding {
  ruleId?: string;
  reason: SarifFindingDropReason;
}

export interface ParsedSarif {
  findings: ParsedSarifFinding[];
  droppedFindings: DroppedSarifFinding[];
  droppedByReason: Record<SarifFindingDropReason, number>;
  declaredFindings: number;
}

export interface DataflowFindingContext {
  cwe: string;
  message: string;
  severity: string;
  confidence: number;
  sinkFile: string;
  sinkLine: number;
  sinkColumn: number;
  sinkSnippet: string;
  sourceFile: string;
  sourceLine: number;
  sourceColumn: number;
  sourceSnippet: string;
  dataflowPath: Array<{
    file: string;
    line: number;
    column: number;
    snippet: string;
    role: string;
  }>;
  validationReason: string;
  sanitizationStatus: string;
}

export interface LocalizedFindingContext {
  cwe: string;
  message: string;
  severity: string;
  confidence: number;
  file: string;
  line: number;
  column: number;
  snippet: string;
}

// A dataflow context is built when a finding's code flow names a distinct source and sink;
// otherwise the finding gets a localized context describing only its single reported location.
export type FindingContext = DataflowFindingContext | LocalizedFindingContext;

export interface ClassifiedFinding {
  context: FindingContext;
  mapping: CWEMapping;
  phase: SastPhase;
}
