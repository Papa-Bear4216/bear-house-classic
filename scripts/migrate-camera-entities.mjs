// One-time migration: seed floorplan rooms with camera entities into Firestore.
// Run with: node scripts/migrate-camera-entities.mjs <HOUSEHOLD_ID>
// Or omit the argument to patch all households that already have floorplan docs.

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const SERVICE_ACCOUNT = JSON.parse(
  readFileSync('C:/Users/micha/Downloads/prime-mechanic-463314-m8-firebase-adminsdk-fbsvc-fe090352d6.json', 'utf8')
);

initializeApp({ credential: cert(SERVICE_ACCOUNT) });
const db = getFirestore();

const CAMERA_MAP = {
  'Kitchen':      'camera.wyze_cam_kitchen_cam_snapshot',
  'Laundry':      'camera.wyze_cam_laundry_room_snapshot',
  'Bar':          'camera.wyze_cam_bar_cam_snapshot',
  'Living Room':  'camera.wyze_cam_bar_cam_snapshot',
  'Foyer':        'camera.wyze_cam_front_door_cam_snapshot',
  'Hall':         'camera.wyze_cam_traffic_cam_snapshot',
  "Abriana's Room": 'camera.wyze_cam_manas_room_snapshot',
};

const HALL_POLYGON = [
  { x: 682, y: 272 }, { x: 731, y: 272 }, { x: 731, y: 433 },
  { x: 691, y: 433 }, { x: 691, y: 567 }, { x: 651, y: 567 },
  { x: 651, y: 433 }, { x: 603, y: 433 }, { x: 603, y: 331 },
  { x: 682, y: 331 },
];

const SEED_ROOMS = [
  { name: 'Kitchen',         x: 20,  y: 20,  w: 315, h: 118, color: '#dbeafe' },
  { name: 'Laundry',         x: 20,  y: 138, w: 186, h: 112, color: '#e0f2fe' },
  { name: 'Bar',             x: 206, y: 138, w: 149, h: 168, color: '#fef3c7' },
  { name: 'Storage',         x: 20,  y: 306, w: 82,  h: 254, color: '#f1f5f9' },
  { name: 'Dining Area',     x: 102, y: 306, w: 233, h: 254, color: '#dcfce7' },
  { name: 'Living Room',     x: 355, y: 20,  w: 248, h: 378, color: '#ede9fe' },
  { name: 'Foyer',           x: 355, y: 398, w: 88,  h: 162, color: '#fce7f3' },
  { name: 'Foyer Closet',    x: 443, y: 398, w: 40,  h: 90,  color: '#f1f5f9' },
  { name: 'Hall Bath',       x: 603, y: 20,  w: 79,  h: 81,  color: '#e0f2fe' },
  { name: 'Master Walk-In Closet', x: 603, y: 101, w: 79, h: 66, color: '#f1f5f9' },
  { name: 'Primary Bath',    x: 603, y: 167, w: 79,  h: 164, color: '#e0f2fe' },
  { name: 'Master Bedroom',  x: 682, y: 20,  w: 252, h: 252, color: '#ffedd5' },
  { name: 'Hall',            x: 603, y: 272, w: 128, h: 295, color: '#f8fafc', points: HALL_POLYGON },
  { name: "Abriana's Room",  x: 731, y: 272, w: 203, h: 161, color: '#ffedd5' },
  { name: "Julia's Room",    x: 483, y: 433, w: 168, h: 134, color: '#ffedd5' },
  { name: 'Hall Closet 1',   x: 691, y: 433, w: 40,  h: 67,  color: '#f1f5f9' },
  { name: 'Hall Closet 2',   x: 691, y: 500, w: 40,  h: 67,  color: '#f1f5f9' },
  { name: 'Guest Room',      x: 731, y: 433, w: 203, h: 134, color: '#ffedd5' },
];

async function patchHousehold(householdId) {
  const col = db.collection('households').doc(householdId).collection('floorplan');
  const existing = await col.get();

  if (existing.size > 0) {
    // Rooms exist — just patch camera entities
    console.log(`  ${existing.size} rooms found, patching camera entities...`);
    const batch = db.batch();
    let patched = 0;
    for (const doc of existing.docs) {
      const entity = CAMERA_MAP[doc.data().name];
      if (entity) {
        batch.update(doc.ref, { cameraEntity: entity });
        console.log(`    ✓ ${doc.data().name} → ${entity}`);
        patched++;
      }
    }
    if (patched > 0) await batch.commit();
    console.log(`  Patched ${patched} room(s).`);
  } else {
    // No rooms — seed them all
    console.log(`  No rooms found, seeding ${SEED_ROOMS.length} rooms...`);
    const batch = db.batch();
    for (const room of SEED_ROOMS) {
      const ref = col.doc();
      const entity = CAMERA_MAP[room.name];
      batch.set(ref, { ...room, ...(entity ? { cameraEntity: entity } : {}), createdAt: FieldValue.serverTimestamp() });
      console.log(`    + ${room.name}${entity ? ` → ${entity}` : ''}`);
    }
    await batch.commit();
    console.log(`  Seeded ${SEED_ROOMS.length} rooms.`);
  }
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
