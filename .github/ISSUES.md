# Bear House — Floorplan Feature Issues (Sequenced)

Complete issues in order (1 and copilot-instructions.md first — everything else depends on the contract).
Each issue is sized to a single reviewable PR that `npm run typecheck && npm test` can verify.

---

## Issue 1 — Data contract: schema + types + sample

**Context:** docs/floorplan-vision.md (Part 2).

**Task:**
- Add house.schema.json (JSON Schema draft-07) for House → floors, rooms[],
  rooms.anchors[], rooms.zones[], zones.chores[], chores.steps[].
- Add lib/houseTypes.ts mirroring the schema.
- Add lib/sampleHouse.ts with a fully populated Kitchen.

**Acceptance:**
- npm run typecheck passes.
- Add test/house.schema.test.ts (vitest + ajv) asserting sampleHouse validates.
- No UI changes.

**Files:** house.schema.json, lib/houseTypes.ts, lib/sampleHouse.ts, test/house.schema.test.ts

---

## Issue 2 — Walkthrough capture UI (simulated detection)

**Context:** docs/floorplan-vision.md (Part 1).

**Task:** Add app/walkthrough/page.tsx — multi-step flow: start → name room (preset/custom
+ floor + owner) → "pan" capture that returns SIMULATED detected zones/objects as editable
chips → confirm + "This is the clean version" → repeat → finish. Build an in-memory House
object using lib/houseTypes.ts.

**Acceptance:**
- Reachable from Settings; uses design tokens; no real camera required.
- Produces a House object that validates against house.schema.json.
- npm run typecheck && npm test pass.

**Files:** app/walkthrough/page.tsx, lib/buildHouse.ts, test/buildHouse.test.ts

---

## Issue 3 — Export/import house.json + persistence

**Task:** Add lib/houseStore.ts — save/load House to localStorage, export to house.json
download, import from file (validated against schema; reject invalid with a friendly error).

**Acceptance:** round-trip (export → import) yields a deep-equal House; invalid import is
rejected with a typed error. Unit tested.

**Files:** lib/houseStore.ts, test/houseStore.test.ts

---

## Issue 4 — Scan localize + state diff (pure logic)

**Context:** docs/floorplan-vision.md (Part 3 steps 1–3).

**Task:** Add lib/scan.ts (pure, camera-free):
- localizeRoom(observedAnchors, house) → best room match + confidence.
- diffZones(observation, room) → per-zone messScore + triggered chores (honor triggerWhen),
  filtered by user age.

Provide a SIMULATED observation generator for tests/demo.

**Acceptance:** deterministic unit tests for localization and diff; no DOM/camera deps.

**Files:** lib/scan.ts, lib/simulateObservation.ts, test/scan.test.ts

---

## Issue 5 — Step-by-step task runner UI

**Context:** docs/floorplan-vision.md (Part 3 steps 4–5).

**Task:** Add app/task-runner/page.tsx — given a chore, show ONE step at a time
(ADHD-friendly), confirm via verify method (tap; photo/model checks simulated as pass),
closing check, then fire the existing celebration overlay + award points + mark done for
the frequency window. Wire it into the AR Scanner results ("Start").

**Acceptance:** completing all steps awards chore.points exactly once and updates balance/streak;
withholds completion if closing check fails (simulated toggle). typecheck + tests pass.

**Files:** app/task-runner/page.tsx, lib/completion.ts, test/completion.test.ts

---

## Issue 6 — Baseline learning (optional, last)

**Context:** docs/floorplan-vision.md (Part 3 step 6).

**Task:** Add lib/learnBaseline.ts — on a confirmed clean closing scan, update that zone's
cleanBaseline (rolling average). Persist via houseStore.

**Acceptance:** repeated confirmations converge the baseline; pure + unit tested.

**Files:** lib/learnBaseline.ts, test/learnBaseline.test.ts

---

Assign Issues 1→6 in order (1 and the `copilot-instructions.md` first — everything else depends on the contract).
