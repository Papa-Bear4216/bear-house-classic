/**
 * src/lib/push.ts — native Android push registration (FCM via Capacitor).
 *
 * registerForPush() is called once from AppContext right after the household
 * session resolves (native builds only — the guard below keeps web builds a
 * no-op). Idempotent by design: re-registering on each login just refreshes
 * updated_at server-side (token is unique), and the plugin's register() is a
 * no-op if already registered. Fire-and-forget everywhere — push plumbing must
 * never block or break app startup.
 */
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { apiUrl } from './api';
import { getAccessToken } from './householdAuth';

async function sendTokenToServer(token: string): Promise<void> {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) return; // not logged in — skip silently, retried next login
    await fetch(apiUrl('/api/register-push-token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ token, platform: 'android' }),
    });
  } catch (e) {
    // best-effort — a failed token upload must never surface to the user
    console.error('register-push-token upload failed', e);
  }
}

export async function registerForPush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return; // web build: no-op
  try {
    // Android 13+ shows the system runtime permission dialog here. If it was
    // denied before, requestPermissions resolves with 'denied' and register()
    // will simply never emit a token — handled, no crash.
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive === 'granted' || perm.receive === 'prompt') {
      await PushNotifications.register();
      void PushNotifications.addListener('registration', (reg) => {
        void sendTokenToServer(reg.value);
      });
    }
    void PushNotifications.addListener('registrationError', (err) => {
      console.error('Push registration error', err);
    });
  } catch (e) {
    console.error('registerForPush failed', e);
  }
}