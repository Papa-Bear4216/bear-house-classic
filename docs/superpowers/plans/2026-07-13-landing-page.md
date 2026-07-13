# Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a playful, energetic marketing landing page at `/welcome` describing FamilyOS's real, shipped features, honestly framed around helping overwhelmed/ADHD-style household management.

**Architecture:** A single new route (`/welcome`) rendering a static marketing page built from shadcn/ui primitives already in the codebase, with no new backend dependencies. Logged-out visitors are redirected here instead of seeing the login screen directly; a "Log in" link goes to `/login`, primary CTA goes to `/setup`.

**Tech Stack:** React Router v6 (existing), Tailwind CSS + shadcn/ui (existing), no new dependencies.

## Global Constraints

- Route is `/welcome`, not `/` — the dashboard stays at `/` per the foundation plan's routing decisions. This plan does not touch dashboard routing; it only adds `/welcome` and wires the logged-out redirect.
- **Depends on** `docs/superpowers/plans/2026-07-13-multi-tenant-foundation.md` Task 4 (so `/login` exists) for the redirect target to make sense — this plan can be built and visually verified independently before that lands, but the "Log in" link won't functionally work until Task 4 of the foundation plan ships. Do not block writing/reviewing this page on that dependency; only the final redirect-wiring step (Task 3 here) needs it.
- Copy must describe only real, shipped features: Hermes AI assistant, Chore Scanner, Finance Hub (SimpleFIN), Home Assistant cameras, Household Memory. Do not invent an "ADHD assistant" feature that doesn't exist in the codebase — reframe existing features around ADHD/overwhelm-friendly use in copy only, per the approved design spec (`docs/superpowers/specs/2026-07-13-multi-tenant-signup-design.md`).
- Tone: playful & energetic — bright accent colors, confident short sentences, light emoji use consistent with the existing "🐻 Bear House" branding (`Login.tsx:222` per prior research) — not corporate SaaS, not overly soft/cozy.
- This app has no test runner configured. Verification for this plan is visual: run the dev server and check the rendered page in a browser (see each task's verification step) — do not claim done based on `npm run build` alone for a UI-only change like this.

---

### Task 1: Landing page component and route

**Files:**
- Create: `src/pages/Welcome.tsx`
- Create: `src/components/welcome/Hero.tsx`
- Create: `src/components/welcome/FeatureGrid.tsx`
- Create: `src/components/welcome/FamilyRoles.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `<Welcome />` default export in `src/pages/Welcome.tsx`, composing `<Hero />`, `<FeatureGrid />`, `<FamilyRoles />`.
- Route: `/welcome` added to the `<Routes>` block in `src/App.tsx`, rendered **outside** the authenticated app shell (i.e. reachable regardless of auth state, unlike `/` which requires a session).

- [ ] **Step 1: Write `src/components/welcome/Hero.tsx`**

```tsx
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function Hero() {
  return (
    <section className="flex flex-col items-center text-center gap-6 px-4 py-24 max-w-2xl mx-auto">
      <div className="text-5xl">🐻</div>
      <h1 className="text-4xl sm:text-5xl font-extrabold text-white leading-tight">
        Household chaos, <span className="text-amber-400">tamed</span>.
      </h1>
      <p className="text-lg text-slate-300 max-w-lg">
        FamilyOS remembers what your brain won't — chores, bills, promises, and
        who's supposed to walk the dog. Point a camera at a mess and let AI
        figure out what needs doing.
      </p>
      <div className="flex gap-3">
        <Link to="/setup">
          <Button size="lg" className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold">
            Get Started
          </Button>
        </Link>
        <Link to="/login">
          <Button size="lg" variant="outline">
            Log in
          </Button>
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Write `src/components/welcome/FeatureGrid.tsx`**

```tsx
import { MessageCircle, Camera, Landmark, Video, Brain } from 'lucide-react';

const FEATURES = [
  {
    icon: MessageCircle,
    title: 'Hermes, your AI assistant',
    description:
      "Ask it anything. Hermes handles tasks, bills, and shopping lists so you don't have to hold it all in your head.",
    color: 'text-indigo-400',
  },
  {
    icon: Camera,
    title: 'Chore Scanner',
    description:
      "Stare at a messy room, or point your camera at it and let AI find what needs doing — no more not knowing where to start.",
    color: 'text-emerald-400',
  },
  {
    icon: Landmark,
    title: 'Finance Hub',
    description:
      'Bank sync via SimpleFIN, auto-categorized spending, and recurring bill detection — without spreadsheets.',
    color: 'text-blue-400',
  },
  {
    icon: Video,
    title: 'Home cameras, built in',
    description: 'Check in on the house right from your dashboard, powered by Home Assistant.',
    color: 'text-pink-400',
  },
  {
    icon: Brain,
    title: 'Household Memory',
    description:
      'The app remembers preferences, routines, and context, so every family member (and Hermes) stays on the same page.',
    color: 'text-amber-400',
  },
];

export function FeatureGrid() {
  return (
    <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 px-4 py-16 max-w-5xl mx-auto">
      {FEATURES.map((f) => (
        <div key={f.title} className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col gap-3">
          <f.icon className={`w-8 h-8 ${f.color}`} />
          <h3 className="text-white font-semibold">{f.title}</h3>
          <p className="text-sm text-slate-400">{f.description}</p>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 3: Write `src/components/welcome/FamilyRoles.tsx`**

```tsx
const ROLES = [
  { label: 'Superadmin', emoji: '👑', color: 'bg-indigo-500' },
  { label: 'Admin', emoji: '🛠️', color: 'bg-pink-500' },
  { label: 'Kid', emoji: '🎨', color: 'bg-blue-500' },
  { label: 'Pet', emoji: '🐾', color: 'bg-amber-500' },
];

export function FamilyRoles() {
  return (
    <section className="text-center px-4 py-16 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-white mb-2">Built for the whole family</h2>
      <p className="text-slate-400 mb-8">Every member gets a role that fits — yes, even the dog.</p>
      <div className="flex flex-wrap justify-center gap-4">
        {ROLES.map((r) => (
          <div key={r.label} className="flex flex-col items-center gap-2">
            <div className={`w-16 h-16 rounded-full ${r.color} flex items-center justify-center text-2xl`}>
              {r.emoji}
            </div>
            <span className="text-sm text-slate-300">{r.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Write `src/pages/Welcome.tsx`**

```tsx
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Hero } from '@/components/welcome/Hero';
import { FeatureGrid } from '@/components/welcome/FeatureGrid';
import { FamilyRoles } from '@/components/welcome/FamilyRoles';

export default function Welcome() {
  return (
    <div className="min-h-screen bg-slate-950">
      <Hero />
      <FeatureGrid />
      <FamilyRoles />
      <section className="text-center px-4 py-20">
        <Link to="/setup">
          <Button size="lg" className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold">
            Get Started
          </Button>
        </Link>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Add the `/welcome` route to `src/App.tsx`**

Read the current `src/App.tsx` first (its exact contents depend on whether the foundation plan's Task 4 has already landed — it may already have a `LoginPage` import and a restructured auth gate). Add the `/welcome` route so it is reachable **before** any auth check short-circuits rendering — the cleanest way is to check `window.location.pathname === '/welcome'` (or, better, wrap the top-level auth gate in a `<BrowserRouter><Routes>` that always includes a `/welcome` route regardless of auth state, with the authenticated app mounted on a separate catch-all path).

If the foundation plan has **not yet landed**, add this minimal version to the existing (pre-foundation-plan) `src/App.tsx`:
```tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Welcome from "./pages/Welcome";
// ...inside the component, wrap existing conditional auth rendering so /welcome
// is reachable even when !authed:
if (!authed) {
  return (
    <ThemeProvider defaultTheme="dark">
      <BrowserRouter>
        <Routes>
          <Route path="/welcome" element={<Welcome />} />
          <Route path="*" element={<Login onAuth={handleAuth} />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
```
This lets `/welcome` render standalone without requiring the foundation plan's auth rewrite, and is a safe intermediate state — Task 3 below revisits this once `/login` exists for real.

- [ ] **Step 6: Verify visually**

Run: `npm run dev`, navigate to `http://localhost:5173/welcome` in a browser.

Expected: hero section with "Household chaos, tamed." headline and two buttons, feature grid with 5 cards (Hermes, Chore Scanner, Finance Hub, Home cameras, Household Memory), family roles section with 4 role badges, footer CTA button. No console errors (check via browser devtools or the `read_console_messages` tool if using the Browser pane).

- [ ] **Step 7: Commit**

```bash
git add src/pages/Welcome.tsx src/components/welcome/ src/App.tsx
git commit -m "feat(welcome): add playful landing page at /welcome

Describes real shipped features (Hermes, Chore Scanner, Finance Hub,
HA cameras, Household Memory) reframed around ADHD/overwhelm-friendly
household management. Verified visually in the dev server."
```

---

### Task 2: Responsive polish and dark/light theme check

**Files:**
- Modify: `src/components/welcome/Hero.tsx`
- Modify: `src/components/welcome/FeatureGrid.tsx`
- Modify: `src/components/welcome/FamilyRoles.tsx`

**Interfaces:**
- No new interfaces — this task only adjusts Tailwind classes for responsiveness.

- [ ] **Step 1: Check mobile viewport**

Run: `npm run dev`, open `http://localhost:5173/welcome`, resize the browser (or use devtools device toolbar) to a mobile width (375px).

Expected: hero buttons stack or remain usable without horizontal overflow, feature grid collapses to a single column (already handled by the `sm:grid-cols-2 lg:grid-cols-3` classes from Task 1 — confirm it actually does at 375px, don't assume), family role badges wrap without clipping.

If any element overflows or clips, adjust the offending Tailwind classes in the relevant component file (e.g. reduce `text-5xl`→`text-4xl` on mobile via `text-4xl sm:text-5xl` if the hero heading wraps awkwardly) and re-check.

- [ ] **Step 2: Confirm the existing `ThemeProvider` doesn't need special handling**

Check `src/App.tsx`'s existing usage — the app already wraps everything in `<ThemeProvider defaultTheme="dark">` (confirmed in the current file), so the landing page inherits dark mode by default and this plan's hardcoded `bg-slate-950`/`text-white` classes are consistent with that default. No light-mode variant is required unless the `ThemeProvider` is later changed to support user-toggled themes — out of scope for this plan.

- [ ] **Step 3: Commit (only if changes were made in Step 1)**

```bash
git add src/components/welcome/
git commit -m "fix(welcome): responsive fixes for mobile viewport"
```
(Skip this commit entirely if Step 1 required no changes — do not create an empty commit.)

---

### Task 3: Wire the logged-out redirect once `/login` exists

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `LoginPage` from `src/pages/Login.tsx` (produced by the foundation plan's Task 4).

**Depends on:** `docs/superpowers/plans/2026-07-13-multi-tenant-foundation.md` Task 4 must be complete before this task — do not start it otherwise.

- [ ] **Step 1: Read the current `src/App.tsx`**

Confirm it now has the foundation plan's Task 4 structure (a `LoginPage` import, `authed` state resolved via `getHouseholdSession()`).

- [ ] **Step 2: Redirect unauthenticated root visits to `/welcome`, keep `/login` separate**

Update the unauthenticated branch so visiting `/` with no session shows `/welcome` (not directly the login form), while `/login` remains directly reachable for the "Log in" link from the landing page:

```tsx
if (!authed) {
  return (
    <ThemeProvider defaultTheme="dark">
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Welcome />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
```

(Import `Welcome` from `./pages/Welcome` at the top of the file alongside the existing imports.)

- [ ] **Step 3: Verify end-to-end**

Run: `npm run dev`.
1. Visit `/` while logged out — expect the landing page (`Welcome`) to render, not a login form.
2. Click "Log in" — expect navigation to `/login` showing the Supabase Auth Google sign-in button.
3. Click "Get Started" from `/welcome` — expect navigation to `/setup` (this route's actual content is out of scope for this plan; a 404 or blank page at `/setup` is acceptable here since the setup-flow UI is a separate, not-yet-written piece of work — confirm only that the route *attempts* to navigate there, not that it renders a finished setup screen).

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(welcome): redirect logged-out root visits to /welcome, keep /login separate

Verified: / shows the landing page when logged out, /login still
reachable directly for the Log in link."
```

---

## Self-Review Notes

- **Spec coverage:** Landing page tone (playful & energetic), honest feature framing (no invented ADHD-assistant feature), route at `/welcome` not `/` — all match the approved design spec.
- **Dependency made explicit:** Task 3 is clearly gated on the foundation plan's Task 4; Tasks 1-2 are fully independent and can be built/reviewed first.
- **No placeholders:** every component has complete, real copy — no "TODO: write copy" left anywhere.
- **Verification is visual, not build-only:** every task's verification step explicitly requires viewing the rendered page, consistent with this being a UI-only change with no test runner in the repo.
