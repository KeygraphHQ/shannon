// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { AuditSession } from '../src/audit/index.js';
import { generateSessionJsonPath } from '../src/audit/utils.js';
import type { AddExploitInput, ExploitAuditDocument } from '../src/collectors/exploit-collector.js';
import {
  assertExploitComplete,
  assertPreReconComplete,
  assertReconComplete,
  assertVulnAnalysisComplete,
} from '../src/services/completion-gates.js';
import { PentestError } from '../src/services/error-handling.js';
import { renderExploitDeliverable } from '../src/services/exploit-renderer.js';
import { renderFindingsFromQueues } from '../src/services/findings-renderer.js';
import { loadPrompt } from '../src/services/prompt-manager.js';
import {
  assertReportComplete,
  buildReportExpectations,
  fingerprintReportConfig,
  validateReportStructure,
} from '../src/services/report-validation.js';
import { AGENT_VALIDATORS } from '../src/session-manager.js';
import type { ActivityLogger } from '../src/types/activity-logger.js';
import { ErrorCode } from '../src/types/errors.js';

const logger: ActivityLogger = { info() {}, warn() {}, error() {} };

function queueEntry(
  id: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  confidence: 'low' | 'medium' | 'high',
) {
  return {
    ID: id,
    vulnerability_type: 'SQL injection',
    externally_exploitable: true,
    severity,
    confidence,
  };
}

function exploited(id: string): AddExploitInput {
  return {
    status: 'exploited',
    vulnerability_id: id,
    title: 'Demonstrated injection',
    vulnerable_location: 'GET /items',
    overview: 'The fixture demonstrated impact.',
    severity: 'high',
    impact: 'Fixture data was read.',
    exploitation_steps: ['Send the fixture request.'],
    proof_of_impact: 'The fixture returned protected data.',
  };
}

function blocked(id: string): AddExploitInput {
  return {
    status: 'blocked',
    vulnerability_id: id,
    title: 'Code-backed injection blocked by WAF',
    vulnerable_location: 'GET /search',
    overview: 'The source-to-sink path is vulnerable but live payloads were blocked.',
    confidence: 'high',
    current_blocker: 'The WAF rejected every bypass payload.',
    potential_impact: 'Database reads would be possible without the blocker.',
    evidence_of_vulnerability: 'Code tracing proves unsanitized query construction.',
    what_we_tried: 'Boolean, union, encoding, and fragmentation bypasses.',
    how_this_would_be_exploited: ['If the WAF were removed, send the union payload.'],
    expected_impact: 'Read protected rows.',
  };
}

function falsePositive(id: string): AddExploitInput {
  return {
    status: 'false_positive',
    vulnerability_id: id,
    title: 'Disproved candidate',
    vulnerable_location: 'GET /safe',
    overview: 'The queued path was not reachable.',
    confidence: 'high',
    evidence: 'Every route reaches a parameterized query.',
    what_we_tried: 'Traced and exercised all reachable branches.',
    conclusion: 'The analysis hypothesis used an unreachable sink.',
  };
}

function outOfScope(id: string): AddExploitInput {
  return {
    status: 'out_of_scope',
    vulnerability_id: id,
    title: 'Local-only candidate',
    vulnerable_location: 'scripts/admin.ts',
    overview: 'The path is not network reachable.',
    evidence: 'Only a local CLI invokes the code.',
    scope_reason: 'Locally executable utilities are outside the authorized network surface.',
  };
}

test('collector completion gates fail closed and exploit gaps are nonretryable', () => {
  assert.throws(
    () =>
      assertPreReconComplete({
        set_executive_summary: 'called',
        set_application_intelligence: 'called',
        set_auth_deep_dive: 'called',
        set_codebase_indexing: 'called',
        set_critical_file_paths: 'called',
        set_xss_sinks: 'called',
        set_ssrf_sinks: 'skipped',
      }),
    (error) => error instanceof PentestError && error.code === ErrorCode.OUTPUT_VALIDATION_FAILED && error.retryable,
  );

  assert.throws(
    () =>
      assertReconComplete({
        set_executive_summary: 'called',
        set_technology_stack: 'called',
        set_authentication: 'called',
        add_endpoints: { calls: 1, endpoints_seen: 0 },
        set_input_vectors: 'called',
        set_network_map: 'called',
        set_role_architecture: 'called',
        set_authz_candidates: 'called',
        set_injection_sources: 'called',
      }),
    PentestError,
  );

  assert.throws(
    () =>
      assertVulnAnalysisComplete('injection', {
        set_findings_summary: 'called',
        set_strategic_intelligence: 'called',
        set_safe_vectors: 'called',
        set_blind_spots: 'skipped',
      }),
    PentestError,
  );

  assert.throws(
    () => assertExploitComplete('injection', new Set(['INJ-VULN-1', 'INJ-VULN-2']), [exploited('INJ-VULN-1')]),
    (error) => error instanceof PentestError && error.code === ErrorCode.AGENT_EXECUTION_FAILED && !error.retryable,
  );
});

test('report expectations apply both thresholds and retain only reportable verdicts', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'shannon-report-gate-'));
  try {
    const entries = [
      queueEntry('INJ-VULN-1', 'high', 'high'),
      queueEntry('INJ-VULN-2', 'high', 'low'),
      queueEntry('INJ-VULN-3', 'high', 'high'),
      queueEntry('INJ-VULN-4', 'low', 'high'),
      queueEntry('INJ-VULN-5', 'critical', 'high'),
      queueEntry('INJ-VULN-6', 'critical', 'high'),
    ];
    await writeFile(path.join(dir, 'injection_exploitation_queue.json'), JSON.stringify({ vulnerabilities: entries }));
    const audit: ExploitAuditDocument = {
      schema_version: 1,
      vulnerability_class: 'injection',
      queue_ids: entries.map((entry) => entry.ID),
      verdicts: [
        exploited('INJ-VULN-1'),
        exploited('INJ-VULN-2'),
        blocked('INJ-VULN-3'),
        blocked('INJ-VULN-4'),
        falsePositive('INJ-VULN-5'),
        outOfScope('INJ-VULN-6'),
      ],
    };
    await writeFile(path.join(dir, 'injection_exploitation_audit.json'), JSON.stringify(audit));
    await writeFile(
      path.join(dir, 'comprehensive_security_assessment_report.md'),
      '# Injection Exploitation Evidence\n',
    );

    const expectations = await buildReportExpectations(dir, ['injection'], true, {
      min_severity: 'high',
      min_confidence: 'high',
    });
    assert.deepEqual(
      expectations.candidates.map((finding) => finding.id),
      ['INJ-VULN-1', 'INJ-VULN-3'],
    );
    assert.deepEqual(expectations.threshold_excluded_ids, ['INJ-VULN-2', 'INJ-VULN-4']);
    assert.deepEqual(expectations.audit_only_ids, ['INJ-VULN-5', 'INJ-VULN-6']);

    const report = [
      '# Security Assessment Report',
      '',
      '## Executive Summary',
      'Two reportable fixture findings.',
      '',
      '# Injection Exploitation Evidence',
      '',
      '## Successfully Exploited Vulnerabilities',
      '### INJ-VULN-1: Demonstrated injection',
      'Evidence.',
      '',
      '## Potential Vulnerabilities (Validation Blocked)',
      '### INJ-VULN-3: Code-backed injection blocked by WAF',
      'Evidence.',
      '',
    ].join('\r\n');
    assert.deepEqual(validateReportStructure(report), []);
    assert.doesNotThrow(() => assertReportComplete(report, expectations, []));
    assert.throws(
      () => assertReportComplete(`${report}\r\n### INJ-VULN-1: Duplicate\r\n`, expectations, []),
      PentestError,
    );
    assert.throws(
      () => assertReportComplete(report.replace('### INJ-VULN-3', '### INJ-VULN-5'), expectations, []),
      PentestError,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('guidance exclusions are structured and partial reports disclose unassessed classes', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'shannon-report-guidance-'));
  try {
    const entry = queueEntry('INJ-VULN-1', 'high', 'high');
    await writeFile(path.join(dir, 'injection_exploitation_queue.json'), JSON.stringify({ vulnerabilities: [entry] }));
    const audit: ExploitAuditDocument = {
      schema_version: 1,
      vulnerability_class: 'injection',
      queue_ids: [entry.ID],
      verdicts: [exploited(entry.ID)],
    };
    await writeFile(path.join(dir, 'injection_exploitation_audit.json'), JSON.stringify(audit));
    await writeFile(
      path.join(dir, 'comprehensive_security_assessment_report.md'),
      '# Injection Exploitation Evidence\n',
    );
    const expectations = await buildReportExpectations(
      dir,
      ['injection'],
      true,
      { guidance: 'Omit the fixture finding.' },
      ['ssrf'],
    );
    const report = [
      '# Security Assessment Report',
      '',
      '## Executive Summary',
      'This is a partial fixture assessment.',
      '- Unassessed classes: ssrf',
      '',
      '# Injection Exploitation Evidence',
      '',
    ].join('\n');
    assert.doesNotThrow(() =>
      assertReportComplete(report, expectations, [
        { vulnerability_id: 'INJ-VULN-1', reason: 'The configured guidance excludes the fixture.' },
      ]),
    );
    assert.throws(() => assertReportComplete(report, expectations, []), PentestError);
    assert.throws(
      () => assertReportComplete(report.replace('- Unassessed classes: ssrf\n', ''), expectations, []),
      PentestError,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('analysis-only severity and confidence filters are deterministic', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'shannon-report-analysis-'));
  try {
    await writeFile(
      path.join(dir, 'injection_exploitation_queue.json'),
      JSON.stringify({ vulnerabilities: [queueEntry('INJ-VULN-LOW', 'low', 'high')] }),
    );
    await writeFile(path.join(dir, 'comprehensive_security_assessment_report.md'), '# Injection Findings\n');
    const expectations = await buildReportExpectations(dir, ['injection'], false, {
      min_severity: 'high',
      min_confidence: 'medium',
    });
    assert.deepEqual(expectations.candidates, []);
    assert.deepEqual(expectations.threshold_excluded_ids, ['INJ-VULN-LOW']);
    assert.deepEqual(expectations.section_headings, ['Injection Findings']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('missing source audit is nonretryable and invalid queue ratings fail vuln validation', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'shannon-report-source-'));
  try {
    await writeFile(
      path.join(dir, 'injection_exploitation_queue.json'),
      JSON.stringify({ vulnerabilities: [queueEntry('INJ-VULN-1', 'high', 'high')] }),
    );
    await writeFile(
      path.join(dir, 'comprehensive_security_assessment_report.md'),
      '# Injection Exploitation Evidence\n',
    );
    await assert.rejects(
      buildReportExpectations(dir, ['injection'], true, undefined),
      (error) => error instanceof PentestError && !error.retryable && error.code === ErrorCode.AGENT_EXECUTION_FAILED,
    );

    await writeFile(
      path.join(dir, 'injection_exploitation_queue.json'),
      JSON.stringify({
        vulnerabilities: [{ ...queueEntry('INJ-VULN-1', 'high', 'high'), confidence: 'med' }],
      }),
    );
    assert.equal(await AGENT_VALIDATORS['injection-vuln'](dir, logger), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('exploit sources expose both threshold ratings and empty queues keep exploitation headings', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'shannon-render-contract-'));
  try {
    const rendered = renderExploitDeliverable(
      'injection',
      [exploited('INJ-VULN-1'), blocked('INJ-VULN-2')],
      new Map([
        ['INJ-VULN-1', 'SQL injection'],
        ['INJ-VULN-2', 'SQL injection'],
      ]),
      new Map([
        ['INJ-VULN-1', { severity: 'high', confidence: 'low' }],
        ['INJ-VULN-2', { severity: 'medium', confidence: 'high' }],
      ]),
    );
    assert.match(rendered, /\*\*Demonstrated Severity:\*\* High/);
    assert.match(rendered, /\*\*Analysis Confidence:\*\* Low/);
    assert.match(rendered, /\*\*Theoretical Severity:\*\* Medium/);
    assert.match(rendered, /\*\*Exploit Confidence:\*\* High/);

    await writeFile(path.join(dir, 'xss_exploitation_queue.json'), JSON.stringify({ vulnerabilities: [] }));
    await renderFindingsFromQueues(dir, '.', logger, ['xss'], true);
    const emptyClass = await readFile(path.join(dir, 'xss_findings.md'), 'utf8');
    assert.match(emptyClass, /^# Cross-Site Scripting \(XSS\) Exploitation Evidence/m);
    assert.match(emptyClass, /^## Successfully Exploited Vulnerabilities/m);
    await writeFile(path.join(dir, 'comprehensive_security_assessment_report.md'), emptyClass);
    const expectations = await buildReportExpectations(dir, ['xss'], true, undefined);
    assert.deepEqual(expectations.section_headings, ['Cross-Site Scripting (XSS) Exploitation Evidence']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('analysis-only report prompt preserves analysis findings and summarizes the correct source section', async () => {
  const prompt = await loadPrompt(
    'report-executive',
    {
      webUrl: 'https://example.test',
      repoPath: '/fixture',
      AUTH_STATE_FILE: '/fixture/auth-state.json',
      vulnClasses: ['injection'],
      exploit: false,
    },
    null,
    false,
    logger,
    path.resolve(process.cwd(), 'prompts'),
  );
  assert.match(prompt, /Check for the "Injection Findings" section/);
  assert.match(prompt, /Preserve every reportable `exploited`, `blocked`, and analysis-phase vulnerability ID/);
  assert.doesNotMatch(prompt, /Check for the "Injection Exploitation Evidence" section/);
});

test('intentional exploit skips persist without fake attempts and report-filter fingerprints are stable', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'shannon-resume-contract-'));
  const sessionMetadata = {
    id: 'resume-contract',
    webUrl: 'https://example.test',
    repoPath: dir,
    outputPath: dir,
  };
  try {
    const audit = new AuditSession(sessionMetadata);
    await audit.initialize('workflow-resume-contract');
    await audit.markAgentSkipped('injection-exploit', 'exploit mode disabled');
    await audit.markAgentSkipped('injection-exploit', 'exploit mode disabled');
    const session = JSON.parse(await readFile(generateSessionJsonPath(sessionMetadata), 'utf8')) as {
      metrics: { agents: Record<string, { status: string; skipped?: boolean; attempts: unknown[] }> };
    };
    assert.equal(session.metrics.agents['injection-exploit']?.status, 'success');
    assert.equal(session.metrics.agents['injection-exploit']?.skipped, true);
    assert.deepEqual(session.metrics.agents['injection-exploit']?.attempts, []);

    assert.equal(
      fingerprintReportConfig({ min_severity: 'high', guidance: '  omit internal details  ' }),
      fingerprintReportConfig({ min_severity: 'high', guidance: 'omit internal details' }),
    );
    assert.notEqual(
      fingerprintReportConfig({ min_severity: 'high' }),
      fingerprintReportConfig({ min_severity: 'low' }),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
