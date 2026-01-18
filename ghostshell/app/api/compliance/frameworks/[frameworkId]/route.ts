/**
 * GET /api/compliance/frameworks/[frameworkId] - Get framework details
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getFramework } from '@/lib/compliance';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ frameworkId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { frameworkId } = await params;

    const framework = getFramework(frameworkId);
    if (!framework) {
      return NextResponse.json(
        { error: 'Framework not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json(framework);
  } catch (error) {
    console.error('Error getting framework:', error);
    return NextResponse.json(
      { error: 'Failed to get framework', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
