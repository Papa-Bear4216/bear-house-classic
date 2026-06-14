import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Structured output schema — forces Gemini to return parseable JSON, no markdown wrapping.
const scanSchema = {
  type: Type.OBJECT,
  properties: {
    houseScan: {
      type: Type.OBJECT,
      properties: {
        overallMessLevel: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
        totalChoresIdentified: { type: Type.NUMBER },
        roomsSummary: {
          type: Type.OBJECT,
          // Gemini doesn't support dynamic keys in schema, so we use a known set
          // and the model fills in only the rooms it sees.
          properties: {
            'Detected Room': {
              type: Type.OBJECT,
              properties: {
                messLevel: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
                itemsOutOfPlace: { type: Type.NUMBER },
                primaryClutterType: { type: Type.STRING },
              },
              required: ['messLevel', 'itemsOutOfPlace', 'primaryClutterType'],
            },
          },
        },
      },
      required: ['overallMessLevel', 'totalChoresIdentified', 'roomsSummary'],
    },
    choreMissions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          missionId: { type: Type.NUMBER },
          missionName: { type: Type.STRING },
          description: { type: Type.STRING },
          totalTimeEstimate: { type: Type.STRING },
          funFact: { type: Type.STRING },
          firstStep: { type: Type.STRING }, // NEW: one concrete first object to grab
          relatedChores: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                choreId: { type: Type.NUMBER },
                choreTitle: { type: Type.STRING },
                location: { type: Type.STRING },
                itemsInvolved: { type: Type.ARRAY, items: { type: Type.STRING } },
                properStorage: { type: Type.STRING },
                priority: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
                estimatedTime: { type: Type.STRING },
                difficulty: { type: Type.STRING, enum: ['easy', 'medium', 'hard'] },
              },
              required: ['choreId', 'choreTitle', 'location', 'itemsInvolved',
                         'properStorage', 'priority', 'estimatedTime', 'difficulty'],
            },
          },
        },
        required: ['missionId', 'missionName', 'description', 'totalTimeEstimate',
                   'funFact', 'firstStep', 'relatedChores'],
      },
    },
  },
  required: ['houseScan', 'choreMissions'],
};

// ADHD-tuned system instruction. This is the actual change in behavior:
// task initiation, time-boxing, working-memory chunking, one concrete first step.
const SYSTEM_INSTRUCTION = `You are a room-scanning assistant for a family with ADHD parents and kids. You will receive a photo of a room.

OBJECT IDENTIFICATION RULES:
- Only list objects you can ACTUALLY SEE in the image. Do not invent items.
- Be specific: "blue cereal bowl on coffee table" not "dishes". Specificity reduces ADHD ambiguity-paralysis.
- If the room looks tidy, say so — return overallMessLevel "low" and 0-1 missions max. Do not manufacture work.

ADHD TASK DESIGN RULES (apply to every mission and chore):
1. ONE concrete first step. The "firstStep" field must name a single visible object to pick up FIRST — e.g. "Grab the red sock by the chair leg". This bypasses task-initiation paralysis.
2. Time-box honestly. Use 2-15 minute windows. ADHD brains rebel against open-ended chores.
3. Chunk by location, not by category. One mission = one zone you can see without turning your head. Working memory is the bottleneck, not effort.
4. Difficulty reflects executive load, not physical effort. "easy" = low decisions. "hard" = lots of sorting / where-does-this-go judgment calls.
5. Mission names should be slightly playful but not condescending — these are read by kids AND a 40-year-old dad. Examples: "Couch Floor Sweep", "Counter Reset", "Sock Patrol". Avoid "Magical" / "Wizardry" / over-cute.
6. The funFact should be 1 short, genuinely interesting line — dopamine reward for finishing, not a lecture.

OUTPUT:
- Generate 1-3 missions max. More than 3 overwhelms.
- Each mission has 1-3 sub-chores.
- Total time across all missions should be under 30 minutes.
- properStorage must be a plausible guess for where the item belongs (e.g. "Kitchen cabinet above sink"). It's OK to say "Family decides" if truly unclear.

Return ONLY the JSON, no commentary.`;

export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();

    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid image' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY ?? process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY or NEXT_PUBLIC_GEMINI_API_KEY not set on server' },
        { status: 500 }
      );
    }

    // Strip the data URL prefix to get raw base64
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const mimeMatch = image.match(/^data:(image\/\w+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', // Multimodal, fast, cheap — right tool for this
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: base64Data } },
            { text: 'Scan this room. Return ADHD-friendly missions per the rules.' },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: scanSchema,
        temperature: 0.4, // Lower = less hallucination of unseen objects
      },
    });

    const text = response.text;
    if (!text) {
      return NextResponse.json({ error: 'Empty response from model' }, { status: 502 });
    }

    const parsed = JSON.parse(text);
    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error('scan-room error:', err);
    return NextResponse.json(
      { error: err?.message || 'Unknown error during scan' },
      { status: 500 }
    );
  }
}
