import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { canAccessReport, canDeleteReport } from '@/lib/reports/access-control';

/**
 * GET /api/reports/[reportId] - Get report details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { reportId } = await params;

    // Check access
    const access = await canAccessReport(reportId, 'VIEW_REPORT');
    if (!access.allowed || !access.report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    const report = access.report;

    // Log access
    const user = await getCurrentUser();
    if (user) {
      await db.reportAccessLog.create({
        data: {
          reportId,
          accessedById: user.id,
          accessType: 'view',
          ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
          userAgent: request.headers.get('user-agent'),
        },
      });
    }

    return NextResponse.json({
      id: report.id,
      scanId: report.scanId,
      type: report.type,
      status: report.status,
      title: report.title,
      generatedAt: report.generatedAt,
      generatedById: report.generatedById,
      findingsCount: report.findingsCount,
      criticalCount: report.criticalCount,
      highCount: report.highCount,
      mediumCount: report.mediumCount,
      lowCount: report.lowCount,
      riskScore: report.riskScore,
      frameworkIds: report.frameworkIds,
      createdAt: report.createdAt,
      scan: {
        id: report.scan.id,
        status: report.scan.status,
        project: {
          id: report.scan.project.id,
          name: report.scan.project.name,
          targetUrl: report.scan.project.targetUrl,
        },
      },
      organization: {
        id: report.organization.id,
        name: report.organization.name,
      },
    });
  } catch (error) {
    console.error('Error fetching report:', error);
    return NextResponse.json(
      { error: 'Failed to fetch report', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/reports/[reportId] - Soft delete a report (admin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { reportId } = await params;

    // Check delete permission
    const deleteCheck = await canDeleteReport(reportId);
    if (!deleteCheck.allowed) {
      if (deleteCheck.reason === 'Report not found') {
        return NextResponse.json({ error: 'Report not found' }, { status: 404 });
      }
      return NextResponse.json(
        { error: deleteCheck.reason || 'Permission denied' },
        { status: 403 }
      );
    }

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get report for audit log
    const report = await db.report.findUnique({
      where: { id: reportId },
      select: { title: true, organizationId: true, scanId: true },
    });

    // Soft delete the report
    await db.report.update({
      where: { id: reportId },
      data: {
        deletedAt: new Date(),
        deletedById: user.id,
      },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        organizationId: report!.organizationId,
        userId: user.id,
        action: 'report.deleted',
        resourceType: 'report',
        resourceId: reportId,
        metadata: {
          title: report!.title,
          scanId: report!.scanId,
        },
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
      },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error deleting report:', error);
    return NextResponse.json(
      { error: 'Failed to delete report', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
