// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { FindingsReportInputSchema } from './schema.js';
import type { FindingsReportInput } from './types.js';

const extractJson = (raw: string): string => {
  const fenced = raw.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }

  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    return raw.slice(first, last + 1).trim();
  }

  throw new Error('No JSON payload found in LLM output');
};

export const parseFindingsReport = (raw: string): FindingsReportInput => {
  const jsonPayload = extractJson(raw);
  const parsed = JSON.parse(jsonPayload) as unknown;
  // Parse with Zod and cast to our type (Zod's optional inference differs from exactOptionalPropertyTypes)
  const validated = FindingsReportInputSchema.parse(parsed);
  return validated as unknown as FindingsReportInput;
};
