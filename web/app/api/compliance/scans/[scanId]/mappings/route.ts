/**
 * GET /api/compliance/scans/[scanId]/mappings - Get compliance mappings for a scan
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { getScanComplianceView, getScanMappings } from '@/lib/compliance';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { scanId } = await params;
    const { searchParams } = new URL(request.url);
    const frameworkId = searchParams.get('frameworkId');
    const view = searchParams.get('view') || 'detailed'; // 'detailed' or 'flat'

    // Get current user's org
    const user = await getCurrentUser();
    if (!user || user.memberships.length === 0) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgId = user.memberships[0].organizationId;

    // Verify scan exists and belongs to user's org
    const scan = await db.scan.findFirst({
      where: {
        id: scanId,
        organizationId: orgId,
      },
      select: { id: true },
    });

    if (!scan) {
      return NextResponse.json(
        { error: 'Scan not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    if (view === 'flat') {
      // Return flat list of findings with their mappings
      const mappings = await getScanMappings(
        scanId,
        frameworkId || undefined
      );
      return NextResponse.json({ scanId, mappings });
    } else {
      // Return detailed compliance view grouped by framework/category
      const frameworkIds = frameworkId ? [frameworkId] : undefined;
      const complianceView = await getScanComplianceView(scanId, frameworkIds);
      return NextResponse.json(complianceView);
    }
  } catch (error) {
    console.error('Error getting scan mappings:', error);
    return NextResponse.json(
      { error: 'Failed to get scan mappings', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
