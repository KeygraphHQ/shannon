// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolveCiOptions,
  computeCiExitCode,
  getFindingsSummary,
  getCiStatusMessage,
  detectCiEnvironment,
} from '../index.js';
import type { Finding } from '../../findings/types.js';

const createFinding = (severity: string, id: string = 'F001'): Finding => ({
  id,
  title: 'Test Finding',
  category: 'Test',
  summary: 'Test summary',
  evidence: 'Test evidence',
  impact: 'Test impact',
  affected_endpoints: ['/test'],
  status: 'exploited',
  severity: severity as Finding['severity'],
  remediation: 'Test remediation',
  compliance: {
    owasp_top10_2021: [],
    pci_dss_v4: [],
    soc2_tsc: [],
  },
});

describe('CI Module', () => {
  describe('resolveCiOptions', () => {
    it('should use defaults when no config or CLI options', () => {
      const options = resolveCiOptions(undefined, {});
      expect(options.enabled).toBe(false);
      expect(options.platforms).toEqual(['github', 'gitlab']);
      expect(options.failOn).toBe('High');
    });

    it('should use config values when provided', () => {
      const options = resolveCiOptions(
        {
          enabled: true,
          platforms: ['github'],
          fail_on: 'Critical',
        },
        {}
      );
      expect(options.enabled).toBe(true);
      expect(options.platforms).toEqual(['github']);
      expect(options.failOn).toBe('Critical');
    });

    it('should prefer CLI options over config', () => {
      const options = resolveCiOptions(
        {
          enabled: false,
          platforms: ['gitlab'],
          fail_on: 'Low',
        },
        {
          enabled: true,
          platforms: ['github'],
          failOn: 'Critical',
        }
      );
      expect(options.enabled).toBe(true);
      expect(options.platforms).toEqual(['github']);
      expect(options.failOn).toBe('Critical');
    });

    it('should filter invalid platforms', () => {
      const options = resolveCiOptions(
        {
          platforms: ['github', 'invalid', 'gitlab'] as any,
        },
        {}
      );
      expect(options.platforms).toEqual(['github', 'gitlab']);
    });
  });

  describe('computeCiExitCode', () => {
    it('should return 0 for no findings', () => {
      expect(computeCiExitCode([], 'High')).toBe(0);
    });

    it('should return 0 for null findings', () => {
      expect(computeCiExitCode(null as any, 'High')).toBe(0);
    });

    it('should return 0 for undefined findings', () => {
      expect(computeCiExitCode(undefined as any, 'High')).toBe(0);
    });

    it('should return 1 when findings meet threshold', () => {
      const findings = [createFinding('High')];
      expect(computeCiExitCode(findings, 'High')).toBe(1);
    });

    it('should return 1 when findings exceed threshold', () => {
      const findings = [createFinding('Critical')];
      expect(computeCiExitCode(findings, 'High')).toBe(1);
    });

    it('should return 0 when findings are below threshold', () => {
      const findings = [createFinding('Low')];
      expect(computeCiExitCode(findings, 'High')).toBe(0);
    });

    it('should check all severity levels correctly', () => {
      const severities = ['Critical', 'High', 'Medium', 'Low', 'Info'];

      for (let i = 0; i < severities.length; i++) {
        const finding = [createFinding(severities[i]!)];

        // Should fail for same or higher threshold
        for (let j = i; j < severities.length; j++) {
          expect(computeCiExitCode(finding, severities[j] as any)).toBe(1);
        }

        // Should pass for lower threshold
        for (let j = 0; j < i; j++) {
          expect(computeCiExitCode(finding, severities[j] as any)).toBe(0);
        }
      }
    });

    it('should handle invalid finding severity gracefully', () => {
      const findings = [{ ...createFinding('High'), severity: 'Invalid' as any }];
      expect(computeCiExitCode(findings, 'High')).toBe(0);
    });

    it('should handle mixed severity findings', () => {
      const findings = [
        createFinding('Low', 'F001'),
        createFinding('Medium', 'F002'),
        createFinding('Critical', 'F003'),
      ];
      expect(computeCiExitCode(findings, 'High')).toBe(1);
      expect(computeCiExitCode(findings, 'Critical')).toBe(1);
    });
  });

  describe('getFindingsSummary', () => {
    it('should return zero counts for empty findings', () => {
      const summary = getFindingsSummary([]);
      expect(summary).toEqual({
        Critical: 0,
        High: 0,
        Medium: 0,
        Low: 0,
        Info: 0,
      });
    });

    it('should count findings by severity', () => {
      const findings = [
        createFinding('Critical', 'F001'),
        createFinding('High', 'F002'),
        createFinding('High', 'F003'),
        createFinding('Medium', 'F004'),
        createFinding('Low', 'F005'),
        createFinding('Info', 'F006'),
        createFinding('Info', 'F007'),
      ];

      const summary = getFindingsSummary(findings);
      expect(summary).toEqual({
        Critical: 1,
        High: 2,
        Medium: 1,
        Low: 1,
        Info: 2,
      });
    });

    it('should handle null findings', () => {
      const summary = getFindingsSummary(null as any);
      expect(summary.Critical).toBe(0);
    });
  });

  describe('getCiStatusMessage', () => {
    it('should generate status message for findings', () => {
      const findings = [
        createFinding('High', 'F001'),
        createFinding('Low', 'F002'),
      ];

      const message = getCiStatusMessage(findings, {
        enabled: true,
        platforms: ['github'],
        failOn: 'High',
        generateSarif: true,
        generateGitlabSast: true,
      });

      expect(message).toContain('Shannon Security Scan Results');
      expect(message).toContain('Total findings: 2');
      expect(message).toContain('High:     1');
      expect(message).toContain('Low:      1');
      expect(message).toContain('Fail threshold: High');
      expect(message).toContain('FAILED');
    });

    it('should show PASSED when no findings meet threshold', () => {
      const findings = [createFinding('Info', 'F001')];

      const message = getCiStatusMessage(findings, {
        enabled: true,
        platforms: ['github'],
        failOn: 'High',
        generateSarif: true,
        generateGitlabSast: true,
      });

      expect(message).toContain('PASSED');
    });
  });

  describe('detectCiEnvironment', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should detect GitHub Actions', () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_WORKFLOW = 'Test Workflow';

      const result = detectCiEnvironment();
      expect(result.detected).toBe(true);
      expect(result.platform).toBe('github');
      expect(result.details?.workflow).toBe('Test Workflow');
    });

    it('should detect GitLab CI', () => {
      delete process.env.GITHUB_ACTIONS;
      process.env.GITLAB_CI = 'true';
      process.env.CI_PIPELINE_ID = '12345';

      const result = detectCiEnvironment();
      expect(result.detected).toBe(true);
      expect(result.platform).toBe('gitlab');
      expect(result.details?.pipelineId).toBe('12345');
    });

    it('should detect generic CI', () => {
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITLAB_CI;
      process.env.CI = 'true';

      const result = detectCiEnvironment();
      expect(result.detected).toBe(true);
      expect(result.platform).toBe('other');
    });

    it('should return not detected when not in CI', () => {
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITLAB_CI;
      delete process.env.CI;
      delete process.env.CONTINUOUS_INTEGRATION;

      const result = detectCiEnvironment();
      expect(result.detected).toBe(false);
    });
  });
});
