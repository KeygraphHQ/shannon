import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createEvidenceEntry } from '../evidence/store.js';
import { createFinding, transitionFinding } from '../findings/lifecycle.js';
import type { FindingStatus } from '../types.js';
import { draftFilePath, generateHackerOneDraft, writeDraft } from './draft.js';

function reportReadyFinding() {
  const candidate = createFinding({
    engagementId: 'e1',
    title: 'Reflected XSS in search',
    vulnClass: 'xss',
    assetRef: 'https://app.example.com/search',
    confidence: 0.8,
    observationIds: ['obs-1'],
    reason: 'selected as next-best investigation',
  });
  const steps: readonly FindingStatus[] = [
    'investigated',
    'reproduced',
    'independently_validated',
    'impact_demonstrated',
    'deduplicated',
    'report_ready',
  ];
  let current = candidate;
  for (const status of steps) {
    const result = transitionFinding(current, status, `advancing to ${status} for test setup`);
    if (!result.ok) throw new Error(result.error);
    current = result.value;
  }
  return current;
}

test('refuses to draft a report for a finding that is not report_ready', () => {
  const finding = createFinding({
    engagementId: 'e1',
    title: 'X',
    vulnClass: 'xss',
    assetRef: 'https://app.example.com',
    confidence: 0.5,
    observationIds: [],
    reason: 'test',
  });
  const result = generateHackerOneDraft(finding, []);
  assert.equal(result.ok, false);
});

test('generates a banner-marked draft with severity, steps, and validation history', () => {
  const finding = reportReadyFinding();
  const evidence = [
    createEvidenceEntry({
      engagementId: 'e1',
      findingId: finding.id,
      source: 'shannon',
      description: 'Payload reflected unencoded.',
    }),
  ];
  const result = generateHackerOneDraft(finding, evidence);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.match(result.value, /DRAFT — NOT SUBMITTED/);
    assert.match(result.value, /Payload reflected unencoded\./);
    assert.match(result.value, /## Severity/);
    assert.match(result.value, /## Remediation/);
    assert.match(result.value, /## Validation History/);
    assert.match(result.value, /`candidate` at/);
    assert.match(result.value, /`report_ready` at/);
  }
});

test('impact defaults to a confidence-derived severity but can be overridden', () => {
  const finding = reportReadyFinding();
  const high = generateHackerOneDraft(finding, []);
  assert.equal(high.ok, true);
  if (high.ok) assert.match(high.value, /## Severity[\s\S]*?\nhigh/);

  const overridden = generateHackerOneDraft(finding, [], { impact: 'critical' });
  assert.equal(overridden.ok, true);
  if (overridden.ok) assert.match(overridden.value, /## Severity[\s\S]*?\ncritical/);
});

test('writeDraft persists the draft to the expected path', async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), 'hunter-draft-test-'));
  try {
    const finding = reportReadyFinding();
    const result = await writeDraft(workspaceDir, finding, []);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value, draftFilePath(workspaceDir, finding.engagementId, finding.id));
      const content = await readFile(result.value, 'utf8');
      assert.match(content, /DRAFT — NOT SUBMITTED/);
    }
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});
