import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { canAccessReport } from '@/lib/reports/access-control';
import { buildReportData } from '@/lib/reports/generator';
import { renderToPdf, getPdfContentType } from '@/lib/reports/exporters/pdf';
import { renderToHtml, getHtmlContentType } from '@/lib/reports/exporters/html';
import { renderToJsonString, getJsonContentType } from '@/lib/reports/exporters/json';
import { generateDownloadFilename } from '@/lib/reports/storage';
import type { ReportType } from '@prisma/client';

type ExportFormat = 'pdf' | 'html' | 'json';

/**
 * GET /api/reports/[reportId]/export/[format] - Export report in specified format
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string; format: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { reportId, format } = await params;

    // Validate format
    const validFormats: ExportFormat[] = ['pdf', 'html', 'json'];
    if (!validFormats.includes(format as ExportFormat)) {
      return NextResponse.json(
        { error: 'Invalid export format. Supported formats: pdf, html, json' },
        { status: 400 }
      );
    }

    // Check access
    const access = await canAccessReport(reportId, 'EXPORT_REPORT');
    if (!access.allowed || !access.report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    const report = access.report;

    // Check report is completed
    if (report.status !== 'COMPLETED') {
      return NextResponse.json(
        { error: 'Report is not ready for export', code: 'REPORT_NOT_READY' },
        { status: 400 }
      );
    }

    // Build report data
    const reportData = await buildReportData(reportId);
    if (!reportData) {
      return NextResponse.json(
        { error: 'Failed to build report data' },
        { status: 500 }
      );
    }

    // Log access
    const user = await getCurrentUser();
    if (user) {
      await db.reportAccessLog.create({
        data: {
          reportId,
          accessedById: user.id,
          accessType: `download_${format}`,
          ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
          userAgent: request.headers.get('user-agent'),
        },
      });
    }

    // Generate export based on format
    const filename = generateDownloadFilename(report.title, format as ExportFormat);

    switch (format as ExportFormat) {
      case 'pdf': {
        const pdfBuffer = await renderToPdf(reportData, report.type as ReportType);
        // Convert Buffer to Uint8Array for NextResponse compatibility
        const pdfData = new Uint8Array(pdfBuffer);
        return new NextResponse(pdfData, {
          headers: {
            'Content-Type': getPdfContentType(),
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': pdfBuffer.length.toString(),
          },
        });
      }

      case 'html': {
        const html = renderToHtml(reportData);
        return new NextResponse(html, {
          headers: {
            'Content-Type': getHtmlContentType(),
            'Content-Disposition': `attachment; filename="${filename}"`,
          },
        });
      }

      case 'json': {
        const json = renderToJsonString(reportData);
        return new NextResponse(json, {
          headers: {
            'Content-Type': getJsonContentType(),
            'Content-Disposition': `attachment; filename="${filename}"`,
          },
        });
      }

      default:
        return NextResponse.json({ error: 'Unsupported format' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error exporting report:', error);
    return NextResponse.json(
      { error: 'Failed to export report', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
