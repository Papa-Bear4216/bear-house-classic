import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/server-auth';
import { listPalace } from '@/lib/palace';

export const runtime = 'nodejs';

// Read-only view of a household's mind palace, grouped by room — powers a future
// "what Hermes remembers" UI and doubles as an inspection/monitoring surface.
export async function GET(req: NextRequest) {
  if (!(await verifyAuth(req))) return unauthorized();

  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  try {
    const palace = await listPalace(userId);
    return NextResponse.json({ palace });
  } catch (err: unknown) {
    console.error('[hermes/memory]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to read palace' },
      { status: 500 },
    );
  }
}
