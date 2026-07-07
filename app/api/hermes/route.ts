import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/server-auth';
import { gatewayChat } from '@/lib/ai-gateway';
import { routeToRooms, recallMemories, storeMemory, ROOM_LABELS } from '@/lib/palace';

export const runtime = 'nodejs';
export const maxDuration = 30;

const BEAR_HOUSE_SYSTEM = `You are Hermes, the intelligent AI backbone of Bear House Family OS — an ADHD safety net designed to combat executive dysfunction and serve as the family's central hub.

Your core purpose:
- Reduce cognitive load. Surface what needs attention NOW, not buried in menus.
- Anticipate needs before they're asked — you learn from this family's usage patterns.
- Proactively flag schedule conflicts, low supplies, upcoming tasks, budget concerns.
- Know every family member's role, preferences, and routines deeply.
- Speak warmly and concisely. No walls of text. Be the trusted voice that helps everything run.

// When you want to remember an important family fact for future personalization, output a line beginning with ADD TO MEMORY: followed by a short note.

CRITICAL:
- Use ONLY the data provided in this conversation and the appended context blocks.
- Do NOT invent tasks, events, people, times, locations, or statuses not explicitly present in the provided data.
- If something is missing or uncertain, say so plainly rather than guessing.
- Be concise, specific, and actionable.

You get richer over time as you learn how and when this family uses the app. Use those patterns to give more relevant, timely help.`;

export async function POST(req: NextRequest) {
  if (!(await verifyAuth(req))) return unauthorized();

  const { messages, context, systemOverride } = await req.json();

  const contextParts: string[] = [];
  if (context?.date) contextParts.push(`Current time: ${context.date}`);
  if (context?.currentUser) contextParts.push(`Active user: ${JSON.stringify(context.currentUser)}`);
  if (context?.users?.length) contextParts.push(`Family: ${JSON.stringify(context.users)}`);
  if (context?.tasks?.length) contextParts.push(`Tasks: ${JSON.stringify(context.tasks)}`);
  if (context?.events?.length) contextParts.push(`Events: ${JSON.stringify(context.events)}`);
  if (context?.meals?.length) contextParts.push(`Meal plan: ${JSON.stringify(context.meals)}`);
  if (context?.shopping?.length) contextParts.push(`Shopping: ${JSON.stringify(context.shopping)}`);
  if (context?.budgetSummary) contextParts.push(`Budget: ${context.budgetSummary}`);
  if (context?.usageMemory) contextParts.push(`\nLearned usage patterns:\n${context.usageMemory}`);
  if (context?.persistentMemory?.length) {
    contextParts.push(`\nSaved family memory (use to personalize responses):\n${JSON.stringify(context.persistentMemory)}`);
  }

  // Mind palace: recall only the memories in the rooms relevant to the latest user turn,
  // instead of dumping every saved note. See docs/hermes-mind-palace-plan.md.
  const userId = (context?.currentUser?.id ?? context?.currentUser?.uid) as string | undefined;
  if (userId) {
    const lastUser = [...(messages ?? [])].reverse().find((m: { role: string }) => m.role === 'user');
    const rooms = routeToRooms(typeof lastUser?.content === 'string' ? lastUser.content : '');
    try {
      const recalled = await recallMemories(userId, rooms);
      if (recalled.length) {
        const roomNames = Array.from(new Set(rooms.map(r => ROOM_LABELS[r]))).join(', ');
        contextParts.push(`\nRelevant memory (${roomNames}):\n${recalled.map(m => `- ${m.text}`).join('\n')}`);
      }
    } catch (err) {
      console.error('Palace recall failed:', err);
    }
  }

  const systemContent = `${systemOverride ?? BEAR_HOUSE_SYSTEM}\n\n${contextParts.join('\n')}`;

  const gatewayMessages = [
    { role: 'system' as const, content: systemContent },
    ...messages.map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ];

  // Primary: Hermes 4 70B via OpenRouter gateway
  try {
    const content = await gatewayChat({
      model: 'nousresearch/hermes-4-70b',
      messages: gatewayMessages,
      maxTokens: 2048,
      temperature: 0.7,
      // Hermes 4 is a hybrid reasoning model; leaving reasoning on drains the token
      // budget and returns empty content. Keep the whole budget for the reply.
      reasoning: { enabled: false },
    });
    await persistMemoryFromResponse(context, content);
    return NextResponse.json({ content, model: 'hermes-4-70b' });
  } catch (e) {
    console.error('Claude via gateway error:', e);
  }

  // Fallback: Gemini Flash via gateway
  try {
    const content = await gatewayChat({
      model: 'google/gemini-2.5-flash',
      messages: gatewayMessages,
      maxTokens: 2048,
      temperature: 0.7,
      // Gemini 2.5 Flash thinks by default; disable it so the reply isn't truncated to empty.
      reasoning: { enabled: false },
    });
    await persistMemoryFromResponse(context, content);
    return NextResponse.json({ content, model: 'gemini-2.5-flash' });
  } catch (e) {
    console.error('Gemini fallback via gateway error:', e);
    return NextResponse.json(
      { error: 'All AI providers failed. Check AI_GATEWAY_KEY and provider vault config.' },
      { status: 503 }
    );
  }
}

async function persistMemoryFromResponse(context: Record<string, unknown>, content: string) {
  const userId = (context?.currentUser as Record<string, unknown>)?.id ?? (context?.currentUser as Record<string, unknown>)?.uid;
  if (!content || !userId) return;

  const matches = content
    .split(/\r?\n/)
    .map(line => line.match(/^ADD TO MEMORY:\s*(.+)$/i))
    .filter(Boolean)
    .map(match => match?.[1].trim())
    .filter(Boolean) as string[];

  if (!matches.length) return;

  // Route each note to its room in the mind palace. See docs/hermes-mind-palace-plan.md.
  for (const note of matches) {
    try {
      await storeMemory(userId as string, note);
    } catch (err) {
      console.error('Failed to save Hermes memory note:', err);
    }
  }
}
