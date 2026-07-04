import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import firebaseConfig from '../firebase-applet-config.json';

let app: App | null = null;

export function getAdminApp(): App {
  if (app) return app;

  const existing = getApps().find(a => a.name === '[DEFAULT]');
  if (existing) { app = existing; return app; }

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccount) {
    app = initializeApp({
      credential: cert(JSON.parse(serviceAccount)),
      databaseURL: `https://${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'prime-mechanic-463314-m8'}.firebaseio.com`,
    });
  } else {
    app = initializeApp({
      projectId: 'prime-mechanic-463314-m8',
    });
  }

  return app;
}

export function getAdminFirestore() {
  const adminApp = getAdminApp();
  // The client SDK (lib/firebase.ts) connects to a named Firestore database,
  // not "(default)" — the admin SDK must target the same one or every read/
  // write here silently hits an empty, unrelated database.
  return getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
}

export function getAdminMessaging() {
  getAdminApp();
  return getMessaging();
}
