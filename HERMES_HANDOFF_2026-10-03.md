# HERMES HANDOFF — 2026-10-03: Kids World Redesign ("Monster Den")

## 1. Overview & Objective
Complete architectural redesign and gamified overhaul of the Kids Space in Bear House Classic.
The new system replaces standard adult dashboard cards with an immersive 2D clubhouse experience ("Monster Den") that blends:
- **Fuggler-style quirky monsters & whimsical derpy magical creatures**
- **Layered Procedural SVG Vector Rendering Engine**
- **Clacking Gacha Prize Wheel** (free daily/starter spins + chore streak rewards)
- **Pet Dress-up & Bodega Closet** (modular hats, pixel shades, chains, capes, boots)
- **Finch-style Habit Fuel Expeditions** (chores charge adventure fuel; real-time journey map across Couch Canyon, Mount Laundry, and Forbidden Pantry)
- **MySpace-style Freeform Den Canvas** (drag & drop furniture/posters, marquee status bar, visitor wall, 8-bit Web Audio synth radio & Spotify boombox)
- **Hermes Copilot as the "Magic Pocket Translator"** (translates creature squeaks into kid jokes, bedtime stories, and chore quests)

---

## 2. Implemented Components & Core Files

| File | Purpose |
|---|---|
| `src/lib/monsterDenData.ts` | Data models, rosters (Fuggler Clan & Magical Clan), wardrobe & room catalogs, soundboard definitions, Finch expedition zones, and persistence helpers (`familyos_monster_den_profiles`). |
| `src/lib/monsterDenAudio.ts` | Zero-dependency Web Audio API synthesizer for 8-bit sound effects (fart, airhorn, cheer, burp, laser, coin, squeak, fanfare, wheel ticks) and loopable chiptune radio. |
| `src/components/familyos/kids-world/CreatureRenderer.tsx` | Procedural Layered SVG vector engine supporting felt/burlap/nebula textures, human-like chompers, mismatched button eyes, modular clothing layers, and cozy squish/sleep animations. |
| `src/components/familyos/kids-world/GachaWheelModal.tsx` | Physics-based interactive prize wheel with tick audio, confetti fanfare, and instant unlocks. |
| `src/components/familyos/kids-world/WardrobeModal.tsx` | Pet closet and bodega shop for trying on and equipping unlocked clothes or buying gear with Bear Bucks. |
| `src/components/familyos/kids-world/ExpeditionStation.tsx` | Habit fuel tracker and real-time expedition map with time-based checkpoints, Hermes-narrated postcards, and loot drops. |
| `src/components/familyos/kids-world/DenRoomCanvas.tsx` | MySpace freeform drag-and-drop room decorator with marquee status bar, Top 4 Besties widget, Spotify player, and Knock-and-Visit sticker slapping. |
| `src/components/familyos/kids-world/MonsterHermesDialog.tsx` | Hermes Copilot integration acting as the Monster's Pocket Translator. |
| `src/components/familyos/kids-world/KidsWorldShell.tsx` | Standalone full-screen clubhouse shell replacing adult navigation with parent math lock exit. |
| `src/components/AppLayout.tsx` | Gating logic: unmounts adult dashboard and renders `KidsWorldShell` when `currentRole === 'child'`. |
| `src/components/familyos/sections/KidsHub.tsx` | "ENTER MONSTER DEN" launcher banner for parent preview and visiting. |
| `src/lib/monsterDenData.test.ts` | Vitest test suite verifying roster integrity, profile persistence, habit fuel capping, and pet care mechanics. |

---

## 3. Verification & Quality Gates

- **TypeScript (`npm run typecheck`):** PASSED (0 errors across `tsconfig.app.json`, `tsconfig.node.json`, and `tsconfig.api.json`).
- **Unit Tests (`npm test`):** PASSED (86 test files, 880/880 tests green).
- **API Check (`npm run check:api`):** PASSED.
- **Production Build (`npm run build`):** PASSED (Vite bundled in 31.7s; `KidsWorldShell` code-split into `KidsWorldShell-*.js`).

---

## 4. Key Operating Invariants Maintained
- **Child Role Isolation:** Children never see administrative settings, parent finances, or chore management toggles.
- **Cozy & Forgiving Rules:** Pets never die, starve, or penalize kids. Neglected pets get comically sleepy in a blanket until cheered up by chores or petting.
- **No Token/Audio Waste:** Web Audio API synth produces zero-latency 8-bit sound without network assets; Hermes translator operates with instant offline fallback.
