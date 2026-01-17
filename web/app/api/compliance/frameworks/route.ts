/**
 * GET /api/compliance/frameworks - List all compliance frameworks
 */

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getFrameworkSummaries } from '@/lib/compliance';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const frameworks = getFrameworkSummaries();

    return NextResponse.json({ frameworks });
  } catch (error) {
    console.error('Error listing frameworks:', error);
    return NextResponse.json(
      { error: 'Failed to list frameworks', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
