import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/server-auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!(await verifyAuth(req))) return unauthorized();

  const haUrl = process.env.HOME_ASSISTANT_URL;
  const token = process.env.HOME_ASSISTANT_TOKEN;

  if (!haUrl || !token) {
    return NextResponse.json({ error: 'HOME_ASSISTANT_URL and HOME_ASSISTANT_TOKEN are not configured' }, { status: 500 });
  }

  try {
    const res = await fetch(`${haUrl}/api/states`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Home Assistant returned ${res.status}` }, { status: res.status });
    }

    const states = (await res.json()) as Array<{ entity_id: string; attributes?: { friendly_name?: string } }>;
    const cameras = states
      .filter(s => s.entity_id.startsWith('camera.'))
      .map(s => ({ entityId: s.entity_id, name: s.attributes?.friendly_name ?? s.entity_id }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ cameras });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch camera list' },
      { status: 500 },
    );
  }
}
