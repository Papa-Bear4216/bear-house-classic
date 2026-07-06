// Server-side image generation via Google's Gemini image model.
// OpenRouter (lib/ai-gateway.ts) has no image endpoint, so avatar generation goes
// direct to Google using the existing Gemini API key. Returns a base64-encoded PNG.
import { GoogleGenAI } from '@google/genai';

const IMAGE_MODEL = 'gemini-2.5-flash-image';

function apiKey(): string {
  const k = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!k) throw new Error('GEMINI_API_KEY is not configured');
  return k;
}

export async function generateImage(prompt: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: apiKey() });
  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: prompt,
    config: { responseModalities: ['IMAGE'] },
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const b64 = parts.find((p) => p.inlineData?.data)?.inlineData?.data;
  if (!b64) throw new Error('Image model returned no image data');
  return b64;
}
