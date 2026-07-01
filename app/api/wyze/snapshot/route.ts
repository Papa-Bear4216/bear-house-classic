import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/server-auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!(await verifyAuth(req))) return unauthorized();

  const haUrl = process.env.HOME_ASSISTANT_URL;
  const token = process.env.HOME_ASSISTANT_TOKEN;

  const cameraEntity = new URL(req.url).searchParams.get('entity');

  if (!cameraEntity) {
    return NextResponse.json({ error: 'Missing entity parameter' }, { status: 400 });
  }

  if (!haUrl || !token) {
    return NextResponse.json({ error: 'HOME_ASSISTANT_URL and HOME_ASSISTANT_TOKEN are not configured' }, { status: 500 });
  }

  try {
    const res = await fetch(`${haUrl}/api/camera_proxy/${cameraEntity}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Home Assistant returned ${res.status}` },
        { status: res.status },
      );
    }

    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return NextResponse.json({ image: `data:image/jpeg;base64,${base64}` });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch snapshot' },
      { status: 500 },
    );
  }
}
