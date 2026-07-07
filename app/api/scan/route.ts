import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/server-auth';
import { gatewayChat, visionContent, extractJson } from '@/lib/ai-gateway';
import { logEvent, errText } from '@/lib/hermes-events';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SCAN_INSTRUCTION = `You are a room-scanning assistant for a family with ADHD. Analyze the provided image and return a JSON summary of what you see.

Respond with ONLY this JSON, no markdown fences:
{
  "description": "<brief overall description>",
  "messLevel": "low" | "medium" | "high",
  "itemsOutOfPlace": <integer>,
  "primaryClutterType": "<string>",
  "quickWins": ["<single action item>"]
}`;

export async function POST(req: NextRequest) {
  if (!(await verifyAuth(req))) return unauthorized();

  const { image, room } = await req.json();

  if (!image) {
    return NextResponse.json({ error: 'image is required' }, { status: 400 });
  }

  const start = Date.now();
  try {
    const raw = await gatewayChat({
      model: 'google/gemini-2.0-flash-001',
      messages: [
        { role: 'system', content: SCAN_INSTRUCTION },
        {
          role: 'user',
          content: visionContent(image, room ? `Scan this room: ${room}` : 'Scan this room.'),
        },
      ],
      temperature: 0.3,
      maxTokens: 1024,
      jsonMode: true,
    });

    const parsed = extractJson(raw);
    await logEvent({
      event_type: 'ai.scan', status: 'ok', route: '/api/scan',
      model: 'gemini-2.0-flash-001', latencyMs: Date.now() - start,
      summary: room ? `Scanned room: ${room}` : 'Scanned room',
    });
    return NextResponse.json(parsed);
  } catch (err: unknown) {
    console.error('[scan]', err);
    await logEvent({
      event_type: 'ai.scan', status: 'error', route: '/api/scan',
      model: 'gemini-2.0-flash-001', latencyMs: Date.now() - start,
      summary: 'Room scan failed', error: errText(err),
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Scan failed' },
      { status: 500 },
    );
  }
}
