import { supabase } from './sync';

export type HouseholdRole = 'superadmin' | 'admin' | 'child' | 'pet';

export interface HouseholdMember {
  id: string;
  householdId: string;
  name: string;
  email: string | null;
  role: HouseholdRole;
  color: string;
}

export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
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

export async function getHouseholdSession(): Promise<{ member: HouseholdMember; householdId: string } | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;

  const { data, error } = await supabase
    .from('household_members')
    .select('id, household_id, name, email, role, color')
    .eq('auth_user_id', session.user.id)
    .maybeSingle();

  if (error) console.warn('getHouseholdSession: household_members lookup failed:', error.message);
  if (error || !data) return null;

  return {
    householdId: data.household_id,
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
