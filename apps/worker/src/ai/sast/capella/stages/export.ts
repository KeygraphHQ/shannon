// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { AgenticSastReduction } from '../../types.js';
import {
  loadArtifactRef,
  loadCompletedArtifact,
  recordStageCompletion,
  sha256Bytes,
  stageArtifactPath,
} from '../artifacts.js';
import { SastContractError } from '../errors.js';
import { exportCapellaFindings } from '../sarif-exporter.js';
import { type CompletedStage, type ExportStageInput, type ExportValue, ZERO_CAPELLA_USAGE } from '../types.js';
import { isExportValue, isRawFindingSetValue } from '../validation.js';
import { artifactLineage, buildStageFingerprint, completeStage, resolveStageIdentity } from './shared.js';

/**
 * A cached export envelope proves only that an export once completed. The SARIF and
 * report files live outside that envelope, so their presence and the SARIF digest are
 * re-verified before the cache is adopted; adopting a gutted artifact root would
 * report success with nothing on disk.
 */
async function verifyPublishedExport(input: ExportStageInput, value: ExportValue): Promise<void> {
  const expectedSarifPath = resolve(input.artifactRoot, 'capella.sarif');
  const expectedReportPath = resolve(input.artifactRoot, 'report.md');
  if (value.sarif.path !== expectedSarifPath || value.reportPath !== expectedReportPath) {
    throw new SastContractError('Cached Capella export references an unexpected path', 'SARIF_REFERENCE');
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(expectedSarifPath);
    await readFile(expectedReportPath);
  } catch {
    throw new SastContractError('Cached Capella export is incomplete', 'SARIF_READ');
  }
  if (sha256Bytes(bytes) !== value.sarif.sha256) {
    throw new SastContractError('Cached Capella SARIF digest mismatch', 'SARIF_DIGEST');
  }
}

// The findings source is all-or-nothing: an export with no source is the legitimate
// short circuit for a run with nothing to report, while a half-specified source is
// always a caller bug.
function assertExportSource(input: ExportStageInput): void {
  const hasArtifact = input.findingsArtifact !== undefined;
  const hasStage = input.findingsStage !== undefined;
  if (hasArtifact !== hasStage) {
    throw new SastContractError(
      'Capella export requires both a finding artifact and its source stage',
      'EXPORT_SOURCE',
    );
  }
  const hasFallbackReduction = input.fallbackReduction !== undefined;
  const hasFallbackFailure = input.fallbackFailure !== undefined;
  if (hasFallbackReduction !== hasFallbackFailure || input.fallbackReduction?.stage !== input.fallbackFailure?.stage) {
    throw new SastContractError(
      'Capella fallback export requires one matching reduction and original failure',
      'EXPORT_FALLBACK',
    );
  }
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  // Rethrowing the signal's own reason keeps a Temporal CancelledFailure's identity
  // intact through this boundary instead of degrading it into a generic abort.
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException('Capella export cancelled.', 'AbortError');
}

function exportCompletionReductions(
  value: ExportValue,
  fallbackReduction: ExportStageInput['fallbackReduction'],
): readonly AgenticSastReduction[] {
  const reductions: AgenticSastReduction[] = [];
  if (value.reduction !== undefined) reductions.push(value.reduction);
  reductions.push(...fallbackCompletionReductions(fallbackReduction));
  return reductions;
}

function fallbackCompletionReductions(
  fallbackReduction: ExportStageInput['fallbackReduction'],
): readonly AgenticSastReduction[] {
  return fallbackReduction === undefined ? [] : [fallbackReduction];
}

/** Export a prior finding set, or a valid empty set for a workflow short circuit. */
export async function runExportStage(
  input: ExportStageInput,
  cancellationSignal?: AbortSignal,
): Promise<CompletedStage<ExportValue>> {
  const startedAt = Date.now();
  throwIfCancelled(cancellationSignal);
  assertExportSource(input);
  const identity = await resolveStageIdentity(input);
  const sourceLineage = input.findingsArtifact ? artifactLineage(input.findingsArtifact) : null;
  const fingerprint = buildStageFingerprint('export', identity, 'deterministic Capella SARIF export', {
    sourceStage: input.findingsStage ?? null,
    findings: sourceLineage,
    repositoryLabel: input.repositoryLabel,
  });

  const completedPath = stageArtifactPath(input.artifactRoot, 'export');
  const cached = await loadCompletedArtifact(input.artifactRoot, completedPath, 'export', fingerprint, isExportValue);
  if (cached) {
    await verifyPublishedExport(input, cached.value);
    // Last checkpoint before the durable run-record write; a cancelled scan must not
    // re-record completion.
    throwIfCancelled(cancellationSignal);
    await recordStageCompletion(
      input,
      identity.runInputFingerprint,
      'export',
      cached.usage,
      cached.value.warnings,
      cached.value.sarif,
      exportCompletionReductions(cached.value, input.fallbackReduction),
    );
    return {
      status: 'completed',
      durationMs: Date.now() - startedAt,
      reused: true,
      usage: cached.usage,
      artifact: cached.ref,
      value: cached.value,
    };
  }

  let findings: readonly unknown[] = [];
  if (input.findingsArtifact && input.findingsStage) {
    const source = await loadArtifactRef(
      input.artifactRoot,
      input.findingsArtifact,
      input.findingsStage,
      isRawFindingSetValue,
    );
    findings = source.value.findings;
  }

  const exported = await exportCapellaFindings(findings, {
    artifactRoot: input.artifactRoot,
    repositoryLabel: input.repositoryLabel,
    codePathAvoids: input.codePathAvoids,
    ...(cancellationSignal && { cancellationSignal }),
  });
  // The exporter has written capella.sarif, but completion is not yet recorded.
  // Cancelling here leaves a reusable artifact without marking the stage complete.
  throwIfCancelled(cancellationSignal);
  const value: ExportValue = {
    sarif: exported.sarif,
    findingCount: exported.findingCount,
    coverage: exported.coverage,
    warnings: [...exported.warnings],
    reportPath: exported.reportPath,
    ...(exported.reduction !== undefined && { reduction: exported.reduction }),
  };
  const completed = await completeStage(
    input,
    'export',
    fingerprint,
    ZERO_CAPELLA_USAGE,
    value,
    identity,
    startedAt,
    value.warnings,
    value.sarif,
    fallbackCompletionReductions(input.fallbackReduction),
  );
  return completed;
}
