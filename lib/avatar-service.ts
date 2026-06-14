import { GoogleGenAI } from "@google/genai";

function getAI() {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let quotaExceededUntil = 0;

export async function generateFamilyAvatar(name: string, color: string): Promise<string | null> {
  if (!process.env.NEXT_PUBLIC_GEMINI_API_KEY) {
    console.warn('NEXT_PUBLIC_GEMINI_API_KEY is not set. Avatar generation skipped.');
    return null;
  }

  if (Date.now() < quotaExceededUntil) {
    console.warn('Gemini API Quota was recently exceeded. Skipping avatar generation for now.');
    return null;
  }

  const maxRetries = 5;
  let lastError: any = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const ai = getAI();
      if (!ai) return null;
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              text: `A cute 3D claymorphism-style character avatar icon for a person named "${name}". The character should have a soft, matte clay texture with smooth rounded shapes. Dominant color: ${color.replace('bg-', '')}. Composition: centered, isolated on a simple clean background, studio lighting, high resolution, 3D render, Pixar-style aesthetic, professional profile icon. [Salt: ${Math.random().toString(36).substring(7)}]`,
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
          },
        },
      });

      const parts = response.candidates?.[0]?.content?.parts;
      if (parts) {
        for (const part of parts) {
          if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
          }
        }
      }
      return null;
    } catch (error: any) {
      lastError = error;
      const errorMessage = error?.message || String(error);
      const isQuotaError = errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('quota');
      const isTransientError = errorMessage.includes('500') || errorMessage.includes('503') || errorMessage.includes('Rpc failed') || errorMessage.includes('xhr error');

      if (isQuotaError) {
        quotaExceededUntil = Date.now() + (30 * 60 * 1000);
        console.warn('Gemini API Quota exceeded. Returning null for avatar generation and cooling down for 30 minutes.');
        return null;
      }

      if (isTransientError && attempt < maxRetries - 1) {
        // Increase delay for transient errors: 2s, 4s, 8s, 16s...
        const baseDelay = 2000;
        const delay = Math.pow(2, attempt) * baseDelay + Math.random() * 1000;
        console.warn(`Transient error for avatar generation, retrying in ${Math.round(delay)}ms... (Attempt ${attempt + 1}/${maxRetries})`);
        await sleep(delay);
        continue;
      }
      
      console.warn('Failed to generate avatar after attempts:', error?.message || 'Unknown error');
      break;
    }
  }

  return null;
}
