/**
 * GET /api/compliance/scans/[scanId]/scorecard - Get compliance scorecard for a scan
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { getScanScorecard, DEFAULT_FRAMEWORK_ID } from '@/lib/compliance';

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
    const frameworkId = searchParams.get('frameworkId') || DEFAULT_FRAMEWORK_ID;

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
      select: { id: true, status: true },
    });

    if (!scan) {
      return NextResponse.json(
        { error: 'Scan not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    if (scan.status !== 'COMPLETED') {
      return NextResponse.json(
        {
          error: 'Scan is not completed',
          code: 'SCAN_NOT_COMPLETED',
        },
        { status: 400 }
      );
    }

    const scorecard = await getScanScorecard(scanId, frameworkId);
    if (!scorecard) {
      return NextResponse.json(
        { error: 'Framework not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json(scorecard);
  } catch (error) {
    console.error('Error getting scan scorecard:', error);
    return NextResponse.json(
      { error: 'Failed to get scan scorecard', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
