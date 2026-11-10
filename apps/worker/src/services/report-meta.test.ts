import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCanonicalReportMeta, reportMetaIsComplete } from './report-meta.js';

const VALID_REPORT_META = {
  target: 'https://example.test',
  assessment_date: '2026-11-09',
  scope: 'Injection, XSS',
  executive_summary: 'The assessment found issues that require review.',
};

test('accepts complete report metadata', () => {
  assert.equal(reportMetaIsComplete(VALID_REPORT_META), true);
});

test('rejects whitespace-only executive summaries', () => {
  assert.equal(reportMetaIsComplete({ ...VALID_REPORT_META, executive_summary: ' \t\n' }), false);
});

test('requires complete metadata before applying workflow-owned report values', () => {
  assert.throws(
    () =>
      createCanonicalReportMeta(undefined, {
        target: 'https://app.example.test',
        assessmentDate: '2026-11-09',
        scope: 'XSS',
        exploit: false,
      }),
    /complete report metadata/,
  );
});

test('preserves the agent summary while canonicalizing workflow-owned report values', () => {
  const reportMeta = createCanonicalReportMeta(
    { ...VALID_REPORT_META, target: 'https://wrong.test', assessment_date: '2020-01-01', scope: 'Wrong scope' },
    {
      target: 'https://app.example.test',
      assessmentDate: '2026-11-09',
      scope: 'Injection, XSS',
      exploit: true,
      model: 'custom:deepseek',
    },
  );

  assert.deepEqual(reportMeta, {
    target: 'https://app.example.test',
    assessment_date: '2026-11-09',
    scope: 'Injection, XSS',
    executive_summary: VALID_REPORT_META.executive_summary,
    exploit: true,
    model: 'custom:deepseek',
  });
});
