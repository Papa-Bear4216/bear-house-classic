import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App as CapacitorApp } from '@capacitor/app';
import { supabase } from './sync';

export type HouseholdRole = 'superadmin' | 'admin' | 'child' | 'pet';

const NATIVE_REDIRECT_URL = 'com.bearhouse.app://auth-callback';

export interface HouseholdMember {
  id: string;
  householdId: string;
  name: string;
  email: string | null;
  role: HouseholdRole;
  color: string;
}

/** Web: normal full-page redirect. Native (Capacitor): open the OAuth URL in
 * an in-app browser tab and catch the redirect back via the custom URL
 * scheme deep link — a generic embedded WebView cannot complete Google
 * OAuth or receive an http(s) redirect back into the app. */
export async function signInWithGoogle(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: NATIVE_REDIRECT_URL, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (data?.url) await Browser.open({ url: data.url });
    return;
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

/** Register once at app startup on native platforms. Google redirects back
 * to com.bearhouse.app://auth-callback#access_token=...; Android hands that
 * URL to this listener via the intent-filter in AndroidManifest.xml. */
export function initNativeAuthRedirect(): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  const listenerPromise = CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
    if (!url.startsWith(NATIVE_REDIRECT_URL)) return;
    await Browser.close();

    const hash = url.split('#')[1] ?? '';
    const params = new URLSearchParams(hash);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (access_token && refresh_token) {
      await supabase.auth.setSession({ access_token, refresh_token });
    }
  });

  return () => { listenerPromise.then((l) => l.remove()); };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

/** fetch() with the caller's Supabase session attached as a Bearer token — use for any
 * API route that resolves household_id server-side via resolveHouseholdId(). */
export async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

export async function getHouseholdSession(): Promise<{ member: HouseholdMember; householdId: string; subscriptionStatus: string; bypassBilling: boolean } | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;

  const { data, error } = await supabase
    .from('household_members')
    .select('id, household_id, name, email, role, color, households(subscription_status, bypass_billing)')
    .eq('auth_user_id', session.user.id)
    .maybeSingle();

  if (error) console.warn('getHouseholdSession: household_members lookup failed:', error.message);
  if (error || !data) return null;

  return {
    householdId: data.household_id,
    subscriptionStatus: (data as any).households?.subscription_status ?? 'none',
    bypassBilling: (data as any).households?.bypass_billing ?? false,
    member: {
      id: data.id,
      householdId: data.household_id,
      name: data.name,
      email: data.email,
      role: data.role as HouseholdRole,
      color: data.color,
    },
  };
}

export async function getHouseholdRoster(householdId: string): Promise<HouseholdMember[]> {
  const { data, error } = await supabase
    .from('household_members')
    .select('id, household_id, name, email, role, color')
    .eq('household_id', householdId);

  if (error) { console.warn('getHouseholdRoster: lookup failed:', error.message); return []; }

  return (data ?? []).map((row) => ({
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    email: row.email,
    role: row.role as HouseholdRole,
    color: row.color,
  }));
}

export function onAuthStateChange(cb: (loggedIn: boolean) => void): () => void {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(!!session);
  });
  return () => subscription.unsubscribe();
}
