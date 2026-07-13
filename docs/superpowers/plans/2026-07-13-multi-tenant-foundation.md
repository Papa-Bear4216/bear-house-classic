# Multi-Tenant Foundation (Households, Supabase Auth, Roles) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded 4-user family and unverified client-side "auth" with real Supabase Auth, household-scoped data, and a `household_members` role table — with zero downtime and zero data loss on the live production app.

**Architecture:** Additive-first migration. New tables (`households`, `household_members`) and a nullable `household_id` column on `family_data` land alongside the existing hardcoded system with **no RLS changes**. Supabase Auth is introduced next, running side-by-side with the old Google-JWT-decode path. Only once reads/writes are verified working on an authenticated session does RLS tighten to `auth.uid()`-scoped policies. The old hardcoded `USERS`/`FAMILY` arrays and PIN localStorage hack are removed last, after the new path is proven in production.

**Tech Stack:** Supabase (Postgres + Auth), `@supabase/supabase-js` (already a dependency), React Router v6, Vite + React 18 (existing stack — no new frontend framework).

## Global Constraints

- Roles are exactly `superadmin` | `admin` | `child` | `pet` — no new role values, no renaming.
- Pets never authenticate: `household_members.auth_user_id` and `.email` are always null for `role = 'pet'`.
- No RLS policy change may ship before the corresponding read/write path has been verified to work over an authenticated Supabase session (see Task ordering below) — flipping RLS early breaks `src/lib/sync.ts`'s anon-key read/realtime path, which is currently load-bearing for the entire app.
- The existing hardcoded family (`Daddy`/`Mommy`/`Abriana`/`Julia`/`Lucy` in `src/lib/familyos.ts:4-9,26-35`) must be backfilled as "household #1" — no data loss, no requirement that the real family re-signs-up from scratch.
- Dashboard stays at route `/`; new routes are `/login` and `/setup` (landing page at `/welcome` is out of scope for this plan — see the separate landing-page plan).
- This app has no test runner configured (`package.json` has no `test` script, no vitest/jest). Do not introduce one as a side effect of this plan. Verification is via `npm run build` (typecheck) plus manual/scripted end-to-end checks described in each task — do not skip the e2e check by only running the build.
- Every task must leave the live app deployable and working — no task may intentionally break `www.hotmessexpress.lol` mid-plan. If a task's change is only safe once a later task lands, note that dependency explicitly in the task (this plan is written so that isn't necessary — each task is independently shippable).

---

### Task 1: Additive schema — households, household_members, nullable household_id

**Files:**
- Create: `supabase/migrations/<timestamp>_multi_tenant_foundation.sql` (use `supabase migration new multi_tenant_foundation` to get the correctly-timestamped filename — do not hand-invent the timestamp)
- Modify: none (no application code touches this table yet)

**Interfaces:**
- Produces: `households(id uuid pk, name text, stripe_customer_id text null, stripe_subscription_id text null, subscription_status text not null default 'none', created_at timestamptz default now())`
- Produces: `household_members(id uuid pk, household_id uuid not null references households(id), auth_user_id uuid null references auth.users(id), name text not null, email text null, role text not null check (role in ('superadmin','admin','child','pet')), color text not null, pin_hash text null, created_at timestamptz default now())`
- Produces: `family_data.household_id uuid null references households(id)` (nullable — existing rows are not yet backfilled in this task)

- [ ] **Step 1: Create the migration file**

Run:
```bash
supabase migration new multi_tenant_foundation
```
Expected: prints the created path, e.g. `supabase/migrations/20260713120000_multi_tenant_foundation.sql`. Use that exact generated filename for the rest of this task — do not guess the timestamp yourself.

- [ ] **Step 2: Write the schema SQL**

Open the generated file and write:

```sql
-- households: one row per signed-up family
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text not null default 'none',
  created_at timestamptz not null default now()
);

-- household_members: replaces the hardcoded USERS/FAMILY arrays with real rows
create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text,
  role text not null check (role in ('superadmin', 'admin', 'child', 'pet')),
  color text not null default 'slate',
  pin_hash text,
  created_at timestamptz not null default now()
);

create index household_members_household_id_idx on public.household_members(household_id);
create index household_members_auth_user_id_idx on public.household_members(auth_user_id);

-- family_data gets a nullable household_id — NOT backfilled yet, NOT NOT NULL yet.
-- RLS on family_data is intentionally left unchanged in this task (see plan header).
alter table public.family_data add column household_id uuid references public.households(id);

-- RLS on the two new tables: enabled now (they're brand new, no legacy anon
-- readers depend on them), scoped to household membership.
alter table public.households enable row level security;
alter table public.household_members enable row level security;

create policy "members read own household" on public.households
  for select
  to authenticated
  using (
    id in (select household_id from public.household_members where auth_user_id = (select auth.uid()))
  );

create policy "members read own household roster" on public.household_members
  for select
  to authenticated
  using (
    household_id in (select household_id from public.household_members where auth_user_id = (select auth.uid()))
  );
```

- [ ] **Step 3: Apply locally and check for errors**

Run:
```bash
supabase db query < supabase/migrations/<generated-filename>.sql
```
(Substitute the exact filename from Step 1.) Expected: no errors printed.

If the CLI version doesn't support `db query` (requires v2.79.0+), use the Supabase MCP `execute_sql` tool instead with the same SQL.

- [ ] **Step 4: Run advisors**

Run: `supabase db advisors` (or MCP `get_advisors` if the CLI is older than v2.81.3).
Expected: no new high-severity findings introduced by this migration (existing unrelated findings on other tables are out of scope for this task).

- [ ] **Step 5: Verify via a manual query**

Run (via `psql`, `supabase db query`, or MCP `execute_sql`):
```sql
select table_name from information_schema.tables where table_schema = 'public' and table_name in ('households', 'household_members');
```
Expected: both rows returned.

```sql
select column_name from information_schema.columns where table_name = 'family_data' and column_name = 'household_id';
```
Expected: one row returned.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): add households and household_members tables

Additive-only migration — no existing tables' RLS changes, no data
backfilled yet. Lays groundwork for multi-tenant auth."
```

---

### Task 2: Backfill household #1 from the hardcoded family

**Files:**
- Create: `supabase/migrations/<timestamp>_backfill_household_one.sql`
- Read (reference only, do not modify): `src/lib/familyos.ts:4-9` (`USERS`), `src/lib/familyos.ts:26-35` (`FAMILY`)

**Interfaces:**
- Consumes: `households`, `household_members`, `family_data.household_id` from Task 1.
- Produces: one `households` row (fixed id you choose, e.g. via a `select gen_random_uuid()` captured into a variable — see Step 2) representing the real family; 5 `household_members` rows (`Daddy`/superadmin, `Mommy`/admin, `Abriana`/child, `Julia`/child, `Lucy`/pet); every existing `family_data` row's `household_id` set to that household's id.

- [ ] **Step 1: Create the migration file**

```bash
supabase migration new backfill_household_one
```

- [ ] **Step 2: Write the backfill SQL**

```sql
-- Backfill: turn the existing hardcoded family into household #1.
-- auth_user_id is left null for every member here — Task 4 (Supabase Auth
-- rollout) links these rows to real auth.users rows once each person signs
-- in for the first time under the new system.
do $$
declare
  v_household_id uuid;
begin
  insert into public.households (name, subscription_status)
  values ('Hebert House', 'active')
  returning id into v_household_id;

  insert into public.household_members (household_id, name, email, role, color) values
    (v_household_id, 'Daddy', 'michael711hebert@gmail.com', 'superadmin', 'indigo'),
    (v_household_id, 'Mommy', 'hpfanatic009@gmail.com', 'admin', 'pink'),
    (v_household_id, 'Abriana', 'littlebear8998@gmail.com', 'child', 'purple'),
    (v_household_id, 'Julia', 'jchebert2010@gmail.com', 'child', 'blue'),
    (v_household_id, 'Lucy', null, 'pet', 'amber');

  update public.family_data set household_id = v_household_id where household_id is null;
end $$;
```

Note: `subscription_status = 'active'` for this backfilled household is intentional — the existing family is grandfathered in without needing to run Stripe checkout (billing plan handles new signups going forward; do not gate the existing family behind the billing plan's checkout flow).

- [ ] **Step 2: Apply and verify**

Run via `supabase db query` or MCP `execute_sql`.

Verify:
```sql
select count(*) from public.household_members;
```
Expected: `5`.

```sql
select count(*) from public.family_data where household_id is null;
```
Expected: `0`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): backfill existing family as household #1

Grandfathers the real family in with subscription_status='active' so
they aren't blocked behind Stripe checkout."
```

---

### Task 3: Environment cleanup — remove hardcoded Supabase credentials from source

**Files:**
- Modify: `src/lib/sync.ts:3-6`
- Modify: `api/_db.ts:5`
- Modify: `.env.local` (already has `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` per prior session — add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the Vite client bundle)

**Interfaces:**
- Produces: `src/lib/sync.ts` exports the same `supabase` client, now constructed from `import.meta.env.VITE_SUPABASE_URL` / `import.meta.env.VITE_SUPABASE_ANON_KEY` instead of literals.

- [ ] **Step 1: Add Vite-exposed env vars**

Add to `.env.local` (values are the same Supabase project already in use):
```
VITE_SUPABASE_URL=https://zjialvdolbkccduuwsck.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqaWFsdmRvbGJrY2NkdXV3c2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4NzEwNTcsImV4cCI6MjA5OTQ0NzA1N30.rSsMqUCWem2_xE0TXTZ8m4HhcS51QIMKrRkRgNYdPMk
```
(Vite requires the `VITE_` prefix to expose a var to client code — `SUPABASE_ANON_KEY` without the prefix, already present for the server-side `api/*.ts` functions, is untouched.)

- [ ] **Step 2: Update `src/lib/sync.ts`**

```typescript
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

- [ ] **Step 3: Update `api/_db.ts:5`**

Change:
```typescript
const SUPABASE_URL = 'https://zjialvdolbkccduuwsck.supabase.co';
```
to:
```typescript
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zjialvdolbkccduuwsck.supabase.co';
```
(Keep the literal as a fallback so this task alone can't break production if the env var isn't set yet — remove the fallback in a later cleanup once `SUPABASE_URL` is confirmed set in Vercel.)

- [ ] **Step 4: Add `SUPABASE_URL` to Vercel**

Run:
```bash
printf '%s' "https://zjialvdolbkccduuwsck.supabase.co" | vercel env add SUPABASE_URL production
printf '%s' "https://zjialvdolbkccduuwsck.supabase.co" | vercel env add SUPABASE_URL preview
```

- [ ] **Step 5: Build and verify locally**

Run: `npm run build`
Expected: build succeeds with no errors.

Run: `npm run dev`, open the app in a browser, confirm data still loads (existing tasks/shopping list appear) — this proves the env-var-based client still connects to the same Supabase project.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sync.ts api/_db.ts .env.local
git commit -m "refactor(config): read Supabase URL/anon key from env instead of hardcoding

No behavior change — same project, now sourced from VITE_SUPABASE_URL
so RLS-era client config isn't committed to source."
```

---

### Task 4: Supabase Auth rollout — sign-in via Supabase, session resolved from household_members

**Files:**
- Create: `src/lib/householdAuth.ts`
- Create: `src/pages/Login.tsx` (new page-level login, distinct from the existing modal-style `src/components/familyos/Login.tsx` which this task deprecates but does not yet delete)
- Modify: `src/contexts/AppContext.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `getHouseholdSession(): Promise<{ member: HouseholdMember; householdId: string } | null>` in `householdAuth.ts`, where `HouseholdMember = { id: string; householdId: string; name: string; email: string | null; role: 'superadmin' | 'admin' | 'child' | 'pet'; color: string }`.
- Produces: `signInWithGoogle(): Promise<void>` and `signOut(): Promise<void>` in `householdAuth.ts`, wrapping `supabase.auth.signInWithOAuth({ provider: 'google' })` / `supabase.auth.signOut()`.
- Consumes: `supabase` client from `src/lib/sync.ts` (Task 3).
- Modifies `AppContext` to expose the same `currentUser`/`currentRole`/`logout` shape consumers already use (`AppLayout.tsx:71-73` and others), but backed by `getHouseholdSession()` instead of the hardcoded `USERS` array — **no consumer of `useAppContext()` needs to change** in this task.

- [ ] **Step 1: Write `src/lib/householdAuth.ts`**

```typescript
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

export async function getHouseholdSession(): Promise<{ member: HouseholdMember; householdId: string } | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;

  const { data, error } = await supabase
    .from('household_members')
    .select('id, household_id, name, email, role, color')
    .eq('auth_user_id', session.user.id)
    .maybeSingle();

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

export function onAuthStateChange(cb: (loggedIn: boolean) => void): () => void {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(!!session);
  });
  return () => subscription.unsubscribe();
}
```

- [ ] **Step 2: Link the backfilled Daddy row to the real Google auth user**

This is a one-time manual data step, not application code: after Daddy first signs in with Google via the new flow (Step 5 below will make this possible), run:
```sql
update public.household_members
set auth_user_id = (select id from auth.users where email = 'michael711hebert@gmail.com')
where email = 'michael711hebert@gmail.com' and auth_user_id is null;
```
Repeat per-member as each person first signs in. (A self-service "claim my row on first login" flow is deferred to a follow-up — for this plan, the household superadmin runs this SQL for each existing member once, since there are only 5.)

- [ ] **Step 3: Update `AppContext` to resolve from `household_members`**

Replace the contents of `src/contexts/AppContext.tsx` with:

```typescript
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getHouseholdSession, signOut, HouseholdMember, HouseholdRole } from '@/lib/householdAuth';

interface AppContextType {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  currentUser: HouseholdMember | null;
  currentRole: HouseholdRole | null;
  householdId: string | null;
  loading: boolean;
  logout: () => void;
}

const defaultAppContext: AppContextType = {
  sidebarOpen: false,
  toggleSidebar: () => {},
  currentUser: null,
  currentRole: null,
  householdId: null,
  loading: true,
  logout: () => {},
};

const AppContext = createContext<AppContextType>(defaultAppContext);

export const useAppContext = () => useContext(AppContext);

export const AppProvider: React.FC<{ children: React.ReactNode; onLogout?: () => void }> = ({ children, onLogout }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<HouseholdMember | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHouseholdSession().then((result) => {
      setCurrentUser(result?.member ?? null);
      setHouseholdId(result?.householdId ?? null);
      setLoading(false);
    });
  }, []);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);

  const logout = useCallback(() => {
    signOut();
    setCurrentUser(null);
    setHouseholdId(null);
    if (onLogout) onLogout();
  }, [onLogout]);

  const currentRole = currentUser?.role ?? null;

  return (
    <AppContext.Provider
      value={{ sidebarOpen, toggleSidebar, currentUser, currentRole, householdId, loading, logout }}
    >
      {children}
    </AppContext.Provider>
  );
};
```

Note: `currentUser.color` and `currentUser.name` keep the same field names existing consumers already read (e.g. `AppLayout.tsx:233` reads `currentUser.color`, `:264` reads `currentUser?.name`) — this is a drop-in replacement for those call sites, no changes needed there.

- [ ] **Step 4: Write `src/pages/Login.tsx`**

```tsx
import { Button } from '@/components/ui/button';
import { signInWithGoogle } from '@/lib/householdAuth';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-6 px-4">
      <div className="text-3xl font-bold text-white">🐻 Bear House</div>
      <p className="text-slate-400 text-sm">Sign in to your household</p>
      <Button onClick={() => signInWithGoogle()} size="lg">
        Sign in with Google
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Update `src/App.tsx` to gate on Supabase Auth session instead of `getSession()`**

```tsx
import { useState, useCallback, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import LoginPage from "@/pages/Login";
import { onAuthStateChange, getHouseholdSession } from "@/lib/householdAuth";
import { pullFromCloud, subscribeToRealtime } from "@/lib/sync";

const queryClient = new QueryClient();

const App = () => {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [syncReady, setSyncReady] = useState(false);

  useEffect(() => {
    getHouseholdSession().then((result) => setAuthed(!!result));
    const unsubAuth = onAuthStateChange((loggedIn) => {
      if (!loggedIn) setAuthed(false);
    });
    return unsubAuth;
  }, []);

  useEffect(() => {
    pullFromCloud().finally(() => setSyncReady(true));
    const unsub = subscribeToRealtime();
    return unsub;
  }, []);

  const handleLogout = useCallback(() => setAuthed(false), []);

  if (authed === null || !syncReady) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400 text-sm animate-pulse">Loading Family OS…</div>
      </div>
    );
  }

  if (!authed) {
    return (
      <ThemeProvider defaultTheme="dark">
        <LoginPage />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider defaultTheme="dark">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index onLogout={handleLogout} />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

export default App;
```

Note: the old `src/components/familyos/Login.tsx` (Google-JWT-decode + PIN fallback) is left in place but unused after this task — do not delete it yet. Task 7 removes it once the new path is proven in production.

- [ ] **Step 6: Enable Google provider in Supabase Auth**

This is a dashboard/CLI config step, not code: in the Supabase dashboard under Authentication → Providers, enable Google and set the OAuth client ID/secret (reuse the existing `VITE_GOOGLE_CLIENT_ID/GOOGLE_CLIENT_ID` values already used by the old flow — check `src/lib/auth.ts:4-13` for the client ID currently in use). Add the Supabase-provided redirect URI to the Google Cloud Console OAuth client's authorized redirect URIs.

- [ ] **Step 7: Build and manually verify end-to-end**

Run: `npm run build` — expect success.

Run: `npm run dev`, open the app:
1. Confirm you're redirected to the new `/` → login page (not the old modal).
2. Click "Sign in with Google," complete OAuth.
3. Run the Step 2 SQL to link your `auth_user_id` if not already linked.
4. Refresh — confirm the dashboard loads and shows your name/color correctly (proves `AppContext` resolves from `household_members`).
5. Sign out — confirm you're returned to the login page.

- [ ] **Step 8: Commit**

```bash
git add src/lib/householdAuth.ts src/pages/Login.tsx src/contexts/AppContext.tsx src/App.tsx
git commit -m "feat(auth): roll out Supabase Auth alongside existing session system

AppContext now resolves currentUser/currentRole from household_members
via a real Supabase Auth session. Old Google-JWT-decode Login component
is left in place (unused) until Task 7 removes it."
```

---

### Task 5: Household-scope all data reads/writes

**Files:**
- Modify: `api/_db.ts`
- Modify: `api/data-write.ts`
- Modify: `src/lib/sync.ts`
- Modify: `src/lib/familyos.ts:89-109` (`loadJSON`/`saveJSON`)

**Interfaces:**
- Consumes: `getHouseholdSession()` from Task 4, `household_id` column from Task 1/2.
- Produces: `dbGet(key: string, householdId: string)`, `dbSet(key: string, value: any, householdId: string)`, `dbPrepend(key: string, item: object, householdId: string)` in `api/_db.ts` — **signature change**, every call site must pass `householdId`.
- Produces: `pullFromCloud(householdId: string)`, `pushToCloud(key: string, value: unknown, householdId: string)` in `src/lib/sync.ts` — **signature change**.

- [ ] **Step 1: Update `api/_db.ts` to filter/write by `household_id`**

```typescript
/**
 * Supabase REST helpers — no SDK, pure fetch, works in Edge Functions.
 * Underscore prefix means Vercel won't expose this as a route.
 */
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zjialvdolbkccduuwsck.supabase.co';

function headers(anonKey: string) {
  return {
    'apikey': anonKey,
    'Authorization': `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
  };
}

/** Read a value by key, scoped to a household, from family_data table */
export async function dbGet(key: string, householdId: string): Promise<any> {
  const anonKey = process.env.SUPABASE_ANON_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/family_data?key=eq.${encodeURIComponent(key)}&household_id=eq.${encodeURIComponent(householdId)}&select=value`,
    { headers: headers(anonKey) }
  );
  if (!res.ok) return null;
  const rows = await res.json() as any[];
  return rows[0]?.value ?? null;
}

/** Upsert a value by key + household into family_data table */
export async function dbSet(key: string, value: any, householdId: string): Promise<void> {
  const anonKey = process.env.SUPABASE_ANON_KEY!;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/family_data`, {
    method: 'POST',
    headers: { ...headers(anonKey), 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({ key, value, household_id: householdId }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`dbSet(${key}) failed: ${res.status} ${detail}`);
  }
}

/** Prepend one item to an array stored at key (read-modify-write), scoped to household */
export async function dbPrepend(key: string, item: object, householdId: string): Promise<void> {
  const existing: any[] = (await dbGet(key, householdId)) ?? [];
  const arr = Array.isArray(existing) ? existing : [];
  await dbSet(key, [item, ...arr], householdId);
}
```

Note: `family_data`'s unique/merge-duplicates key is currently just `key` (see the existing `Prefer: resolution=merge-duplicates` header) — this task assumes the underlying unique constraint becomes `(key, household_id)`. Add this as part of Task 1's migration if not already covered:

```sql
-- Add to Task 1's migration file (append, don't create a separate migration for this):
alter table public.family_data drop constraint if exists family_data_key_key;
alter table public.family_data add constraint family_data_key_household_id_key unique (key, household_id);
```
(If Task 1 already shipped without this, create a new small migration now via `supabase migration new family_data_unique_key_household` with just this ALTER.)

- [ ] **Step 2: Find and update every `api/*.ts` call site of `dbGet`/`dbSet`/`dbPrepend`**

Run:
```bash
grep -rn "dbGet\|dbSet\|dbPrepend" api/ --include="*.ts" | grep -v "_db.ts"
```
For each call site found, thread a `householdId` parameter through from the calling endpoint's request (the household id must come from the authenticated session — for webhook-triggered endpoints like `api/finance.ts`'s `sync` action, the connection record itself is already household-scoped once Task 1's schema lands, so read `householdId` from wherever that endpoint already resolves its calling household — e.g. via a `household_id` column added to `simplefin_access`'s stored value, or via a `householdId` request param passed from the authenticated client). Update each call site's function signature to accept and pass `householdId`.

(This step's exact diff depends on what `grep` finds — do not guess call sites; enumerate them for real and update each one, keeping this task's commit scoped to "thread household_id through api/_db.ts consumers.")

- [ ] **Step 3: Update `src/lib/sync.ts`**

```typescript
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let syncEnabled = false;
let currentHouseholdId: string | null = null;
const listeners: Set<() => void> = new Set();

export function onSyncUpdate(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notifyListeners() {
  listeners.forEach(cb => cb());
}

// Pull all keys for one household from Supabase into localStorage
export async function pullFromCloud(householdId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('family_data')
      .select('key, value')
      .eq('household_id', householdId);
    if (error) { console.warn('Sync pull failed:', error.message); return; }
    for (const row of data ?? []) {
      localStorage.setItem(row.key, JSON.stringify(row.value));
    }
    currentHouseholdId = householdId;
    syncEnabled = true;
    notifyListeners();
  } catch (e) {
    console.warn('Sync unavailable, running offline');
  }
}

const WRITE_SECRET = import.meta.env.VITE_DATA_WRITE_SECRET || '';

export async function pushToCloud(key: string, value: unknown): Promise<boolean> {
  if (!syncEnabled || !currentHouseholdId) return false;
  try {
    const res = await fetch('/api/data-write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-write-secret': WRITE_SECRET },
      body: JSON.stringify({ key, value, householdId: currentHouseholdId }),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({ error: res.statusText }));
      console.warn(`Sync push failed for "${key}": ${res.status} ${detail.error || ''}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`Sync push failed for "${key}" (network):`, e);
    return false;
  }
}

// Subscribe to real-time changes from other devices in the same household
export function subscribeToRealtime(householdId: string): () => void {
  const channel = supabase
    .channel('family_data_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'family_data', filter: `household_id=eq.${householdId}` },
      (payload) => {
        if (payload.new && typeof payload.new === 'object' && 'key' in payload.new) {
          const row = payload.new as { key: string; value: unknown };
          localStorage.setItem(row.key, JSON.stringify(row.value));
          notifyListeners();
        }
      }
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

export function isSyncEnabled() { return syncEnabled; }
```

- [ ] **Step 4: Update `api/data-write.ts` to accept and store `householdId`**

Read the existing file first (it currently reads `key`/`value` from the request body and calls `dbSet`) and update its request body parsing to also read `householdId`, passing it through to `dbSet(key, value, householdId)` from Task 5 Step 1.

- [ ] **Step 5: Update `src/App.tsx` to pass `householdId` into sync calls**

In `src/App.tsx`, the `pullFromCloud()`/`subscribeToRealtime()` calls need a `householdId` — this is only known after `getHouseholdSession()` resolves. Restructure the effect:

```tsx
useEffect(() => {
  getHouseholdSession().then((result) => {
    setAuthed(!!result);
    if (result?.householdId) {
      pullFromCloud(result.householdId).finally(() => setSyncReady(true));
      const unsub = subscribeToRealtime(result.householdId);
      // store unsub in a ref or state if cleanup is needed on logout — for
      // this task, rely on full page reload on logout (existing behavior
      // already reloads via handleLogout's setAuthed(false) triggering the
      // login screen, which is acceptable here).
    } else {
      setSyncReady(true);
    }
  });
  const unsubAuth = onAuthStateChange((loggedIn) => {
    if (!loggedIn) setAuthed(false);
  });
  return unsubAuth;
}, []);
```

- [ ] **Step 6: Update `src/lib/familyos.ts` `saveJSON`**

`saveJSON` (`src/lib/familyos.ts:102-109`) calls `pushToCloud(key, value)` — this already matches the new no-householdId-param signature from Step 3 above (household id is now tracked internally in `sync.ts` via `currentHouseholdId`), so **no change needed here**. Confirm by reading the current file that the call site is still `pushToCloud(key, value)` with exactly two arguments.

- [ ] **Step 7: Build and manually verify end-to-end**

Run: `npm run build` — expect success.

Run: `npm run dev`:
1. Sign in as the backfilled Daddy account.
2. Add a task. Confirm it appears (proves write path works with `household_id`).
3. Open Supabase dashboard (or `execute_sql`), run `select * from family_data where key = 'household_tasks'` — confirm the row's `household_id` matches the backfilled household's id.
4. Open a second browser (or incognito) and manually create a second test household in SQL with a throwaway task under a different `household_id` — confirm it does NOT appear in the first browser's task list (proves scoping actually isolates data, not just that writes succeed).

- [ ] **Step 8: Commit**

```bash
git add api/_db.ts api/data-write.ts src/lib/sync.ts src/App.tsx supabase/migrations/
git commit -m "feat(db): thread household_id through all data reads/writes

pullFromCloud/subscribeToRealtime/dbGet/dbSet/dbPrepend all now scope
to a household_id. Verified two different households' data does not
cross-contaminate."
```

---

### Task 6: Tighten RLS to household-scoped `auth.uid()` policies

**Files:**
- Create: `supabase/migrations/<timestamp>_tighten_family_data_rls.sql`

**Interfaces:**
- Consumes: verified-working authenticated read/write path from Task 5.

- [ ] **Step 1: Confirm the prerequisite before starting this task**

Do not start this task unless Task 5's Step 7 end-to-end verification has passed in the actual running app (not just in theory) — this task removes the safety net Task 5 was verified against. If Task 5 hasn't been manually verified working, stop and complete it first.

- [ ] **Step 2: Create the migration**

```bash
supabase migration new tighten_family_data_rls
```

- [ ] **Step 3: Write the RLS-tightening SQL**

```sql
-- Prior policy (from docs/fix-family-data-rls.sql) allowed anon read of
-- everything. Replace with household-scoped, authenticated-only access.
drop policy if exists "anon can read family_data" on public.family_data;
drop policy if exists "public read" on public.family_data;
-- (drop whatever the existing prior-fix policy is actually named — check
-- `select policyname from pg_policies where tablename = 'family_data';`
-- first and substitute the real name(s) here before applying.)

alter table public.family_data enable row level security;

create policy "members read own household data" on public.family_data
  for select
  to authenticated
  using (
    household_id in (select household_id from public.household_members where auth_user_id = (select auth.uid()))
  );

-- Writes still go through the server-side service_role endpoint
-- (api/data-write.ts), which bypasses RLS by design — no authenticated
-- write policy is added here, matching the existing security model.
```

- [ ] **Step 4: Check existing policy names before applying**

Run:
```sql
select policyname from pg_policies where tablename = 'family_data';
```
Update Step 3's `drop policy if exists` lines to match the actual names returned — do not apply Step 3's SQL verbatim without this check.

- [ ] **Step 5: Apply and run advisors**

Apply via `supabase db query` or MCP `execute_sql`. Then run `supabase db advisors` (or MCP `get_advisors`) — expect no new high-severity RLS findings.

- [ ] **Step 6: End-to-end verify RLS isolation**

1. Sign in as Daddy in the browser. Confirm the dashboard still loads all existing data (proves the new authenticated policy correctly allows same-household reads).
2. Using a second Supabase Auth test user manually linked to a different `household_members` row (create one via SQL for this test, matching Task 2's pattern), sign in as that user and confirm `pullFromCloud` returns zero rows for the real family's data (proves isolation).
3. Confirm the anon key alone (no session) can no longer read `family_data` — test with:
   ```bash
   curl "https://zjialvdolbkccduuwsck.supabase.co/rest/v1/family_data?select=key" -H "apikey: <anon key>"
   ```
   Expected: empty array `[]` (RLS blocks unauthenticated reads now).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): tighten family_data RLS to household-scoped auth.uid() policies

Verified: same-household reads still work, cross-household reads
return nothing, anon-key-only access is blocked. This was staged
last, after Task 5 proved the authenticated read path works, per
the RLS-last sequencing constraint in this plan's Global Constraints."
```

---

### Task 7: Remove the old hardcoded auth path

**Files:**
- Delete: `src/components/familyos/Login.tsx`
- Modify: `src/lib/familyos.ts` (remove `USERS`, `UserRole`, `getSession`, `setSession`, `clearSession`, `FAMILY` — keep everything else: `KEYS`, `DEFAULT_SETTINGS`, `DEFAULT_PRESENCE_ZONES`, `DEFAULT_PILLARS`, `ACTIVITY_TEMPLATES`, `TASK_CATEGORIES`, etc. remain, since they're generic constants/helpers unrelated to auth)
- Modify: `src/lib/auth.ts` (delete entirely if nothing outside the old Login component used it — verify with grep first)

**Interfaces:**
- Removes: `USERS`, `UserRole`, `User`, `getSession`, `setSession`, `clearSession`, `FAMILY`, `canDelete`, `isSuperAdmin`, `isAdmin` from `src/lib/familyos.ts` — confirm nothing outside `AppContext`/`App.tsx` (already migrated in Tasks 4-5) still imports these before deleting.

- [ ] **Step 1: Confirm no remaining consumers**

Run:
```bash
grep -rn "from '@/lib/familyos'" src/ | grep -E "USERS|UserRole|getSession|setSession|clearSession|FAMILY|canDelete|isSuperAdmin|isAdmin"
```
Expected: no results (Tasks 4-5 already migrated the only consumers, `AppContext.tsx` and `App.tsx`). If any results appear, migrate that call site to use `useAppContext()`'s `currentUser`/`currentRole` before proceeding.

- [ ] **Step 2: Delete the old Login component**

```bash
git rm src/components/familyos/Login.tsx
```

- [ ] **Step 3: Remove the auth-related exports from `src/lib/familyos.ts`**

Delete lines `src/lib/familyos.ts:1-24` (the `USERS` array, `UserRole`/`User` types, `canDelete`/`isSuperAdmin`/`isAdmin`, `getSession`/`setSession`/`clearSession`) and lines `26-35` (`FAMILY`). Leave everything from `KEYS` (line 37 in the original) onward untouched.

- [ ] **Step 4: Check `src/lib/auth.ts` for remaining use**

Run:
```bash
grep -rln "from '@/lib/auth'\|from './auth'" src/
```
If the only match is the now-deleted `Login.tsx`, delete the file:
```bash
git rm src/lib/auth.ts
```
If other files still import from it (e.g. Gmail/Calendar/Classroom OAuth token helpers might be reused elsewhere), keep the file and only remove this task's scope from the commit message accordingly — check the actual grep output before deciding.

- [ ] **Step 5: Build and verify**

Run: `npm run build` — expect success with no unresolved-import errors.

Run: `npm run dev`, sign in, confirm the app works exactly as it did after Task 6's verification (this task is pure removal, no behavior change expected).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(auth): remove hardcoded USERS/FAMILY arrays and old Login component

The Supabase Auth path (Tasks 4-6) has been running in production and
verified working. This removes the now-dead hardcoded-family auth
system entirely."
```

---

## Self-Review Notes

- **Spec coverage:** Households/household_members schema (Task 1), backfill (Task 2), Supabase Auth (Task 4), household-scoped data (Task 5), RLS tightening (Task 6), roles preserved unchanged throughout (no task touches `AppLayout.tsx`'s `isChild`/`isAdm` gating logic, since `currentRole` keeps the same shape). Setup/signup UI and billing are intentionally out of scope for this plan — see the separate plans.
- **RLS-last ordering:** Task 1 explicitly defers `family_data` RLS changes; Task 6 is the only task that tightens it, gated behind Task 5's verified authenticated read path — matches the sequencing constraint from this plan's header.
- **Type consistency:** `HouseholdMember`/`HouseholdRole` (Task 4) are the single source of truth used identically in Task 5's `AppContext` changes; `dbGet`/`dbSet`/`dbPrepend` signatures introduced in Task 5 Step 1 are consistent with their Task 5 Step 2 call-site update instructions.
