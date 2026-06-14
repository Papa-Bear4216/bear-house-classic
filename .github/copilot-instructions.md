# Bear House — Copilot Instructions

Bear House is an ADHD-friendly, age-adaptive family home hub (chores, rewards, calendar,
AR scanner). Mobile-first Vite + React 18, wrapped with Capacitor for Android.

## Standing rules — apply to every change
- **Design tokens (exact):** Honey #E08C00, Honey-light #FFF3CC, Honey-dark #B87000,
  Bark #1E0E04, Bark-medium #3D2010, Cream #FFF8EE, Sage #1A8A4E, Berry #C020A0,
  Sky #0070C0, Coral #E01818. Use CSS custom properties; never hardcode hex inline.
- **Fonts:** Sora (display 700/800), Plus Jakarta Sans (body) via Google Fonts.
- **Shape/feel:** large radii (12–28px, pill buttons), soft shadows, big tap targets
  (≥44px), springy press + celebration animations.
- **Age-adaptive:** four groups (kid ≤12 / teen 13–17 / adult 18–64 / senior 65+).
  Respect chore.ageMin; never assign unsafe chores to little bears.
- **Graceful degradation:** every auth/camera/API feature must fall back to a fully
  working SIMULATED mode with zero config. The app must run with no env vars set.
- **Security:** never put client secrets or API keys in frontend code or commits.
  Only VITE_GOOGLE_CLIENT_ID (public) belongs in env. Vision/API keys are optional.
- **Data contract:** the house digital twin must validate against house.schema.json.
  Use the types in lib/houseTypes.ts; do not redefine them.

## Conventions
- One component per screen in app/; shared UI in components/.
- Keep PRs small and self-contained; prefer pure functions for scan/diff logic so they
  are unit-testable without a camera.
- Run `npm run typecheck && npm test` before declaring done.

## Reference
- docs/floorplan-vision.md — full feature spec for the walkthrough + scan-to-completion.
