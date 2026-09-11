import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ingestShannonOutput, parseShannonReport } from './shannon-output.js';

const FIXTURE_PATH = fileURLToPath(new URL('../../fixtures/shannon-output/sample-report.json', import.meta.url));

function baseReportMeta() {
  return {
    target: 'https://app.example.com',
    assessment_date: '2026-01-01',
    scope: 'https://app.example.com',
    executive_summary: 'summary',
  };
}

test('parses the sample Shannon output fixture (real report.json shape)', async () => {
  const raw = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));
  const result = parseShannonReport(raw);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.findings.length, 2);
    assert.equal(result.value.report_meta.target, 'https://app.example.com');
  }
});

test('rejects a report with no "report_meta"', () => {
  const result = parseShannonReport({ findings: [] });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /report_meta/);
});

test('rejects a malformed report (not an object)', () => {
  const result = parseShannonReport('not-a-report');
  assert.equal(result.ok, false);
});

test('rejects a report whose "findings" is not an array', () => {
  const result = parseShannonReport({ report_meta: baseReportMeta(), findings: 'nope' });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /findings/);
});

test('rejects a finding missing required fields (e.g. no "finding_id")', () => {
  const result = parseShannonReport({
    report_meta: baseReportMeta(),
    findings: [{ title: 'x', category: 'XSS', owasp_category: 'A05', severity: 'high' }],
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /finding_id/);
});

test('rejects a finding with an invalid "category"', () => {
  const result = parseShannonReport({
    report_meta: baseReportMeta(),
    findings: [
      {
        finding_id: 'X-1',
        title: 'x',
        category: 'NotARealCategory',
        owasp_category: 'A05',
        severity: 'high',
        vulnerable_location: '/x',
        overview: 'o',
        impact: 'i',
        remediation: 'r',
      },
    ],
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /category/);
});

test('accepts an empty report (findings: []) — a clean scan is a valid report, not an error', () => {
  const result = parseShannonReport({ report_meta: baseReportMeta(), findings: [] });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value.findings, []);
});

test('tolerates unknown extra fields at both the top level and per-finding (report.json carries more than Hunter needs)', () => {
  const result = parseShannonReport({
    report_meta: { ...baseReportMeta(), unknown_meta_field: 'x' },
    findings: [
      {
        finding_id: 'MISC-01',
        title: 'x',
        category: 'Miscellaneous',
        owasp_category: 'A06:2025 — Insecure Design',
        severity: 'low',
        vulnerable_location: '/x',
        overview: 'o',
        impact: 'i',
        remediation: 'r',
        confidence: 'medium',
        code_locations: [{ file: 'a.ts', role: 'sink' }],
        sast_source_location: { file: 'a.ts', line: 1, column: 0, rule_id: 'CWE-79' },
        notes: [{ kind: 'prose', text: 'note' }],
      },
    ],
    unknown_top_level_field: 'x',
  });
  assert.equal(result.ok, true);
});

test('accepts a partial report carrying "not_assessed"', () => {
  const result = parseShannonReport({
    report_meta: { ...baseReportMeta(), coverage: { status: 'partial', limitations: [{ code: 'x', message: 'y' }] } },
    findings: [],
    not_assessed: ['ssrf'],
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.not_assessed, ['ssrf']);
    assert.equal(result.value.report_meta.coverage?.status, 'partial');
  }
});

test('rejects a finding with an invalid "status" value', () => {
  const result = parseShannonReport({
    report_meta: baseReportMeta(),
    findings: [
      {
        finding_id: 'XSS-01',
        title: 'x',
        category: 'XSS',
        owasp_category: 'A05:2025 — Injection',
        severity: 'high',
        vulnerable_location: '/x',
        overview: 'o',
        impact: 'i',
        remediation: 'r',
        status: 'not-a-real-status',
      },
    ],
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /status/);
});

test('ingestShannonOutput normalizes multiple findings into engagement-scoped observations', async () => {
  const raw = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));
  const parsed = parseShannonReport(raw);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const observations = ingestShannonOutput(parsed.value, 'engagement-1');
  assert.equal(observations.length, 2);
  assert.equal(observations[0]?.engagementId, 'engagement-1');
  assert.equal(observations[0]?.source, 'shannon');
  assert.equal(observations[0]?.vulnClass, 'xss');
  assert.equal(observations[0]?.verified, true, 'status: "exploited" is a verified, reproduced signal');
  assert.equal(observations[1]?.verified, false, 'an analysis-only finding is never verified merely by being reported');
});

test('ingestShannonOutput preserves the original finding as raw provenance', async () => {
  const raw = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));
  const parsed = parseShannonReport(raw);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const observations = ingestShannonOutput(parsed.value, 'engagement-1');
  assert.equal(observations[0]?.raw?.finding_id, parsed.value.findings[0]?.finding_id);
});

test('ingestShannonOutput never marks a finding verified from confidence/severity alone', () => {
  const report = parseShannonReport({
    report_meta: { ...baseReportMeta(), exploit: false },
    findings: [
      {
        finding_id: 'INJ-01',
        title: 'SQL injection candidate',
        category: 'Injection',
        owasp_category: 'A05:2025 — Injection',
        severity: 'critical',
        confidence: 'high',
        vulnerable_location: '/api/search',
        overview: 'o',
        impact: 'i',
        remediation: 'r',
      },
    ],
  });
  assert.equal(report.ok, true);
  if (!report.ok) return;
  const [observation] = ingestShannonOutput(report.value, 'e1');
  assert.equal(observation?.verified, false, 'critical severity + high confidence is still not a demonstrated exploit');
  assert.equal(observation?.vulnClass, 'injection');
});
