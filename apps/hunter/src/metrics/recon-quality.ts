/**
 * Measurable recon-quality metrics.
 *
 * Deliberately not a claim of "best in class" — a fixed set of numbers that
 * make it possible to compare one hunt (or one change to the recon/
 * reasoning heuristics) against another, systematically.
 */

import type { Finding, Hypothesis, ReconMetrics, WorldModel } from '../types.js';
import { crossSourceCorrelatedNodes, nodesByKind } from '../worldmodel/graph.js';

const VALIDATED_STATUSES = new Set(['impact_demonstrated', 'deduplicated', 'report_ready', 'reported']);

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(4));
}

export interface ReconMetricsInput {
  readonly worldModel: WorldModel;
  readonly hypotheses: readonly Hypothesis[];
  readonly findings: readonly Finding[];
  readonly huntStartedAt: string | undefined;
}

export function computeReconMetrics(input: ReconMetricsInput): ReconMetrics {
  const { worldModel, hypotheses, findings, huntStartedAt } = input;

  const assetLikeNodes = [...nodesByKind(worldModel, 'asset'), ...nodesByKind(worldModel, 'host')];
  const verifiedNodes = worldModel.nodes.filter((n) => n.verificationStatus === 'verified');

  let timeToFirstUsefulDiscoveryMs: number | undefined;
  if (huntStartedAt) {
    const startMs = new Date(huntStartedAt).getTime();
    const usefulNodeTimes = worldModel.nodes
      .filter((n) => n.provenance.some((p) => p.confidence >= 0.5))
      .map((n) => new Date(n.firstSeenAt).getTime())
      .filter((t) => Number.isFinite(t) && t >= startMs);
    if (usefulNodeTimes.length > 0) {
      timeToFirstUsefulDiscoveryMs = Math.min(...usefulNodeTimes) - startMs;
    }
  }

  return {
    uniqueAssetCount: assetLikeNodes.length,
    crossSourceCorrelatedAssetCount: crossSourceCorrelatedNodes(worldModel).filter(
      (n) => n.kind === 'asset' || n.kind === 'host',
    ).length,
    verificationRate:
      worldModel.nodes.length === 0 ? 0 : Number((verifiedNodes.length / worldModel.nodes.length).toFixed(4)),
    endpointCoverageCount: nodesByKind(worldModel, 'endpoint').length,
    averageHypothesisConfidence: average(hypotheses.map((h) => h.confidence)),
    validatedFindingRate:
      findings.length === 0
        ? 0
        : Number((findings.filter((f) => VALIDATED_STATUSES.has(f.status)).length / findings.length).toFixed(4)),
    evidenceCompletenessRate:
      findings.length === 0
        ? 0
        : Number((findings.filter((f) => f.evidenceIds.length > 0).length / findings.length).toFixed(4)),
    timeToFirstUsefulDiscoveryMs,
  };
}
