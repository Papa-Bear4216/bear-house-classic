import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminFirestore } from '@/lib/firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';

// Idempotent admin migration: applies the corrected house layout (bath swap,
// Master Bedroom/W.I.C./bedroom renames, phantom "Bedroom 4" removal, Hall
// L-shape, closets, mind-palace gating) to the caller's own household. Safe
// to run repeatedly — every step is keyed by the room's *current* name, so
// a household that's already partially migrated just picks up the rest.
// Mirrors scripts/migrate-house-layout-v2.mjs but runs server-side against
// production using the already-configured Firebase Admin credentials.

const RENAME_MAP: Record<string, string> = {
  'Primary Bath': 'Hall Bath',
  'Hall Bath': 'Primary Bath',
  'W.I.C.': 'Master Walk-In Closet',
  'Primary Bedroom': 'Master Bedroom',
  'Bedroom 2': "Abriana's Room",
  'Bedroom 3': "Julia's Room",
};

const HALL_POLYGON = [
  { x: 682, y: 272 }, { x: 731, y: 272 }, { x: 731, y: 433 },
  { x: 691, y: 433 }, { x: 691, y: 567 }, { x: 651, y: 567 },
  { x: 651, y: 433 }, { x: 603, y: 433 }, { x: 603, y: 331 },
  { x: 682, y: 331 },
];

// Exact geometry/flags to force onto these rooms, keyed by final name —
// applied unconditionally so re-running fixes drift from earlier versions
// of this migration (e.g. the closet-row correction).
const FIXED_FIELDS: Record<string, Record<string, unknown>> = {
  'Master Bedroom': { restrictedToAdults: true },
  'Master Walk-In Closet': { restrictedToAdults: true, linkedFeature: '/budget' },
  'Hall': { x: 603, y: 272, w: 128, h: 295, points: HALL_POLYGON },
  "Abriana's Room": { x: 731, y: 272, w: 203, h: 148 },
  'Guest Room': { x: 731, y: 446, w: 203, h: 121 },
  // Single tall closet between the Hall and Julia's/Guest Room.
  'Hall Closet 1': { x: 691, y: 433, w: 40, h: 134 },
  // Row of 3 closets between Abriana's Room and Guest Room.
  'Hall Closet 2': { x: 731, y: 420, w: 68, h: 26 },
  'Hall Closet 3': { x: 799, y: 420, w: 68, h: 26 },
  'Hall Closet 4': { x: 867, y: 420, w: 67, h: 26 },
};

const NEW_ROOMS = [
  { name: 'Foyer Closet',  x: 443, y: 398, w: 40, h: 90,  color: '#f1f5f9' },
  { name: 'Hall Closet 1', x: 691, y: 433, w: 40, h: 134, color: '#f1f5f9' },
  { name: 'Hall Closet 2', x: 731, y: 420, w: 68, h: 26,  color: '#f1f5f9' },
  { name: 'Hall Closet 3', x: 799, y: 420, w: 68, h: 26,  color: '#f1f5f9' },
  { name: 'Hall Closet 4', x: 867, y: 420, w: 67, h: 26,  color: '#f1f5f9' },
];

export async function POST(req: NextRequest) {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let uid: string;
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getAdminFirestore();
  const userDoc = await db.collection('users').doc(uid).get();
  const role = userDoc.data()?.role;
  if (role !== 'admin' && role !== 'superadmin') {
    return NextResponse.json({ error: 'Admins only' }, { status: 403 });
  }

  const floorplanCol = db.collection('households').doc(uid).collection('floorplan');
  const chorePinsCol = db.collection('households').doc(uid).collection('chorePins');
  const existing = await floorplanCol.get();

  if (existing.empty) {
    return NextResponse.json({ changes: [], message: 'No floorplan rooms found for this household.' });
  }

  const originalNames = new Map(existing.docs.map(d => [d.id, d.data().name as string]));
  const batch = db.batch();
  const changes: string[] = [];

  for (const docSnap of existing.docs) {
    const oldName = originalNames.get(docSnap.id);

    if (oldName === 'Bedroom 4') {
      batch.delete(docSnap.ref);
      changes.push('Deleted phantom room: Bedroom 4');
      const pins = await chorePinsCol.where('roomId', '==', docSnap.id).get();
      if (!pins.empty) {
        pins.docs.forEach(p => batch.delete(p.ref));
        changes.push(`Abandoned ${pins.size} chore pin(s) on Bedroom 4`);
      }
      continue;
    }

    const finalName = oldName === 'Bedroom 5' ? 'Guest Room' : (RENAME_MAP[oldName ?? ''] ?? oldName);
    const patch: Record<string, unknown> = {};

    if (oldName === 'Bedroom 5') patch.name = 'Guest Room';
    else if (oldName && RENAME_MAP[oldName]) patch.name = RENAME_MAP[oldName];

    if (finalName && FIXED_FIELDS[finalName]) Object.assign(patch, FIXED_FIELDS[finalName]);

    if (Object.keys(patch).length > 0) {
      batch.update(docSnap.ref, patch);
      changes.push(`${oldName} -> ${JSON.stringify(patch)}`);
    }
  }

  const haveNames = new Set(existing.docs.map(d => originalNames.get(d.id)));
  for (const room of NEW_ROOMS) {
    if (haveNames.has(room.name)) continue;
    const ref = floorplanCol.doc();
    batch.set(ref, { ...room, createdAt: FieldValue.serverTimestamp() });
    changes.push(`+ ${room.name}`);
  }

  if (changes.length > 0) await batch.commit();

  return NextResponse.json({ changes });
}
