import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedUid, unauthorized } from '@/lib/server-auth';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { claimAccessUrl, fetchAccounts } from '@/lib/simplefin';
import { normalizeSimpleFinAccounts } from '@/lib/bank-data';
import { FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const maxDuration = 30;

// The SimpleFIN access URL is a bearer credential for every account at the
// bridge — it lives only in `bankSecrets`, which firestore.rules denies to
// every client read/write. `bankConnections` holds the non-secret metadata
// (name, linkedAt) the UI needs to render the "linked banks" list.
export async function POST(req: NextRequest) {
  const uid = await getVerifiedUid(req);
  if (!uid) return unauthorized();

  const db = getAdminFirestore();
  const body = await req.json().catch(() => ({}));
  const { action, setupToken, label, connectionId } = body ?? {};

  if (action === 'claim') return handleClaim(db, uid, setupToken, label);
  if (action === 'sync') return handleSync(db, uid);
  if (action === 'remove') return handleRemove(db, uid, connectionId);
  return NextResponse.json({ error: `Unknown action: "${action}"` }, { status: 400 });
}

async function handleClaim(db: FirebaseFirestore.Firestore, uid: string, setupToken: unknown, label: unknown) {
  if (typeof setupToken !== 'string' || !setupToken.trim()) {
    return NextResponse.json({ error: 'setupToken is required' }, { status: 400 });
  }
  try {
    const accessUrl = await claimAccessUrl(setupToken);
    const connectionRef = db.collection('households').doc(uid).collection('bankConnections').doc();

    await db.runTransaction(async tx => {
      tx.set(connectionRef, {
        institutionName: typeof label === 'string' && label.trim() ? label.trim() : 'Bank',
        linkedAt: new Date().toISOString(),
      });
      tx.set(db.collection('households').doc(uid).collection('bankSecrets').doc(connectionRef.id), { accessUrl });
    });

    return NextResponse.json({ connectionId: connectionRef.id });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Claim failed' }, { status: 400 });
  }
}

async function handleSync(db: FirebaseFirestore.Firestore, uid: string) {
  const connectionsSnap = await db.collection('households').doc(uid).collection('bankConnections').get();
  if (connectionsSnap.empty) return NextResponse.json({ accounts: [], transactions: [] });

  const allAccounts = [];
  const allTransactions = [];
  const staleConnections: string[] = [];

  for (const connDoc of connectionsSnap.docs) {
    const secretSnap = await db.collection('households').doc(uid).collection('bankSecrets').doc(connDoc.id).get();
    const accessUrl = secretSnap.data()?.accessUrl;
    if (!accessUrl) { staleConnections.push(connDoc.id); continue; }

    try {
      const { accounts } = await fetchAccounts(accessUrl, { pending: true });
      const normalized = normalizeSimpleFinAccounts(accounts, connDoc.id);
      allAccounts.push(...normalized.accounts);
      allTransactions.push(...normalized.transactions);
    } catch (err) {
      console.error(`[simplefin] sync failed for connection ${connDoc.id}:`, err);
      staleConnections.push(connDoc.id);
    }
  }

  return NextResponse.json({
    accounts: allAccounts,
    transactions: allTransactions.sort((a, b) => b.date.localeCompare(a.date)),
    staleConnections,
  });
}

async function handleRemove(db: FirebaseFirestore.Firestore, uid: string, connectionId: unknown) {
  if (typeof connectionId !== 'string' || !connectionId) {
    return NextResponse.json({ error: 'connectionId is required' }, { status: 400 });
  }
  const batch = db.batch();
  batch.delete(db.collection('households').doc(uid).collection('bankConnections').doc(connectionId));
  batch.delete(db.collection('households').doc(uid).collection('bankSecrets').doc(connectionId));
  await batch.commit();
  return NextResponse.json({ ok: true });
}
