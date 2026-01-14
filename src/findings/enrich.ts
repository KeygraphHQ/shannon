// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { scoreCvss31, scoreCvss40 } from '../cvss/index.js';
import { mapFindingToCompliance } from '../compliance/mappings.js';
import type { Finding, FindingCompliance, FindingsReport, FindingsReportInput } from './types.js';

const mergeCompliance = (
  computed: FindingCompliance,
  provided?: Partial<FindingCompliance>
): FindingCompliance => {
  const unique = (items: string[]): string[] => Array.from(new Set(items));
  return {
    owasp_top10_2021: unique([...(computed.owasp_top10_2021 || []), ...(provided?.owasp_top10_2021 || [])]),
    pci_dss_v4: unique([...(computed.pci_dss_v4 || []), ...(provided?.pci_dss_v4 || [])]),
    soc2_tsc: unique([...(computed.soc2_tsc || []), ...(provided?.soc2_tsc || [])]),
  };
};

export const enrichFindingsReport = (input: FindingsReportInput): FindingsReport => {
  const findings: Finding[] = input.findings.map((finding) => {
    const cvss31 = finding.cvss_v31_vector ? scoreCvss31(finding.cvss_v31_vector) : null;
    const cvss40 = finding.cvss_v40_vector ? scoreCvss40(finding.cvss_v40_vector) : null;
    const computedCompliance = mapFindingToCompliance(finding);

    return {
      ...finding,
      cvss_v31_score: cvss31?.score ?? null,
      cvss_v31_severity: cvss31?.severity ?? null,
      cvss_v40_score: cvss40?.score ?? null,
      cvss_v40_severity: cvss40?.severity ?? null,
      compliance: mergeCompliance(computedCompliance, finding.compliance),
    };
  });

  return {
    assessment_date: input.assessment_date,
    target: input.target,
    findings,
  };
};
