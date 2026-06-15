import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/server-auth';
import { gatewayChat, visionContent, extractJson } from '@/lib/ai-gateway';

export const runtime = 'nodejs';
export const maxDuration = 30;

const RECEIPT_INSTRUCTION = `You are analyzing a grocery receipt or a photo of grocery items/food. Extract everything you can see.
If analyzing a photo of actual food/groceries (not a paper receipt), estimate reasonable quantities.

Respond with ONLY this JSON, no markdown fences:
{
  "storeName": "<string or null>",
  "total": <number>,
  "items": [
    {
      "name": "<string>",
      "quantity": <number>,
      "unit": "<string>",
      "category": "produce" | "meat" | "dairy" | "bakery" | "pantry" | "frozen" | "beverages" | "household" | "personal-care" | "other",
      "price": <number or null>
    }
  ]
}

Always return an "items" array, even if empty. Set storeName to null if no store is identifiable.`;

export async function POST(req: NextRequest) {
  if (!(await verifyAuth(req))) return unauthorized();

  try {
    const { image } = await req.json();

    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid image' }, { status: 400 });
    }

    const raw = await gatewayChat({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: RECEIPT_INSTRUCTION },
        {
          role: 'user',
          content: visionContent(image, 'Extract the items from this receipt or grocery photo.'),
        },
      ],
      temperature: 0.2,
      maxTokens: 2048,
      jsonMode: true,
    });

    const parsed = extractJson(raw) as { storeName?: string; total?: number; items?: unknown[] };
    return NextResponse.json({
      storeName: parsed.storeName ?? null,
      total: parsed.total ?? 0,
      items: parsed.items ?? [],
    });
  } catch (err: unknown) {
    console.error('scan-receipt error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error during receipt scan' },
      { status: 500 }
    );
  }
}
