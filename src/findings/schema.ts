// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { z } from 'zod';

export const FindingInputSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  category: z.string().min(1),
  summary: z.string().min(1),
  evidence: z.string().min(1),
  impact: z.string().min(1),
  affected_endpoints: z.array(z.string()).default([]),
  status: z.enum(['exploited', 'blocked', 'unverified']),
  severity: z.enum(['Critical', 'High', 'Medium', 'Low', 'Info']),
  cwe: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  cvss_v31_vector: z.string().optional(),
  cvss_v40_vector: z.string().optional(),
  remediation: z.string().min(1),
  references: z.array(z.string()).optional(),
  compliance: z
    .object({
      owasp_top10_2021: z.array(z.string()).optional(),
      pci_dss_v4: z.array(z.string()).optional(),
      soc2_tsc: z.array(z.string()).optional(),
    })
    .optional(),
});

export const FindingsReportInputSchema = z.object({
  assessment_date: z.string().min(1),
  target: z.object({
    web_url: z.string().min(1),
    repo_path: z.string().min(1),
  }),
  findings: z.array(FindingInputSchema).default([]),
});

export type FindingsReportInputShape = z.infer<typeof FindingsReportInputSchema>;
