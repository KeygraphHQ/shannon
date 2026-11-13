import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Check } from 'typebox/value';
import { createFindingCollector } from './finding-collector.js';

const REPORT_META = {
  target: 'https://example.test',
  assessment_date: '2026-11-09',
  scope: 'Injection, XSS',
  executive_summary: 'The assessment found issues that require review.',
};

test('collects report metadata through a native tool', async () => {
  const collector = createFindingCollector(true);
  const setReportMeta = collector.tools.find((tool) => tool.name === 'set_report_meta');

  assert.ok(setReportMeta, 'report agents need a native metadata tool');
  await setReportMeta.execute('test-call', REPORT_META, new AbortController().signal, undefined, {} as never);

  assert.deepEqual(collector.getReportMeta(), REPORT_META);
});

test('rejects whitespace-only report metadata at the tool boundary', () => {
  const collector = createFindingCollector(true);
  const setReportMeta = collector.tools.find((tool) => tool.name === 'set_report_meta');

  assert.ok(setReportMeta, 'report agents need a native metadata tool');
  assert.equal(Check(setReportMeta.parameters, { ...REPORT_META, executive_summary: ' \t\n' }), false);
});
