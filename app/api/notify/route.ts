import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore, getAdminMessaging } from '@/lib/firebase-admin';
import { verifyAuth, unauthorized } from '@/lib/server-auth';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!(await verifyAuth(req))) return unauthorized();

  try {
    const { uid, title, body, data, url } = await req.json();

    if (!uid || !title) {
      return NextResponse.json({ error: 'uid and title required' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const tokenSnap = await db.collection('users').doc(uid).collection('fcmTokens').get();

    if (tokenSnap.empty) {
      return NextResponse.json({ sent: 0, reason: 'no tokens registered for this user' });
    }

    const tokens: string[] = [];
    for (const d of tokenSnap.docs) {
      const t: unknown = (d.data() as Record<string, unknown>)['token'];
      if (typeof t === 'string' && t.length > 0) tokens.push(t);
    }
    if (!tokens.length) return NextResponse.json({ sent: 0, reason: 'no valid tokens' });

    const messaging = getAdminMessaging();
    const results = await Promise.allSettled(
      tokens.map(token =>
        messaging.send({
          token,
          notification: { title, body: body ?? '' },
          webpush: {
            notification: {
              title,
              body: body ?? '',
              icon: '/icon-192.png',
              badge: '/icon-192.png',
              vibrate: [200, 100, 200],
            },
            fcmOptions: { link: url ?? '/' },
          },
          data: data ?? {},
        })
      )
    );

    const sent = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    // Prune stale tokens
    const staleTokens = results
      .map((r, i) => ({ r, token: tokens[i] }))
      .filter(({ r }) => r.status === 'rejected' && (r as PromiseRejectedResult).reason?.errorInfo?.code?.includes('registration-token-not-registered'))
      .map(({ token }) => token);

    if (staleTokens.length) {
      const batch = db.batch();
      const snap = await db.collection('users').doc(uid).collection('fcmTokens').get();
      for (const d of snap.docs) {
        const t = (d.data() as Record<string, unknown>)['token'];
        if (typeof t === 'string' && staleTokens.includes(t)) batch.delete(d.ref);
      }
      await batch.commit();
    }

    return NextResponse.json({ sent, failed });
  } catch (e) {
    console.error('[notify]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// Broadcast to all family members
export async function PUT(req: NextRequest) {
  if (!(await verifyAuth(req))) return unauthorized();

  try {
    const { uids, title, body, data, url } = await req.json();
    if (!uids?.length || !title) return NextResponse.json({ error: 'uids[] and title required' }, { status: 400 });

    const results = await Promise.allSettled(
      (uids as string[]).map(uid =>
        fetch(new URL('/api/notify', req.url).href, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ uid, title, body, data, url }),
        })
      )
    );

    return NextResponse.json({ dispatched: results.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
