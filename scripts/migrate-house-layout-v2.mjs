// One-time migration: bring an already-seeded household's floorplan up to the
// corrected 4-bedroom / 1.5-bath layout (see hooks/use-floorplan.ts SEED_ROOMS).
// Run with: node scripts/migrate-house-layout-v2.mjs <HOUSEHOLD_ID>
// Or omit the argument to patch all households that already have floorplan docs.
//
// What this does, per household:
//   1. Renames rooms per migrate-room-names.mjs's RENAME_MAP (bath swap, W.I.C.,
//      Master Bedroom, Abriana's/Julia's Room) if not already applied.
//   2. Deletes the phantom 'Bedroom 4' room (it doesn't exist in the real house)
//      and abandons any chore pins pointing at it, per the family's direction.
//   3. Renames/repositions 'Bedroom 5' into the real Guest Room position.
//   4. Updates 'Hall' to the corrected L-shaped polygon.
//   5. Adds the 3 missing closets: Foyer Closet, Hall Closet 1, Hall Closet 2.
//
// NOTE: edit SERVICE_ACCOUNT_PATH below to point at your local Firebase service
// account JSON (the same file used by the other migrate-*.mjs scripts).

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const SERVICE_ACCOUNT_PATH = 'C:/Users/micha/Downloads/prime-mechanic-463314-m8-firebase-adminsdk-fbsvc-fe090352d6.json';
const SERVICE_ACCOUNT = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

initializeApp({ credential: cert(SERVICE_ACCOUNT) });
const db = getFirestore();

const RENAME_MAP = {
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

const NEW_ROOMS = [
  { name: 'Foyer Closet',   x: 443, y: 398, w: 40, h: 90,  color: '#f1f5f9' },
  { name: 'Hall Closet 1',  x: 691, y: 433, w: 40, h: 67,  color: '#f1f5f9' },
  { name: 'Hall Closet 2',  x: 691, y: 500, w: 40, h: 67,  color: '#f1f5f9' },
];

async function patchHousehold(householdId) {
  const floorplanCol = db.collection('households').doc(householdId).collection('floorplan');
  const chorePinsCol = db.collection('households').doc(householdId).collection('chorePins');
  const existing = await floorplanCol.get();

  if (existing.empty) {
    console.log('  No floorplan rooms found, nothing to migrate.');
    return;
  }

  const originalNames = new Map(existing.docs.map(d => [d.id, d.data().name]));
  const batch = db.batch();
  let writes = 0;

  for (const docSnap of existing.docs) {
    const oldName = originalNames.get(docSnap.id);

    if (oldName === 'Bedroom 4') {
      batch.delete(docSnap.ref);
      console.log('    Deleted phantom room: Bedroom 4');
      writes++;
      const pins = await chorePinsCol.where('roomId', '==', docSnap.id).get();
      if (!pins.empty) {
        pins.docs.forEach(p => batch.delete(p.ref));
        console.log(`    Abandoned ${pins.size} chore pin(s) on Bedroom 4`);
        writes += pins.size;
      }
      continue;
    }

    if (oldName === 'Bedroom 5') {
      batch.update(docSnap.ref, {
        name: 'Guest Room', x: 731, y: 433, w: 203, h: 134,
      });
      console.log('    Bedroom 5 -> Guest Room (repositioned)');
      writes++;
      continue;
    }

    if (oldName === 'Hall') {
      batch.update(docSnap.ref, {
        x: 603, y: 272, w: 128, h: 295, points: HALL_POLYGON,
      });
      console.log('    Hall -> corrected L-shaped polygon');
      writes++;
      continue;
    }

    const newName = RENAME_MAP[oldName];
    if (newName) {
      batch.update(docSnap.ref, { name: newName });
      console.log(`    ${oldName} -> ${newName}`);
      writes++;
    }
  }

  const haveNames = new Set(existing.docs.map(d => originalNames.get(d.id)));
  for (const room of NEW_ROOMS) {
    if (haveNames.has(room.name)) continue;
    const ref = floorplanCol.doc();
    batch.set(ref, { ...room, createdAt: new Date() });
    console.log(`    + ${room.name}`);
    writes++;
  }

  if (writes > 0) await batch.commit();
  console.log(`  Applied ${writes} change(s).`);
}

async function run() {
  const targetId = process.argv[2];
  const households = await db.collection('households').listDocuments();

  const targets = targetId
    ? households.filter(h => h.id === targetId)
    : households;

  if (targets.length === 0) {
    console.error(targetId ? `Household ${targetId} not found.` : 'No households found.');
    process.exit(1);
  }

  for (const ref of targets) {
    console.log(`\nHousehold: ${ref.id}`);
    await patchHousehold(ref.id);
  }

  console.log('\nDone.');
}

run().catch(err => { console.error(err); process.exit(1); });
