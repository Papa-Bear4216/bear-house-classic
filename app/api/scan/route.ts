import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!(await verifyAuth(req))) return unauthorized();

  const { image, room } = await req.json();

  if (!image) {
    return NextResponse.json(
      { error: 'image is required' },
      { status: 400 }
    );
  }

  const hermesUrl = process.env.HERMES_URL;
  const bridgeSecret = process.env.BRIDGE_SECRET;

  if (!hermesUrl || !bridgeSecret) {
    return NextResponse.json(
      { error: 'HERMES_URL or BRIDGE_SECRET not configured' },
      { status: 503 }
    );
  }

  const upstream = await fetch(`${hermesUrl}/scan`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-bridge-secret': bridgeSecret,
    },
    body: JSON.stringify({ image, room }),
  });

  const text = await upstream.text();

  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
}
