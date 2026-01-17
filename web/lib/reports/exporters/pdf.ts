/**
 * PDF exporter using @react-pdf/renderer.
 * Renders report templates to PDF buffer.
 */

import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { ExecutiveReport, TechnicalReport, ComplianceReport } from '../templates';
import type { ReportData } from '../templates/types';

export type PdfTemplate = 'EXECUTIVE' | 'TECHNICAL' | 'COMPLIANCE' | 'CUSTOM';

/**
 * Render a report to PDF buffer.
 *
 * @param data - Report data for template rendering
 * @param template - Template type to use
 * @returns PDF buffer
 */
export async function renderToPdf(
  data: ReportData,
  template: PdfTemplate = 'EXECUTIVE'
): Promise<Buffer> {
  let element: React.ReactElement;

  switch (template) {
    case 'TECHNICAL':
      element = React.createElement(TechnicalReport, { data });
      break;
    case 'COMPLIANCE':
      element = React.createElement(ComplianceReport, { data });
      break;
    case 'EXECUTIVE':
    case 'CUSTOM':
    default:
      // Custom templates use Executive as base for now
      // Will be enhanced in Phase 8 (User Story 6)
      element = React.createElement(ExecutiveReport, { data });
      break;
  }

  const buffer = await renderToBuffer(element);
  return Buffer.from(buffer);
}

/**
 * Get content type for PDF export.
 */
export function getPdfContentType(): string {
  return 'application/pdf';
}

/**
 * Get file extension for PDF export.
 */
export function getPdfExtension(): string {
  return 'pdf';
}
