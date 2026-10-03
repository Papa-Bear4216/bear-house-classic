# HERMES HANDOFF — 2026-10-03: Kids World Redesign ("Monster Den") + Bedtime & Pet Tracker

## 1. Overview & Objective
Complete architectural redesign and gamified overhaul of the Kids Space in Bear House Classic.
The new system replaces standard adult dashboard cards with an immersive 2D clubhouse experience ("Monster Den") that blends:
- **Fuggler-style quirky monsters & whimsical derpy magical creatures**
- **Layered Procedural SVG Vector Rendering Engine**
- **Clacking Gacha Prize Wheel** (free daily/starter spins + chore streak rewards)
- **Pet Dress-up & Bodega Closet** (modular hats, pixel shades, chains, capes, boots)
- **Finch-style Habit Fuel Expeditions** (chores charge adventure fuel; real-time journey map across Couch Canyon, Mount Laundry, and Forbidden Pantry)
- **MySpace-style Freeform Den Canvas** (drag & drop furniture/posters, marquee status bar, visitor wall, 8-bit Web Audio synth radio & Spotify boombox)
- **Bedtime Wind-Down Station** (dim lights feedback, Web Audio lullaby synth with auto-sleep timer, Hermes bedtime story generation with Web Speech TTS, sleep day 4 AM rollover & streak tracking)
- **Real Family Pet Feeding Tracker ("Who Fed the Dog?")** (meal-time tracking for Barnaby, Mittens, Bubbles; double-feeding prevention, chore habit fuel & Bear Bucks awards)
- **Virtual Monster Snack Shelf** (graham crackers, pizza crusts, boba pearls, blue marshmallows, crunchy kibble with specific stat boosts)
- **Hermes Copilot as the "Magic Pocket Translator"** (translates creature squeaks into kid jokes, bedtime stories, voice mic input, speech read-aloud, and instant verified answers for pet feeding status)

---

## 2. Implemented Components & Core Files

| File | Purpose |
|---|---|
| [`src/lib/monsterDenData.ts`](file:///C:/Users/micha/projects/bear-house-classic/src/lib/monsterDenData.ts) | Data models, creature catalog (Fuggler Clan & Magical Clan), wardrobe & room catalogs, soundboard definitions, Finch expedition zones, sleep day 4 AM rollover calculation, 10-hour auto-wake, family pet tracking, and snack treats. |
| [`src/lib/monsterDenAudio.ts`](file:///C:/Users/micha/projects/bear-house-classic/src/lib/monsterDenAudio.ts) | Zero-dependency Web Audio API synthesizer for 8-bit sound effects (fart, airhorn, cheer, burp, laser, coin, squeak, fanfare, lullaby chime, wheel ticks), loopable chiptune radio, and lullaby loop with 15-minute sleep timer. |
| [`src/components/familyos/kids-world/BedtimeModal.tsx`](file:///C:/Users/micha/projects/bear-house-classic/src/components/familyos/kids-world/BedtimeModal.tsx) | Bedtime wind-down modal: dim lights button with honest Home Assistant feedback, Web Audio lullaby toggle, voice read-aloud bedtime story narration via authed `/api/chat`, and tuck-in streak rewards (+15 Bear Bucks). |
| [`src/components/familyos/kids-world/PetFeedingModal.tsx`](file:///C:/Users/micha/projects/bear-house-classic/src/components/familyos/kids-world/PetFeedingModal.tsx) | Dual-tab pet feeding station: Tab 1 tracks real household pets ("Who Fed the Dog?") with meal dedup and 2h double-feeding guard; Tab 2 allows feeding virtual monster treats with hunger & happiness boosts. |
| [`src/components/familyos/kids-world/CreatureRenderer.tsx`](file:///C:/Users/micha/projects/bear-house-classic/src/components/familyos/kids-world/CreatureRenderer.tsx) | Procedural Layered SVG vector engine supporting felt/burlap/nebula textures, human-like chompers, mismatched button eyes, modular clothing layers, cozy sleeping blanket, and squish/pet animations. |
| [`src/components/familyos/kids-world/MonsterHermesDialog.tsx`](file:///C:/Users/micha/projects/bear-house-classic/src/components/familyos/kids-world/MonsterHermesDialog.tsx) | Hermes Pocket Translator with Web Speech voice mic input, TTS listen button, authed `/api/chat` integration (15s timeout), offline joke fallback, and local verified pet feeding status lookups across all pets. |
| [`src/components/familyos/kids-world/DenRoomCanvas.tsx`](file:///C:/Users/micha/projects/bear-house-classic/src/components/familyos/kids-world/DenRoomCanvas.tsx) | MySpace freeform drag-and-drop room decorator with marquee status bar, Top 4 Besties widget, Spotify boombox, visitor stickers, bedtime/pet feed buttons, and sleeping pedestal badge with wake-up button. |
| [`src/components/familyos/kids-world/KidsWorldShell.tsx`](file:///C:/Users/micha/projects/bear-house-classic/src/components/familyos/kids-world/KidsWorldShell.tsx) | Full-screen clubhouse shell replacing adult navigation with parent math lock exit, live spendable Bear Bucks counter, and quick launcher buttons. |
| [`src/lib/monsterDenData.test.ts`](file:///C:/Users/micha/projects/bear-house-classic/src/lib/monsterDenData.test.ts) | Vitest test suite verifying roster integrity, profile persistence, habit fuel capping, bedtime streaks, 4 AM sleep day rollover, 10-hour auto-wake, family pet feeding, double-feeding prevention, and snack boosts. |

---

## 3. Verification & Quality Gates

- **TypeScript (`npm run typecheck`):** PASSED (0 errors across `tsconfig.app.json`, `tsconfig.node.json`, and `tsconfig.api.json`).
- **Unit Tests (`npm test`):** PASSED (86 test suites, 886/886 tests passing).
- **ESLint (`npx eslint src/components/familyos/kids-world/`):** PASSED (0 errors, 0 warnings).
- **API Check (`npm run check:api`):** PASSED.
- **Production Build (`npm run build`):** PASSED (Vite bundled in 7.71s).
- **Triad Advisory Council Review:** Performed via `advisor.py`; all pre-commit findings addressed and verified.
- **Remote Git Sync:** Pushed to `origin master` (commit `ecf7198`).

---

## 4. Key Operating Invariants Maintained
- **Child Role Isolation & COPPA Guardrails:** Children never see administrative settings, parent finances, or chore management toggles. Child prompt sessions in `/api/chat` do not have administrative or home tools attached.
- **Cozy & Forgiving Rules:** Pets never die, starve, or penalize kids. Neglected pets get comically sleepy in a blanket until cheered up by chores, petting, or feeding.
- **No Token/Audio Bloat:** Web Audio API synth produces zero-latency 8-bit sound and lullabies without external network assets; Hermes bedtime story and translator operate with instant offline canned fallbacks.
- **Sleep Day Invariant:** Day rollover for bedtime streaks occurs at 4:00 AM local time so late tuck-ins (e.g. 00:30) correctly credit the current night and do not lock the monster in sleep mode throughout the following day.
