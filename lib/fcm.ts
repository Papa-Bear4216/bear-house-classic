'use client';

import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging';
import { initializeApp, getApps } from 'firebase/app';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import firebaseConfig from '../firebase-applet-config.json';

let messaging: Messaging | null = null;

function getMessagingInstance(): Messaging | null {
  if (typeof window === 'undefined') return null;
  try {
    const app = getApps()[0] ?? initializeApp(firebaseConfig);
    if (!messaging) messaging = getMessaging(app);
    return messaging;
  } catch {
    return null;
  }
}

export async function registerFCMToken(uid: string): Promise<{ success: boolean; token?: string; error?: string }> {
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) return { success: false, error: 'NEXT_PUBLIC_FIREBASE_VAPID_KEY not set' };

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { success: false, error: 'Permission denied' };

    // Register the service worker if not already registered
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });

    const msg = getMessagingInstance();
    if (!msg) return { success: false, error: 'Messaging not available' };

    const token = await getToken(msg, { vapidKey, serviceWorkerRegistration: registration });
    if (!token) return { success: false, error: 'Could not get FCM token' };

    // Store token in Firestore
    await setDoc(
      doc(db, 'users', uid, 'fcmTokens', token.slice(-20)),
      { token, createdAt: serverTimestamp(), userAgent: navigator.userAgent },
      { merge: true }
    );

    return { success: true, token };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export function onForegroundMessage(callback: (payload: { title?: string; body?: string; data?: Record<string, string> }) => void) {
  const msg = getMessagingInstance();
  if (!msg) return () => {};
  return onMessage(msg, (payload) => {
    callback({
      title: payload.notification?.title,
      body: payload.notification?.body,
      data: payload.data as Record<string, string> | undefined,
    });
  });
}
