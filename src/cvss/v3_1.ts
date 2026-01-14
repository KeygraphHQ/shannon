// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

export type Cvss31Severity = 'None' | 'Low' | 'Medium' | 'High' | 'Critical';

export interface Cvss31Score {
  score: number;
  severity: Cvss31Severity;
}

const ROUNDUP = (value: number): number => Math.ceil(value * 10) / 10;

const severityFromScore = (score: number): Cvss31Severity => {
  if (score === 0) return 'None';
  if (score <= 3.9) return 'Low';
  if (score <= 6.9) return 'Medium';
  if (score <= 8.9) return 'High';
  return 'Critical';
};

const METRIC_WEIGHTS = {
  AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
  AC: { L: 0.77, H: 0.44 },
  UI: { N: 0.85, R: 0.62 },
  S: { U: 'U', C: 'C' },
  C: { N: 0.0, L: 0.22, H: 0.56 },
  I: { N: 0.0, L: 0.22, H: 0.56 },
  A: { N: 0.0, L: 0.22, H: 0.56 },
} as const;

const PR_WEIGHTS = {
  U: { N: 0.85, L: 0.62, H: 0.27 },
  C: { N: 0.85, L: 0.68, H: 0.5 },
} as const;

const parseVector = (vector: string): Record<string, string> | null => {
  if (!vector.startsWith('CVSS:3.1/')) return null;
  const metrics = vector.replace('CVSS:3.1/', '').split('/');
  const map: Record<string, string> = {};
  for (const metric of metrics) {
    const [key, value] = metric.split(':');
    if (!key || !value) return null;
    map[key] = value;
  }
  return map;
};

export const scoreCvss31 = (vector: string): Cvss31Score | null => {
  const metrics = parseVector(vector.trim());
  if (!metrics) return null;

  const scope = metrics.S as keyof typeof PR_WEIGHTS | undefined;
  if (!scope || !(scope in PR_WEIGHTS)) return null;

  const av = METRIC_WEIGHTS.AV[metrics.AV as keyof typeof METRIC_WEIGHTS.AV];
  const ac = METRIC_WEIGHTS.AC[metrics.AC as keyof typeof METRIC_WEIGHTS.AC];
  const ui = METRIC_WEIGHTS.UI[metrics.UI as keyof typeof METRIC_WEIGHTS.UI];
  const pr = PR_WEIGHTS[scope][metrics.PR as keyof typeof PR_WEIGHTS['U']];
  const c = METRIC_WEIGHTS.C[metrics.C as keyof typeof METRIC_WEIGHTS.C];
  const i = METRIC_WEIGHTS.I[metrics.I as keyof typeof METRIC_WEIGHTS.I];
  const a = METRIC_WEIGHTS.A[metrics.A as keyof typeof METRIC_WEIGHTS.A];

  if ([av, ac, ui, pr, c, i, a].some((v) => v === undefined)) return null;

  const exploitability = 8.22 * av * ac * pr * ui;
  const impactSubScore = 1 - (1 - c) * (1 - i) * (1 - a);

  let impact = 0;
  if (scope === 'U') {
    impact = 6.42 * impactSubScore;
  } else {
    impact = 7.52 * (impactSubScore - 0.029) - 3.25 * Math.pow(impactSubScore - 0.02, 15);
  }

  const baseScore = impact <= 0
    ? 0
    : scope === 'U'
      ? Math.min(impact + exploitability, 10)
      : Math.min(1.08 * (impact + exploitability), 10);

  const score = ROUNDUP(baseScore);
  return { score, severity: severityFromScore(score) };
};
