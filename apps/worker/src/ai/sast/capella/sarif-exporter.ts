// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  CAPELLA_SARIF_DRIVER_NAME,
  CAPELLA_SARIF_DRIVER_VERSION,
  CAPELLA_SARIF_INFORMATION_URI,
  CAPELLA_SARIF_SCHEMA,
  type CapellaSarif,
  type CapellaSarifLevel,
  type CapellaSarifResult,
  type CapellaSarifRule,
  type CapellaSarifSeverity,
  validateCapellaSarif,
} from '../sarif-profile.js';
import type { AgenticSastOmission, AgenticSastReduction, SarifRef } from '../types.js';
import { atomicPublishBytes, sha256Bytes, stableJson } from './artifacts.js';
import { SastContractError } from './errors.js';
import type { CapellaFinding, CapellaSeverity } from './finding-types.js';
import { isExcludedCodePath, isNormalizedRepositoryPath, isValidPrimaryCodePath, parseCodePath } from './paths.js';
import { renderCapellaReport } from './report.js';
import type { AtomicPublishOptions } from './types.js';
import { isCapellaFinding } from './validation.js';

export interface CapellaExportResult {
  readonly sarif: SarifRef;
  readonly findingCount: number;
  readonly coverage: 'complete' | 'reduced';
  readonly warnings: string[];
  readonly reportPath: string;
  readonly reduction?: AgenticSastReduction;
}

export interface CapellaExportOptions {
  readonly artifactRoot: string;
  readonly repositoryLabel: string;
  readonly codePathAvoids: readonly string[];
  readonly publishOptions?: AtomicPublishOptions;
  readonly cancellationSignal?: AbortSignal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function throwIfExportCancelled(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException('Capella export cancelled.', 'AbortError');
}

export function passesExportGate(finding: CapellaFinding): boolean {
  return (
    finding.status === 'VALID' &&
    (finding.production_viability === 'VIABLE' || finding.production_viability === 'CONDITIONAL_VIABLE')
  );
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function severityName(severity: CapellaSeverity): CapellaSarifSeverity {
  switch (severity) {
    case 'CRITICAL':
      return 'Critical';
    case 'HIGH':
      return 'High';
    case 'MEDIUM':
      return 'Medium';
    case 'LOW':
      return 'Low';
  }
}

function severityLevel(severity: CapellaSeverity): CapellaSarifLevel {
  if (severity === 'CRITICAL' || severity === 'HIGH') return 'error';
  if (severity === 'MEDIUM') return 'warning';
  return 'note';
}

function cweHelpUri(cwe: string): string {
  return `https://cwe.mitre.org/data/definitions/${cwe.slice('CWE-'.length)}.html`;
}

function threadLocationLabel(index: number, locationCount: number): 'Source' | 'Step' | 'Sink' {
  if (index === locationCount - 1) return 'Sink';
  if (index === 0) return 'Source';
  return 'Step';
}

function classifyExportCandidate(
  value: unknown,
): { readonly finding: CapellaFinding } | { readonly omission: AgenticSastOmission } {
  if (!isCapellaFinding(value)) {
    return { omission: buildOmission(value, 'invalid_finding_record') };
  }
  const primary = value.code_paths[0];
  if (value.code_paths.length === 0 || primary === undefined) {
    return { omission: buildOmission(value, 'missing_code_path') };
  }
  // Only the primary (sink) must be a `file:line` locator: it becomes the SARIF location.
  // Trace steps are held to no such rule at submit time, and `buildResult` already drops any
  // that are not `file:line`, so gating on them here would discard a whole finding for a
  // malformed step the two ends never agreed to require.
  if (!isValidPrimaryCodePath(primary)) {
    return { omission: buildOmission(value, 'invalid_code_path') };
  }
  return { finding: value };
}

function buildOmission(value: unknown, reason: AgenticSastOmission['reason']): AgenticSastOmission {
  if (!isRecord(value)) return { reason };
  const findingId = safeFindingId(value.id);
  const displayName = safeFindingDisplayName(value.cwe, value.title);
  return {
    reason,
    ...(findingId !== undefined && { findingId }),
    ...(displayName !== undefined && { displayName }),
  };
}

function safeFindingId(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^[a-z0-9-]{1,256}$/.test(value)) return undefined;
  return value;
}

function safeFindingDisplayName(cwe: unknown, title: unknown): string | undefined {
  if (typeof cwe !== 'string' || !/^CWE-\d+$/.test(cwe) || typeof title !== 'string') return undefined;
  const normalizedTitle = [...title]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? ' ' : character;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalizedTitle.length === 0) return undefined;
  const prefix = `${cwe}: `;
  return `${prefix}${normalizedTitle.slice(0, 160 - prefix.length)}`;
}

function buildRule(finding: CapellaFinding): CapellaSarifRule {
  const cwe = finding.cwe as `CWE-${number}`;
  return {
    id: cwe,
    name: finding.title,
    shortDescription: { text: `${finding.cwe}: ${finding.title}` },
    fullDescription: { text: finding.description },
    helpUri: cweHelpUri(finding.cwe),
    properties: { cwe, tags: ['security', 'vulnerability'] },
  };
}

function buildResult(finding: CapellaFinding): CapellaSarifResult {
  const primary = parseCodePath(finding.code_paths[0] ?? '');
  if (!primary || !isNormalizedRepositoryPath(primary.file)) {
    throw new SastContractError('Capella export received an invalid primary finding location', 'SARIF_LOCATION');
  }
  const parsedTrace = finding.code_paths
    .map(parseCodePath)
    .filter((step): step is NonNullable<ReturnType<typeof parseCodePath>> => {
      return step !== undefined && isNormalizedRepositoryPath(step.file);
    });
  const sourceToSink = [...parsedTrace].reverse();
  const threadLocations = sourceToSink.map((step, index) => ({
    location: {
      physicalLocation: {
        artifactLocation: { uri: step.file, uriBaseId: '%SRCROOT%' as const },
        region: { startLine: step.line },
      },
      message: { text: threadLocationLabel(index, sourceToSink.length) },
    },
    importance: index === sourceToSink.length - 1 ? ('essential' as const) : ('important' as const),
  }));
  const severity = severityName(finding.severity);
  const cwe = finding.cwe as `CWE-${number}`;
  return {
    ruleId: cwe,
    level: severityLevel(finding.severity),
    message: { text: finding.title },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: primary.file, uriBaseId: '%SRCROOT%' },
          region: { startLine: primary.line },
        },
      },
    ],
    codeFlows: [{ threadFlows: [{ locations: threadLocations }] }],
    properties: {
      severity,
      cwe,
      status: 'verified',
      description: finding.impact ? `${finding.description}\n\nImpact: ${finding.impact}` : finding.description,
      findingSubType: 'AGENT_SAST',
    },
  };
}

export function buildCapellaSarif(findings: readonly CapellaFinding[], repositoryLabel: string): CapellaSarif {
  const ordered = [...findings].sort((left, right) => compareText(left.id, right.id));
  const rulesById = new Map<string, CapellaSarifRule>();
  for (const finding of ordered) {
    if (!rulesById.has(finding.cwe)) rulesById.set(finding.cwe, buildRule(finding));
  }
  const rules = [...rulesById.values()].sort((left, right) => compareText(left.id, right.id));
  const results = ordered.map(buildResult);
  return {
    $schema: CAPELLA_SARIF_SCHEMA,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: CAPELLA_SARIF_DRIVER_NAME,
            version: CAPELLA_SARIF_DRIVER_VERSION,
            informationUri: CAPELLA_SARIF_INFORMATION_URI,
            rules,
          },
        },
        results,
        properties: { repository: repositoryLabel, totalFindings: results.length },
      },
    ],
  };
}

/**
 * Read the immutable SARIF reference from a prior successful run, if any.
 *
 * A missing or unreadable run.json reads as no prior success, and the export
 * publishes fresh. A record that claims success but carries a bad reference
 * throws: that is corruption of an immutability promise, not a fresh run.
 */
async function readSuccessfulSarifRef(artifactRoot: string, expectedPath: string): Promise<SarifRef | undefined> {
  try {
    const run = JSON.parse(await readFile(resolve(artifactRoot, 'run.json'), 'utf8')) as Record<string, unknown>;
    if (run.finalState !== 'succeeded') return undefined;
    if (!run.sarif || typeof run.sarif !== 'object') {
      throw new SastContractError('A successful Capella run is missing its SARIF reference', 'SARIF_REFERENCE');
    }
    const sarif = run.sarif as Record<string, unknown>;
    if (sarif.path !== expectedPath || typeof sarif.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sarif.sha256)) {
      throw new SastContractError('A successful Capella run contains an invalid SARIF reference', 'SARIF_REFERENCE');
    }
    return { path: sarif.path, sha256: sarif.sha256 };
  } catch (error) {
    if (error instanceof SastContractError) throw error;
    return undefined;
  }
}

/** Revalidate, filter, report, serialize once, and atomically publish exact SARIF bytes. */
export async function exportCapellaFindings(
  rawFindings: readonly unknown[],
  options: CapellaExportOptions,
): Promise<CapellaExportResult> {
  throwIfExportCancelled(options.cancellationSignal);

  const warnings: string[] = [];
  const classified = rawFindings.map(classifyExportCandidate);
  const validFindings = classified.flatMap((entry) => ('finding' in entry ? [entry.finding] : []));
  const omissions = classified.flatMap((entry) => ('omission' in entry ? [entry.omission] : []));
  const invalidCount = omissions.length;
  if (invalidCount > 0) {
    const finding = invalidCount === 1 ? 'finding was' : 'findings were';
    warnings.push(`${invalidCount} agentic SAST ${finding} malformed and left out.`);
  }
  const reduction: AgenticSastReduction | undefined =
    invalidCount > 0
      ? {
          stage: 'export',
          reason: 'malformed_findings',
          omittedCount: invalidCount,
          consideredCount: rawFindings.length,
          omissions,
        }
      : undefined;

  const gated = validFindings.filter(passesExportGate);
  const exported = gated
    .filter((finding) => {
      const primary = parseCodePath(finding.code_paths[0] ?? '');
      return primary !== undefined && !isExcludedCodePath(primary.file, options.codePathAvoids);
    })
    .sort((left, right) => compareText(left.id, right.id));
  const excludedCount = gated.length - exported.length;
  if (excludedCount > 0) {
    warnings.push(`${excludedCount} agentic SAST findings were in paths your config told Shannon to avoid.`);
  }
  if (validFindings.length > 0 && exported.length === 0) {
    warnings.push(
      'Every agentic SAST finding was excluded, so no static-analysis results reached the pentest. Check the avoid rules in your config file.',
    );
  }

  const sarifDocument = buildCapellaSarif(exported, options.repositoryLabel);
  const validation = validateCapellaSarif(sarifDocument);
  if (!validation.valid) {
    throw new SastContractError('Capella SARIF document validation failed', 'SARIF_VALIDATION');
  }
  if (sarifDocument.runs[0].properties.totalFindings !== exported.length) {
    throw new SastContractError('Capella SARIF document count does not match exported findings', 'SARIF_COUNT');
  }

  const sarifBytes = stableJson(sarifDocument);
  const digest = sha256Bytes(sarifBytes);
  const reportPath = resolve(options.artifactRoot, 'report.md');
  const sarifPath = resolve(options.artifactRoot, 'capella.sarif');

  // Adoption path: once run.json says succeeded, the export is immutable. A
  // re-driven activity verifies the published bytes still match what this input
  // would produce and returns the existing reference instead of republishing.
  const successful = await readSuccessfulSarifRef(options.artifactRoot, sarifPath);
  if (successful) {
    let existingBytes: Buffer;
    try {
      existingBytes = await readFile(successful.path);
      await readFile(reportPath);
    } catch {
      throw new SastContractError('A successful Capella export is no longer complete and readable', 'SARIF_READ');
    }
    if (
      successful.path !== sarifPath ||
      successful.sha256 !== sha256Bytes(existingBytes) ||
      successful.sha256 !== digest
    ) {
      throw new SastContractError(
        'A successful Capella SARIF reference is immutable and no longer matches export bytes',
        'SARIF_IMMUTABLE',
      );
    }
    return {
      sarif: successful,
      findingCount: exported.length,
      // Coverage is 'reduced' only when records were invalid: gate-dropped and
      // operator-excluded findings are normal outcomes, not lost data.
      coverage: invalidCount > 0 ? 'reduced' : 'complete',
      warnings: [...warnings].sort(),
      reportPath,
      ...(reduction !== undefined && { reduction }),
    };
  }

  // Cancellation is re-checked immediately before each publish so an aborted
  // activity stops without writing new bytes.
  throwIfExportCancelled(options.cancellationSignal);
  await atomicPublishBytes(
    options.artifactRoot,
    reportPath,
    renderCapellaReport(validFindings, new Set(exported.map((finding) => finding.id)), options.repositoryLabel),
  );
  throwIfExportCancelled(options.cancellationSignal);
  const publishedDigest = await atomicPublishBytes(
    options.artifactRoot,
    sarifPath,
    sarifBytes,
    options.publishOptions ?? {},
  );
  if (publishedDigest !== digest) {
    throw new SastContractError('Published Capella SARIF bytes changed before hashing', 'SARIF_DIGEST');
  }

  return {
    sarif: { path: sarifPath, sha256: publishedDigest },
    findingCount: exported.length,
    coverage: invalidCount > 0 ? 'reduced' : 'complete',
    warnings: [...warnings].sort(),
    reportPath,
    ...(reduction !== undefined && { reduction }),
  };
}
