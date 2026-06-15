import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/server-auth';
import { gatewayChat, visionContent, extractJson } from '@/lib/ai-gateway';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ALLOWED_MODELS: Record<string, string> = {
  'gemini-2.5-flash': 'google/gemini-2.5-flash',
  'gemini-2.5-pro': 'google/gemini-2.5-pro',
};

const SYSTEM_INSTRUCTION = `You are a room-scanning assistant for a family with ADHD parents and kids. You will receive a photo of a room.

OBJECT IDENTIFICATION RULES:
- Only list objects you can ACTUALLY SEE in the image. Do not invent items.
- Be specific: "blue cereal bowl on coffee table" not "dishes". Specificity reduces ADHD ambiguity-paralysis.
- If the room looks tidy, say so — return overallMessLevel "low" and 0-1 missions max. Do not manufacture work.

ADHD TASK DESIGN RULES (apply to every mission and chore):
1. ONE concrete first step. The "firstStep" field must name a single visible object to pick up FIRST — e.g. "Grab the red sock by the chair leg". This bypasses task-initiation paralysis.
2. Time-box honestly. Use 2-15 minute windows. ADHD brains rebel against open-ended chores.
3. Chunk by location, not by category. One mission = one zone you can see without turning your head.
4. Difficulty reflects executive load, not physical effort. "easy" = low decisions. "hard" = lots of sorting / where-does-this-go judgment calls.
5. Mission names should be slightly playful but not condescending. Examples: "Couch Floor Sweep", "Counter Reset", "Sock Patrol".
6. The funFact should be 1 short, genuinely interesting line.

OUTPUT FORMAT (respond with ONLY this JSON, no markdown fences):
{
  "houseScan": {
    "overallMessLevel": "low" | "medium" | "high",
    "totalChoresIdentified": <integer>,
    "roomsSummary": [
      {
        "name": "<room name>",
        "messLevel": "low" | "medium" | "high",
        "itemsOutOfPlace": <integer>,
        "primaryClutterType": "<string>"
      }
    ]
  },
  "choreMissions": [
    {
      "missionId": <integer>,
      "missionName": "<string>",
      "description": "<string>",
      "totalTimeEstimate": "<string>",
      "funFact": "<string>",
      "firstStep": "<single concrete action>",
      "relatedChores": [
        {
          "choreId": <integer>,
          "choreTitle": "<string>",
          "location": "<string>",
          "itemsInvolved": ["<string>"],
          "properStorage": "<string>",
          "priority": "low" | "medium" | "high",
          "estimatedTime": "<string>",
          "difficulty": "easy" | "medium" | "hard"
        }
      ]
    }
  ]
}

Generate 1-3 missions max. Each mission has 1-3 sub-chores. Total time across all missions: under 30 minutes.`;

export async function POST(req: NextRequest) {
  if (!(await verifyAuth(req))) return unauthorized();

  try {
    const { image, model } = await req.json();

    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid image' }, { status: 400 });
    }

    const gatewayModel = ALLOWED_MODELS[model] ?? 'google/gemini-2.5-flash';

    const raw = await gatewayChat({
      model: gatewayModel,
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        {
          role: 'user',
          content: visionContent(image, 'Scan this room. Return ADHD-friendly missions per the rules.'),
        },
      ],
      temperature: 0.4,
      maxTokens: 4096,
      jsonMode: true,
    });

    const parsed = extractJson(raw);
    return NextResponse.json(parsed);
  } catch (err: unknown) {
    console.error('scan-room error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error during scan' },
      { status: 500 }
    );
  }
}
