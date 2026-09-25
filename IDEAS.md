# Bear House Classic — Enhancement & Enrichment Ideas

Living scratchpad for feature ideas. This is **not** the remediation plan —
that's `PLAN.md` (P0–P3). These are product enrichments: things that would
make the app more useful, delightful, or sticky for the household. Promote
anything that graduates into `PLAN.md` as a P1/P2 with an estimate.

Conventions: each idea has a rough effort — **S** (< 1 day), **M** (1–3 days),
**L** (3+ days / multi-surface). Anchor each to the routes/modules it touches.

---

## Briefing & Daily Rhythm

### 1. Push-delivered morning briefing
`briefing.ts` + `daily-brain.ts` + `register-push-token.ts`
The briefing exists but requires opening the app. Compose the morning brief
(calendar lookahead, weather, finance snapshot, daily-brain flags) and deliver
it as a push notification at a per-member configurable time. **M**

### 2. Bedtime / wind-down routine
`tts.ts` + `ha-control.ts`
Voice-driven routine: at kid bedtime, dim HA lights (`ha-control`), then read
tomorrow's highlights aloud with TTS. Same primitive could do a "leaving for
school" checklist. **M**

### 3. Weekly family digest
`secretary.ts` + `notify-person.ts` + `finance.ts`
Sunday-evening auto-digest: chores completed, spend vs. budget, calendar
lookahead for the week, one "win" per kid. Delivered to parents; opt-in for
kids. Turns existing data into a retention loop. **M**

## Home Assistant

### 4. One-tap scenes
`ha-control.ts` + `ha-cameras.ts`
Named scenes (Movie Night, Bedtime, Away, School Morning) bundling light,
climate, and camera-privacy states. Scenes are the feature that makes HA
feel finished to non-technical family members. **M**

### 5. Presence-aware automations
`ha-discover.ts` + `ha-webhook.ts`
"Everyone left" → arm cameras + eco climate; "first person home" →
disarm + entry lights. Webhook plumbing already exists; this is the
rule layer on top. **L**

### 6. Integration health watch
`health-check.ts` + `client-metric.ts` + `preempt-refresh.ts`
Household-visible status: HA, Gmail, SimpleFin, calendar sync each get a
freshness indicator, with proactive repair prompts when a token goes stale
instead of silent feature rot. **S–M**

## Finance & Household Ops

### 7. Receipt intelligence
`walmart.ts` + `vision.ts` + `finance.ts`
Snap a grocery receipt → vision extracts line items → auto-categorize
against the budget. Walmart route already pulls order data; this closes
the loop for in-store purchases. **L**

### 8. Transaction review inbox
`_simplefin.ts` + `finance-sync.ts`
SimpleFin auto-categorization is only as good as its corrections. A lightweight
"review these 5 uncertain transactions" inbox (swipe right = confirm)
compounds categorization accuracy over time. **M**

### 9. Pantry / grocery loop
`walmart.ts`
Track staples from receipt history; flag "running low" based on purchase
cadence; one-tap add to the next Walmart order. **M**

## Family & Kids

### 10. Chore streaks & leaderboard
Family OS heritage feature, never built here. Streaks, points, and a weekly
family leaderboard with parent-approved rewards. The single highest-leverage
kid-engagement mechanic available. **M**

### 11. Classroom+ : homework loop
`classroom.ts`
Extend beyond the current surface: assignment capture (photo → vision),
due-date nudges, and a parent "sign-off" flow. Permission-slip detection
could live here too (see #13). **L**

### 12. Memory timeline ("a year ago today")
`memory.ts`
Surface long-term memory as delight: milestones, photos, and notes
resurfaced on anniversaries. Kid-milestone logging (firsts) makes this
a keepsake, not just a database. **S–M**

### 13. School-email triage
`gmail-suggestions.ts` + `gmail-server-scan.ts` + `calendar-sync.ts`
Detect teacher/school senders → roll into a single school digest;
detect permission slips / forms → extract the deadline and create a
calendar event with a parent reminder. **M**

## Platform

### 14. Voice routines beyond unlock
`voice-unlock.ts` + `tts.ts`
Voice unlock proved the mic path. Add a small routine grammar ("good
morning", "goodnight", "we're leaving") mapping to briefing/TTS/HA
actions. **M**

### 15. Grandparent (read-only) view
Household model currently assumes members. A scoped read-only role —
photos, milestones, digest — brings extended family into the loop
without widening the trust boundary. Pairs with the RLS work in `PLAN.md`. **L**

### 16. Guided re-onboarding after dormant integrations
`setup.ts` + `health-check.ts`
When an integration has been broken > 7 days, offer a 2-minute guided
reconnect instead of a dead settings page. Retention insurance. **S**

---

## Parking lot (unshaped)
- Shared grocery list with store-aisle ordering
- Kid-safe "ask the house" voice Q&A over family memory
- Car / garage door state in HA scenes
- Pet feeding tracker (who fed the dog?)

*Last updated: 2026-09-25*
