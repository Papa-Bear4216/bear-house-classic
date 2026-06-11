import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

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
  getAdminApp();
  return getFirestore();
}

export function getAdminMessaging() {
  getAdminApp();
  return getMessaging();
}
