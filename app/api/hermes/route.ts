import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { doc as adminDoc, getDoc as adminGetDoc, setDoc as adminSetDoc } from 'firebase-admin/firestore';

const BEAR_HOUSE_SYSTEM = `You are Hermes, the intelligent AI backbone of Bear House Family OS — an ADHD safety net designed to combat executive dysfunction and serve as the family's central hub.

Your core purpose:
- Reduce cognitive load. Surface what needs attention NOW, not buried in menus.
- Anticipate needs before they're asked — you learn from this family's usage patterns.
- Proactively flag schedule conflicts, low supplies, upcoming tasks, budget concerns.
- Know every family member's role, preferences, and routines deeply.
- Speak warmly and concisely. No walls of text. Be the trusted voice that helps everything run.

When you want to remember an important family fact for future personalization, output a line beginning with ADD TO MEMORY: followed by a short note. Keep memory notes concise and only store useful details that will help the family later.

You get richer over time as you learn how and when this family uses the app. Use those patterns to give more relevant, timely help.`;

export async function POST(req: NextRequest) {
  const { messages, context, systemOverride } = await req.json();

  // Build context block — includes usage memory if present
  const contextParts: string[] = [];
  if (context?.date) contextParts.push(`Current time: ${context.date}`);
  if (context?.currentUser) contextParts.push(`Active user: ${JSON.stringify(context.currentUser)}`);
  if (context?.users?.length) contextParts.push(`Family: ${JSON.stringify(context.users)}`);
  if (context?.tasks?.length) contextParts.push(`Tasks: ${JSON.stringify(context.tasks)}`);
  if (context?.events?.length) contextParts.push(`Events: ${JSON.stringify(context.events)}`);
  if (context?.meals?.length) contextParts.push(`Meal plan: ${JSON.stringify(context.meals)}`);
  if (context?.shopping?.length) contextParts.push(`Shopping: ${JSON.stringify(context.shopping)}`);
  if (context?.budgetSummary) contextParts.push(`Budget: ${context.budgetSummary}`);

  // Usage memory — what Hermes has learned about this family's habits
  if (context?.usageMemory) {
    contextParts.push(`\nLearned usage patterns (use to personalize responses):\n${context.usageMemory}`);
  }
  if (context?.persistentMemory?.length) {
    contextParts.push(`\nSaved family memory (use to personalize responses):\n${JSON.stringify(context.persistentMemory)}`);
  }

  const systemContent = `${systemOverride ?? BEAR_HOUSE_SYSTEM}

${contextParts.join('\n')}`;

  // Primary: Claude (Anthropic)
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey: anthropicKey });

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemContent,
        messages: messages.map((m: { role: string; content: string }) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      });

      const content = response.content[0].type === 'text' ? response.content[0].text : '';
      await persistMemoryFromResponse(context, content);
      return NextResponse.json({ content, model: 'claude-haiku' });
    } catch (e) {
      console.error('Claude error:', e);
    }
  }

  // Fallback: Gemini
  const geminiKey = process.env.GEMINI_API_KEY ?? process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const fullPrompt = [
        systemContent,
        ...messages.map((m: { role: string; content: string }) => `${m.role.toUpperCase()}: ${m.content}`),
      ].join('\n\n');

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: fullPrompt,
      });
      const content = response.text ?? '';
      await persistMemoryFromResponse(context, content);
      return NextResponse.json({ content, model: 'gemini-2.0-flash' });
    } catch (e) {
      console.error('Gemini fallback error:', e);
    }
  }

  return NextResponse.json(
    { error: 'No AI provider configured. Set ANTHROPIC_API_KEY or GEMINI_API_KEY.' },
    { status: 503 },
  );
}

async function persistMemoryFromResponse(context: any, content: string) {
  const userId = context?.currentUser?.id ?? context?.currentUser?.uid;
  if (!content || !userId) return;
  const matches = content
    .split(/\r?\n/)
    .map(line => line.match(/^ADD TO MEMORY:\s*(.+)$/i))
    .filter(Boolean)
    .map(match => match?.[1].trim())
    .filter(Boolean);

  if (!matches.length) return;

  try {
    const firestore = getAdminFirestore();
    const ref = adminDoc(firestore, 'households', context.currentUser.uid, 'hermesMemory', 'hermesMemory');
    const snap = await adminGetDoc(ref);
    const existing = snap.exists() ? (snap.data() as { persistentNotes?: string[] }) : { persistentNotes: [] };
    const persistentNotes = Array.isArray(existing.persistentNotes) ? existing.persistentNotes : [];
    const updatedNotes = [...matches, ...persistentNotes].slice(0, 20);
    await adminSetDoc(ref, { persistentNotes: updatedNotes, lastUpdated: new Date().toISOString() }, { merge: true });
  } catch (err) {
    console.error('Failed to save Hermes memory note:', err);
  }
}
