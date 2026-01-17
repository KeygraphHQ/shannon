import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getCurrentUser } from '@/lib/auth';
import {
  generateReport,
  listReports,
  buildReportData,
  completeReport,
  failReport,
} from '@/lib/reports/generator';
import { renderToPdf } from '@/lib/reports/exporters/pdf';
import { renderToHtml } from '@/lib/reports/exporters/html';
import { renderToJsonString } from '@/lib/reports/exporters/json';
import { hasReportPermission } from '@/lib/reports/access-control';
import { db } from '@/lib/db';
import { ReportType, ReportStatus } from '@prisma/client';

/**
 * GET /api/reports - List reports for organization
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getCurrentUser();
    if (!user || user.memberships.length === 0) {
      return NextResponse.json({ reports: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
    }

    const orgId = user.memberships[0].organizationId;

    // Check permission
    const canView = await hasReportPermission(orgId, 'VIEW_REPORT');
    if (!canView) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const scanId = searchParams.get('scanId') || undefined;
    const status = searchParams.get('status') as ReportStatus | undefined;
    const type = searchParams.get('type') as ReportType | undefined;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

    const result = await listReports(orgId, { scanId, status, type, page, limit });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error listing reports:', error);
    return NextResponse.json(
      { error: 'Failed to list reports', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/reports - Generate a new report
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getCurrentUser();
    if (!user || user.memberships.length === 0) {
      return NextResponse.json(
        { error: 'No organization found', code: 'NO_ORGANIZATION' },
        { status: 400 }
      );
    }

    const orgId = user.memberships[0].organizationId;

    // Check permission
    const canGenerate = await hasReportPermission(orgId, 'GENERATE_REPORT');
    if (!canGenerate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();
    const { scanId, type, title, templateId, frameworkIds } = body;

    // Validate required fields
    if (!scanId) {
      return NextResponse.json(
        { error: 'Scan ID is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    if (!type || !['EXECUTIVE', 'TECHNICAL', 'COMPLIANCE', 'CUSTOM'].includes(type)) {
      return NextResponse.json(
        { error: 'Valid report type is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    if (type === 'CUSTOM' && !templateId) {
      return NextResponse.json(
        { error: 'Template ID is required for custom reports', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    // Start report generation
    const result = await generateReport({
      scanId,
      organizationId: orgId,
      type: type as ReportType,
      title,
      templateId,
      frameworkIds,
      generatedById: user.id,
    });

    if (!result.success) {
      // Check if it's a rate limit error
      if (result.error?.includes('Concurrent generation limit')) {
        return NextResponse.json(
          { error: result.error, code: 'CONCURRENT_LIMIT' },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: result.error, code: 'GENERATION_ERROR' },
        { status: 400 }
      );
    }

    // Build report data and generate files
    const reportData = await buildReportData(result.reportId!);
    if (!reportData) {
      await failReport(result.reportId!, 'Failed to build report data');
      return NextResponse.json(
        { error: 'Failed to build report data', code: 'GENERATION_ERROR' },
        { status: 500 }
      );
    }

    try {
      // Generate PDF, HTML, and JSON (this could be async in a real production scenario)
      await renderToPdf(reportData, type as ReportType);
      renderToHtml(reportData);
      renderToJsonString(reportData);

      // Mark as completed
      await completeReport(result.reportId!);
    } catch (renderError) {
      console.error('Error rendering report:', renderError);
      await failReport(result.reportId!, 'Failed to render report files');
      return NextResponse.json(
        { error: 'Failed to render report', code: 'RENDER_ERROR' },
        { status: 500 }
      );
    }

    // Fetch completed report
    const report = await db.report.findUnique({
      where: { id: result.reportId },
      include: {
        scan: {
          select: {
            project: {
              select: { name: true },
            },
          },
        },
      },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        organizationId: orgId,
        userId: user.id,
        action: 'report.generated',
        resourceType: 'report',
        resourceId: result.reportId!,
        metadata: {
          type,
          scanId,
          title: report?.title,
        },
      },
    });

    return NextResponse.json(
      {
        id: report!.id,
        scanId: report!.scanId,
        type: report!.type,
        status: report!.status,
        title: report!.title,
        findingsCount: report!.findingsCount,
        criticalCount: report!.criticalCount,
        highCount: report!.highCount,
        mediumCount: report!.mediumCount,
        lowCount: report!.lowCount,
        riskScore: report!.riskScore,
        createdAt: report!.createdAt,
        generatedAt: report!.generatedAt,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error('Error generating report:', error);
    return NextResponse.json(
      { error: 'Failed to generate report', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
