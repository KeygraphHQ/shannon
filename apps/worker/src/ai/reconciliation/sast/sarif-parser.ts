/** Appendix A SARIF validator. Document failures throw; invalid findings are classified and dropped. */

import path from 'node:path';
import type {
  DroppedSarifFinding,
  ParsedSarif,
  ParsedSarifFinding,
  SarifFindingDropReason,
  SarifLocation,
  SarifResult,
  SastPhase,
} from './types.js';

const CWE_PATTERN = /^CWE-[1-9][0-9]*$/;
const SEVERITIES = new Set(['Critical', 'High', 'Medium', 'Low', 'Info']);
const LEVELS = new Set(['error', 'warning', 'note']);

/** A run/document contract failure that invalidates the supplied SARIF reference. */
export class SarifDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SarifDocumentError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

// Phase is inferred from the tool name string rather than an explicit field, since the SARIF
// contract does not carry a phase number directly. This is a best-effort classification: an
// unrecognized name falls through to phase 3, the generic case, rather than failing the finding.
function detectPhase(toolName: string): SastPhase {
  const lower = toolName.toLowerCase();
  if (lower.includes('check') || lower.includes('phase0') || lower.includes('phase_0')) return 0;
  if (lower.includes('logic') || lower.includes('business') || lower.includes('phase4') || lower.includes('phase_4')) {
    return 4;
  }
  return 3;
}

function hasTraversal(uri: string): boolean {
  return uri.split('/').some((segment) => segment === '..' || segment === '.');
}

/** Whether a SARIF location is a normalized repository-relative POSIX path. */
export function isRepositoryRelativeSarifUri(uri: string): boolean {
  if (uri.length === 0 || uri.trim() !== uri || uri.includes('\\') || uri.includes('\0')) return false;
  if (path.posix.isAbsolute(uri) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(uri)) return false;
  if (uri.includes('//') || hasTraversal(uri)) return false;
  return path.posix.normalize(uri) === uri;
}

function validateRule(value: unknown): string {
  if (!isRecord(value) || !nonemptyString(value.id) || !CWE_PATTERN.test(value.id)) {
    throw new SarifDocumentError('SARIF rule metadata has an invalid CWE id');
  }
  if (!nonemptyString(value.name) || typeof value.helpUri !== 'string') {
    throw new SarifDocumentError('SARIF rule metadata is missing required strings');
  }
  for (const descriptionKey of ['shortDescription', 'fullDescription']) {
    const description = value[descriptionKey];
    if (!isRecord(description) || typeof description.text !== 'string') {
      throw new SarifDocumentError('SARIF rule metadata has an invalid description');
    }
  }
  if (!isRecord(value.properties) || value.properties.cwe !== value.id || !Array.isArray(value.properties.tags)) {
    throw new SarifDocumentError('SARIF rule metadata does not match its CWE id');
  }
  if (!value.properties.tags.every((tag) => typeof tag === 'string')) {
    throw new SarifDocumentError('SARIF rule tags are invalid');
  }
  return value.id;
}

// `requireSourceRoot` differs between callers: a result's primary location must declare
// `uriBaseId: '%SRCROOT%'` explicitly (it is the location a finding is keyed on), while a code-flow
// step's location may omit `uriBaseId` entirely and is only rejected if it names something other
// than `%SRCROOT%`.
function locationParts(
  value: unknown,
  requireSourceRoot: boolean,
): {
  location?: SarifLocation;
  reason?: SarifFindingDropReason;
} {
  if (!isRecord(value) || !isRecord(value.physicalLocation)) return { reason: 'location' };
  const physical = value.physicalLocation;
  if (!isRecord(physical.artifactLocation) || !isRecord(physical.region)) return { reason: 'location' };
  const artifact = physical.artifactLocation;
  const region = physical.region;
  if (typeof artifact.uri !== 'string') return { reason: 'location' };
  if (requireSourceRoot && artifact.uriBaseId !== '%SRCROOT%') return { reason: 'location' };
  if (!requireSourceRoot && artifact.uriBaseId !== undefined && artifact.uriBaseId !== '%SRCROOT%') {
    return { reason: 'location' };
  }
  if (hasTraversal(artifact.uri)) return { reason: 'traversal' };
  if (!isRepositoryRelativeSarifUri(artifact.uri)) return { reason: 'location' };
  if (!Number.isSafeInteger(region.startLine) || (region.startLine as number) <= 0) return { reason: 'line' };
  if (
    region.startColumn !== undefined &&
    (!Number.isSafeInteger(region.startColumn) || (region.startColumn as number) <= 0)
  ) {
    return { reason: 'location' };
  }
  if (region.snippet !== undefined && (!isRecord(region.snippet) || typeof region.snippet.text !== 'string')) {
    return { reason: 'location' };
  }
  if (value.message !== undefined && (!isRecord(value.message) || typeof value.message.text !== 'string')) {
    return { reason: 'location' };
  }
  return { location: value as unknown as SarifLocation };
}

function validateCodeFlows(value: unknown, primary: SarifLocation): SarifFindingDropReason | undefined {
  if (!Array.isArray(value) || value.length === 0) return 'malformed';
  let firstFlowLastLocation: SarifLocation | undefined;

  for (let flowIndex = 0; flowIndex < value.length; flowIndex++) {
    const flow = value[flowIndex];
    if (!isRecord(flow) || !Array.isArray(flow.threadFlows) || flow.threadFlows.length === 0) return 'malformed';
    for (let threadIndex = 0; threadIndex < flow.threadFlows.length; threadIndex++) {
      const thread = flow.threadFlows[threadIndex];
      if (!isRecord(thread) || !Array.isArray(thread.locations) || thread.locations.length === 0) return 'malformed';
      for (let locationIndex = 0; locationIndex < thread.locations.length; locationIndex++) {
        const step = thread.locations[locationIndex];
        if (!isRecord(step) || !nonemptyString(step.importance)) return 'malformed';
        const checked = locationParts(step.location, false);
        if (checked.reason !== undefined) return checked.reason;
        if (
          !isRecord(step.location) ||
          !isRecord(step.location.message) ||
          typeof step.location.message.text !== 'string'
        ) {
          return 'malformed';
        }
        if (flowIndex === 0 && threadIndex === 0 && locationIndex === thread.locations.length - 1) {
          firstFlowLastLocation = checked.location;
        }
      }
    }
  }

  // The last step of the first thread flow is the sink, and it must land on the same file and line
  // as the result's primary location. A code flow whose sink disagrees with the reported location
  // describes a different defect than it claims, so the finding is dropped.
  const primaryPhysical = primary.physicalLocation;
  const sinkPhysical = firstFlowLastLocation?.physicalLocation;
  if (
    sinkPhysical === undefined ||
    sinkPhysical.artifactLocation.uri !== primaryPhysical.artifactLocation.uri ||
    sinkPhysical.region.startLine !== primaryPhysical.region.startLine
  ) {
    return 'location';
  }
  return undefined;
}

function resultRuleId(value: unknown): string | undefined {
  return isRecord(value) && typeof value.ruleId === 'string' ? value.ruleId : undefined;
}

function validateResult(value: unknown, rules: ReadonlySet<string>): SarifFindingDropReason | SarifResult {
  if (!isRecord(value)) return 'malformed';
  if (!nonemptyString(value.ruleId) || !CWE_PATTERN.test(value.ruleId)) return 'rule';
  if (!isRecord(value.properties) || value.properties.cwe !== value.ruleId || !rules.has(value.ruleId)) return 'rule';
  if (!isRecord(value.message) || typeof value.message.text !== 'string') return 'malformed';
  if (!LEVELS.has(value.level as string)) return 'severity';
  if (!Array.isArray(value.locations) || value.locations.length === 0) return 'location';
  const primary = locationParts(value.locations[0], true);
  if (primary.reason !== undefined) return primary.reason;
  if (primary.location === undefined) return 'location';

  const codeFlowReason = validateCodeFlows(value.codeFlows, primary.location);
  if (codeFlowReason !== undefined) return codeFlowReason;

  if (!SEVERITIES.has(value.properties.severity as string)) return 'severity';
  if (value.properties.status !== 'verified') return 'status';
  if (value.properties.findingSubType !== 'AGENT_SAST') return 'subtype';
  if (typeof value.properties.description !== 'string') return 'malformed';
  // These property names belong to a richer internal finding shape than the one this pipeline
  // accepts; a result carrying any of them was not produced against this exact SARIF contract (or
  // carries content, such as a proof-of-concept, this pipeline never wants to ingest), so it is
  // dropped rather than accepted with those fields silently ignored.
  for (const forbidden of ['invariantDescription', 'owasp_category', 'proofOfConcept']) {
    if (Object.hasOwn(value.properties, forbidden)) return 'malformed';
  }
  return value as unknown as SarifResult;
}

function zeroDropReasons(): Record<SarifFindingDropReason, number> {
  return {
    malformed: 0,
    rule: 0,
    location: 0,
    traversal: 0,
    line: 0,
    severity: 0,
    status: 0,
    subtype: 0,
  };
}

/** Parse and strictly validate the Capella SARIF byte contract. */
export function parseSarifContent(content: string): ParsedSarif {
  let document: unknown;
  try {
    document = JSON.parse(content);
  } catch {
    throw new SarifDocumentError('SARIF document is not valid JSON');
  }
  if (!isRecord(document)) throw new SarifDocumentError('SARIF document is not an object');
  if (!nonemptyString(document.$schema) || document.version !== '2.1.0') {
    throw new SarifDocumentError('SARIF document metadata is invalid');
  }
  if (!Array.isArray(document.runs) || document.runs.length === 0) {
    throw new SarifDocumentError('SARIF document has no runs');
  }

  const findings: ParsedSarifFinding[] = [];
  const droppedFindings: DroppedSarifFinding[] = [];
  const droppedByReason = zeroDropReasons();
  let declaredFindings = 0;

  for (const runValue of document.runs) {
    if (!isRecord(runValue) || !isRecord(runValue.tool) || !isRecord(runValue.tool.driver)) {
      throw new SarifDocumentError('SARIF run tool metadata is invalid');
    }
    const driver = runValue.tool.driver;
    if (!nonemptyString(driver.name) || !nonemptyString(driver.version) || !nonemptyString(driver.informationUri)) {
      throw new SarifDocumentError('SARIF run driver metadata is incomplete');
    }
    if (!Array.isArray(driver.rules) || !Array.isArray(runValue.results) || !isRecord(runValue.properties)) {
      throw new SarifDocumentError('SARIF run arrays or properties are invalid');
    }
    if (
      typeof runValue.properties.repository !== 'string' ||
      !Number.isSafeInteger(runValue.properties.totalFindings) ||
      runValue.properties.totalFindings !== runValue.results.length
    ) {
      throw new SarifDocumentError('SARIF run finding count or repository metadata is invalid');
    }

    const rules = new Set<string>();
    for (const rule of driver.rules) {
      const id = validateRule(rule);
      if (rules.has(id)) throw new SarifDocumentError('SARIF run contains duplicate rule metadata');
      rules.add(id);
    }

    const phase = detectPhase(driver.name);
    declaredFindings += runValue.results.length;
    for (const resultValue of runValue.results) {
      const validation = validateResult(resultValue, rules);
      if (typeof validation === 'string') {
        droppedByReason[validation]++;
        const ruleId = resultRuleId(resultValue);
        droppedFindings.push({ ...(ruleId !== undefined && { ruleId }), reason: validation });
        continue;
      }
      findings.push({ result: validation, phase, toolName: driver.name });
    }
  }

  return { findings, droppedFindings, droppedByReason, declaredFindings };
}
