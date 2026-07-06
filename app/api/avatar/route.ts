import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/server-auth';
import { generateImage } from '@/lib/google-image';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!(await verifyAuth(req))) return unauthorized();

  try {
    const { name, color } = await req.json();

    if (!name || typeof name !== 'string' || name.length > 100) {
      return NextResponse.json({ error: 'Missing or invalid name' }, { status: 400 });
    }
    if (typeof color !== 'string' || color.length > 50) {
      return NextResponse.json({ error: 'Invalid color' }, { status: 400 });
    }

    const colorLabel = color.replace('bg-', '').replace('-500', '').replace('-400', '');

    const prompt = `A cute 3D claymorphism-style character avatar icon for a person named "${name}". The character should have a soft, matte clay texture with smooth rounded shapes. Dominant color: ${colorLabel}. Composition: centered, isolated on a simple clean background, studio lighting, high resolution, 3D render, Pixar-style aesthetic, professional profile icon.`;

    const b64 = await generateImage(prompt);
    return NextResponse.json({ avatarUrl: `data:image/png;base64,${b64}` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isQuota = message.includes('429') || message.includes('quota') || message.includes('rate');
    console.error('avatar error:', message);
    return NextResponse.json({ error: message }, { status: isQuota ? 429 : 500 });
  }
}
