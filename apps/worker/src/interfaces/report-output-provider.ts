/**
 * ReportOutputProvider — injectable interface for emitting an optional
 * additional artifact alongside the assembled markdown report.
 *
 * Runs after the report agent has finalized
 * `comprehensive_security_assessment_report.md`. Consumers can override to
 * produce derived outputs; the default no-op produces nothing.
 */

import type { ActivityInput } from '../temporal/activities.js';
import type { ActivityLogger } from '../types/activity-logger.js';

export interface ReportOutputProvider {
  generate(input: ActivityInput, logger: ActivityLogger): Promise<{ outputPath?: string }>;
}

/** Default no-op implementation — no additional output produced. */
export class NoOpReportOutputProvider implements ReportOutputProvider {
  async generate(): Promise<{ outputPath?: string }> {
    return {};
  }
}
