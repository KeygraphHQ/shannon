// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { CVSS40 } from './vendor/cvss40.js';

export type Cvss40Severity = 'None' | 'Low' | 'Medium' | 'High' | 'Critical';

export interface Cvss40Score {
  score: number;
  severity: Cvss40Severity;
}

// Type assertion for the vendor CVSS40 class which has score and severity properties
interface CVSS40Instance {
  score: number;
  severity: string;
}

export const scoreCvss40 = (vector: string): Cvss40Score | null => {
  try {
    const cvss = new CVSS40(vector.trim()) as unknown as CVSS40Instance;
    return {
      score: cvss.score,
      severity: cvss.severity as Cvss40Severity,
    };
  } catch {
    return null;
  }
};
