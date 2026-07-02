import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const SERVICE_ACCOUNT = JSON.parse(
  readFileSync('C:/Users/micha/Downloads/prime-mechanic-463314-m8-firebase-adminsdk-fbsvc-fe090352d6.json', 'utf8')
);

initializeApp({ credential: cert(SERVICE_ACCOUNT) });
const db = getFirestore();

async function run() {
  const households = await db.collection('households').listDocuments();
  console.log('Household doc IDs:', households.map(d => d.id));

  for (const ref of households) {
    const subcols = await ref.listCollections();
    console.log(`\n${ref.id} subcollections:`, subcols.map(c => c.id));
    for (const col of subcols) {
      const docs = await col.get();
      console.log(`  ${col.id}: ${docs.size} docs`);
      docs.forEach(d => console.log(`    ${d.id}:`, JSON.stringify(d.data()).slice(0, 120)));
    }
  }
}

run().catch(err => { console.error(err); process.exit(1); });
