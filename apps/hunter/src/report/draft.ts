/**
 * HackerOne report draft generator.
 *
 * Produces a Markdown draft in HackerOne's conventional report shape. This
 * is always a draft: it is written to local disk only, is clearly banner-
 * marked as unsubmitted, and nothing in this package ever calls the
 * HackerOne API to submit it. Submission stays a manual, human action.
 *
 * Only a finding that has already passed the full validation chain
 * (candidate -> ... -> report_ready) can produce a draft — see
 * findings/lifecycle.ts. The draft is refused otherwise.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { type EvidenceEntry, err, type Finding, type ImpactLevel, ok, type Result } from '../types.js';

export function draftFilePath(workspaceDir: string, engagementId: string, findingId: string): string {
  return join(workspaceDir, 'engagements', engagementId, 'reports', `${findingId}.md`);
}

function impactFromConfidence(confidence: number): ImpactLevel {
  if (confidence >= 0.85) return 'critical';
  if (confidence >= 0.65) return 'high';
  if (confidence >= 0.4) return 'medium';
  return 'low';
}

export interface DraftOptions {
  readonly impact: ImpactLevel;
  readonly technicalDetails: string;
  readonly remediation: string;
}

function defaultDraftOptions(finding: Finding): DraftOptions {
  return {
    impact: impactFromConfidence(finding.confidence),
    technicalDetails: `The controller followed the full validation chain (${finding.transitionLog
      .map((t) => t.status)
      .join(
        ' -> ',
      )}) before drafting this report; see the transition log and evidence entries below for the reasoning at each step.`,
    remediation:
      '_Fill in during human review: the concrete fix (input validation, authorization check, configuration change, etc.)._',
  };
}

export function generateHackerOneDraft(
  finding: Finding,
  evidence: readonly EvidenceEntry[],
  options?: Partial<DraftOptions>,
): Result<string, string> {
  if (finding.status !== 'report_ready') {
    return err(
      `finding "${finding.id}" is in status "${finding.status}"; only a "report_ready" finding can produce a report draft`,
    );
  }

  const resolved = { ...defaultDraftOptions(finding), ...options };

  const steps =
    evidence.length > 0
      ? evidence.map((entry, index) => `${index + 1}. ${entry.description} (source: ${entry.source})`).join('\n')
      : '_No evidence recorded yet — do not submit until reproduction steps are documented._';

  const transitionHistory = finding.transitionLog.map((t) => `- \`${t.status}\` at ${t.at}: ${t.reason}`).join('\n');

  const draft = `# ${finding.title}

> **DRAFT — NOT SUBMITTED.** Generated locally from Shannon findings and
> engagement evidence. Requires human review, and manual confirmation of
> scope/impact/reproduction, before it is ever submitted to HackerOne.

## Severity (self-assessed — confirm during human review)

${resolved.impact}

## Summary

${finding.title} was observed on \`${finding.assetRef}\`, classified as **${finding.vulnClass}**, with a
controller-assessed confidence of ${(finding.confidence * 100).toFixed(0)}%. This confidence is a local heuristic,
not a HackerOne severity rating — set the actual severity during human review.

## Vulnerability Type

${finding.vulnClass}

## Affected Asset

${finding.assetRef}

## Technical Details

${resolved.technicalDetails}

## Steps to Reproduce

${steps}

## Impact

_Fill in during human review: what does an attacker gain, and under what conditions?_

## Remediation

${resolved.remediation}

## Validation History

${transitionHistory}

## Supporting Material

Evidence entries: ${evidence.map((entry) => entry.id).join(', ') || 'none recorded yet'}
`;

  return ok(draft);
}

export async function writeDraft(
  workspaceDir: string,
  finding: Finding,
  evidence: readonly EvidenceEntry[],
  options?: Partial<DraftOptions>,
): Promise<Result<string, string>> {
  const generated = generateHackerOneDraft(finding, evidence, options);
  if (!generated.ok) {
    return generated;
  }
  const filePath = draftFilePath(workspaceDir, finding.engagementId, finding.id);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, generated.value, 'utf8');
  return ok(filePath);
}
