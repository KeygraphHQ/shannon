// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

export type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';

export type FindingStatus = 'exploited' | 'blocked' | 'unverified';

export interface FindingCompliance {
  owasp_top10_2021: string[];
  pci_dss_v4: string[];
  soc2_tsc: string[];
}

export interface FindingInput {
  id: string;
  title: string;
  category: string;
  summary: string;
  evidence: string;
  impact: string;
  affected_endpoints: string[];
  status: FindingStatus;
  severity: Severity;
  cwe?: string[] | undefined;
  tags?: string[] | undefined;
  cvss_v31_vector?: string | undefined;
  cvss_v40_vector?: string | undefined;
  remediation: string;
  references?: string[] | undefined;
  compliance?: Partial<FindingCompliance> | undefined;
}

export interface Finding extends FindingInput {
  cvss_v31_score?: number | null;
  cvss_v31_severity?: string | null;
  cvss_v40_score?: number | null;
  cvss_v40_severity?: string | null;
  compliance: FindingCompliance;
}

export interface FindingsReportInput {
  assessment_date: string;
  target: {
    web_url: string;
    repo_path: string;
  };
  findings: FindingInput[];
}

export interface FindingsReport {
  assessment_date: string;
  target: {
    web_url: string;
    repo_path: string;
  };
  findings: Finding[];
}
