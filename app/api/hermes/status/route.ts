import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/server-auth';
import { getAdminFirestore } from '@/lib/firebase-admin';
import type { StoredHermesEvent } from '@/lib/hermes-events';

export const runtime = 'nodejs';

// Hermes self-report: summarizes recent activity from the hermes_events trail —
// AI calls by model, primary-vs-fallback health, memory writes, and recent errors.
// Covers every source writing to hermes_events (Vercel routes and the GCE agent).
export async function GET(req: NextRequest) {
  if (!(await verifyAuth(req))) return unauthorized();

  const hours = Math.min(Number(req.nextUrl.searchParams.get('hours')) || 24, 168);
  const cutoff = new Date(Date.now() - hours * 3_600_000).toISOString();

  try {
    const snap = await getAdminFirestore()
      .collection('hermes_events')
      .where('ts', '>=', cutoff)
      .orderBy('ts', 'desc')
      .limit(1000)
      .get();
    const events = snap.docs.map(d => d.data() as StoredHermesEvent);

    const byType: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const byModel: Record<string, { count: number; errors: number; totalLatencyMs: number }> = {};
    let errors = 0;

    for (const e of events) {
      byType[e.event_type] = (byType[e.event_type] ?? 0) + 1;
      bySource[e.source] = (bySource[e.source] ?? 0) + 1;
      if (e.status === 'error') errors++;
      if (e.model) {
        const m = (byModel[e.model] ??= { count: 0, errors: 0, totalLatencyMs: 0 });
        m.count++;
        if (e.status === 'error') m.errors++;
        m.totalLatencyMs += e.latencyMs ?? 0;
      }
    }

    // Primary-vs-fallback health for the Hermes chat: the signal that would have
    // caught the weeks-long silent primary failure.
    const chatOk = events.filter(e => e.event_type === 'ai.chat' && e.status === 'ok');
    const servedByFallback = chatOk.filter(e => (e.model ?? '').includes('gemini')).length;

    return NextResponse.json({
      windowHours: hours,
      totalEvents: events.length,
      errors,
      byType,
      bySource,
      models: Object.fromEntries(
        Object.entries(byModel).map(([model, m]) => [model, {
          count: m.count,
          errors: m.errors,
          avgLatencyMs: m.count ? Math.round(m.totalLatencyMs / m.count) : 0,
        }]),
      ),
      chat: {
        replies: chatOk.length,
        servedByPrimary: chatOk.length - servedByFallback,
        servedByFallback,
        primaryHealthPct: chatOk.length
          ? Math.round((100 * (chatOk.length - servedByFallback)) / chatOk.length)
          : null,
      },
      memoriesStored: byType['memory.store'] ?? 0,
      recentErrors: events
        .filter(e => e.status === 'error')
        .slice(0, 10)
        .map(e => ({ ts: e.ts, event_type: e.event_type, summary: e.summary, error: e.error })),
    });
  } catch (err: unknown) {
    console.error('[hermes/status]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Status rollup failed' },
      { status: 500 },
    );
  }
}
