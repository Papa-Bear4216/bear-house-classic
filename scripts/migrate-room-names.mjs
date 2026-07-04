// One-time migration: rename existing floorplan rooms to match the real house layout.
// Run with: node scripts/migrate-room-names.mjs <HOUSEHOLD_ID>
// Or omit the argument to patch all households that already have floorplan docs.
//
// NOTE: edit SERVICE_ACCOUNT_PATH below to point at your local Firebase service
// account JSON (the same file used by migrate-camera-entities.mjs).

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const SERVICE_ACCOUNT_PATH = 'C:/Users/micha/Downloads/prime-mechanic-463314-m8-firebase-adminsdk-fbsvc-fe090352d6.json';
const SERVICE_ACCOUNT = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

initializeApp({ credential: cert(SERVICE_ACCOUNT) });
const db = getFirestore();

// Old name -> new name. Only exact matches are renamed; everything else is left alone.
const RENAME_MAP = {
  'Primary Bath': 'Hall Bath',
  'Hall Bath': 'Primary Bath',
  'W.I.C.': 'Master Walk-In Closet',
  'Primary Bedroom': 'Master Bedroom',
  'Bedroom 2': "Abriana's Room",
  'Bedroom 3': "Julia's Room",
  'Bedroom 4': 'Guest Room',
};

async function patchHousehold(householdId) {
  const col = db.collection('households').doc(householdId).collection('floorplan');
  const existing = await col.get();

  if (existing.empty) {
    console.log('  No floorplan rooms found, nothing to rename.');
    return;
  }

  // Resolve the swap (Primary Bath <-> Hall Bath) against a snapshot of original
  // names first, so we don't rename a room twice in the same pass.
  const originalNames = new Map(existing.docs.map(d => [d.id, d.data().name]));

  const batch = db.batch();
  let patched = 0;
  for (const doc of existing.docs) {
    const oldName = originalNames.get(doc.id);
    const newName = RENAME_MAP[oldName];
    if (newName) {
      batch.update(doc.ref, { name: newName });
      console.log(`    ${oldName} -> ${newName}`);
      patched++;
    }
  }

  if (patched > 0) await batch.commit();
  console.log(`  Renamed ${patched} room(s).`);
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
