// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import type { ReportMeta } from './report-renderer.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Whether the fields required to render a customer-facing report are populated. */
export function reportMetaIsComplete(value: unknown): value is ReportMeta {
  if (!isRecord(value)) return false;
  return (
    typeof value.target === 'string' &&
    typeof value.assessment_date === 'string' &&
    typeof value.scope === 'string' &&
    typeof value.executive_summary === 'string' &&
    value.scope.trim() !== '' &&
    value.executive_summary.trim() !== ''
  );
}

/** Workflow fields that must remain authoritative in customer-facing output. */
export interface WorkflowReportMeta {
  readonly target: string;
  readonly assessmentDate: string;
  readonly scope: string;
  readonly exploit: boolean;
  readonly model?: string;
}

/**
 * Keeps workflow-derived fields authoritative while retaining the agent-authored summary.
 * Throws before checkpointing so the activity's bounded validation retry path can recover.
 */
export function createCanonicalReportMeta(value: unknown, workflow: WorkflowReportMeta): ReportMeta {
  if (!reportMetaIsComplete(value)) {
    throw new Error('Report agent did not record complete report metadata');
  }
  return {
    ...value,
    target: workflow.target,
    assessment_date: workflow.assessmentDate,
    scope: workflow.scope,
    exploit: workflow.exploit,
    ...(workflow.model !== undefined && { model: workflow.model }),
  };
}
