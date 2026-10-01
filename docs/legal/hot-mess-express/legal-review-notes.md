# Hot Mess Express — Legal Review Notes

Date: 2026-10-01. Companion to `data-flow.md` / `data-flow.pdf`.

## What this folder is

Everything from the legal/data-flow review track, in one place. Hand `data-flow.md`
(or the PDF) to Vikk first, then to a licensed lawyer for final calls.

## Vikk — AI legal assistant

- App: **Vikk – AI Lawyer & Legal Help**, by Law Zebras, Inc.
  (`https://play.google.com/store/apps/details?id=com.vikktoria`)
- Per its own Play Store listing: **not a licensed attorney or law firm**; does not
  provide official legal advice. Treat it as a sharp paralegal, not counsel.
- Recommended workflow:
  1. Feed it `data-flow.md`.
  2. Use it to surface issues, draft beta-agreement language, and prep focused questions.
  3. Licensed Texas lawyer makes the final compliance/liability decisions.
- Do **not** upload the full codebase: Vikk's intake is chat/PDF with size limits, it
  can't verify runtime behavior from source, and it needlessly exposes proprietary code.

## Tone & voice — onboarding script (free + premium flow)

Decided 2026-10-01, to hand to Vikk (or whoever drafts the script):

- **Voice: an honest friend who's been through it.** Warm, plain-spoken, lightly
  irreverent — the app is called Hot Mess Express, so own the mess.
- Direct, zero corporate jargon, zero therapy-speak. Kid-first: every "why" ladders
  up to the kids, not the parents' fight.
- **Do:** short sentences, contractions, second person. Write like it's a tired parent
  at the kitchen table.
- **Don't:** toxic positivity, guilt, shame, or over-promising. Don't sell a fix for
  the divorce — sell calmer logistics.
- **Paywall:** honest, no dark patterns. "Free covers the basics. Premium keeps the
  lights on and the kids' space growing."
- Anchor lines: "Divorce is a mess. The logistics don't have to be." /
  "One kid, two houses, one life."
- Anti-examples: SaaS landing-page speak ("synergize your co-parenting workflows");
  therapist-pamphlet speak ("we hear you, and your feelings are valid").

## Open legal questions (from data-flow.md §10)

1. What verifiable parental consent is required before under-13 beta use (COPPA)?
2. Children's names/emotion data sent to Anthropic/Google — minimization + provider
   agreements needed?
3. Is a derived nudge from a sealed journal compatible with child privacy when parents
   never see the journal?
4. Is the proposed beta clickwrap sufficient for ~50 families including minors?
5. Could high-severity escalation language accidentally create duties the app can't
   reliably fulfill?
6. How should built-in state-law summaries be framed as legal information, not advice?

## Status / next steps

- Doc + PDF ready to hand to Vikk.
- After Vikk responds: separate reliable statutory references from generic AI language,
  turn findings into concrete code/product requirements, prep a short packet for a
  licensed lawyer.
- Private-journal / sealed-context architecture is **design only** — no code changes
  authorized yet.
