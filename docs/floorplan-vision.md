# Bear House — Floorplan Walkthrough & Scan-to-Completion

## Concept
Before chores can be smart, the house must be known. A Grown Bear walks the home once
with the phone camera; Bear House builds a digital twin (rooms → zones → objects +
a "clean baseline") and exports it as `house.json`. Later, any AR scan localizes the
user into a known room, diffs the current state against the clean baseline, and returns
a step-by-step task that runs to verified completion — awarding Honey Points only when
the job is actually done.

This turns "clean your room" (vague, overwhelming — the ADHD problem) into
"1 of 5: put the 3 cups on the desk into the kitchen → tap done."

## Part 1 — Walkthrough capture flow
1. Start tour (bear mascot narrates).
2. Name the room (preset or custom) + assign floor + optional owner.
3. Slow 360° pan; sample frames detect: zones (counter, sink, floor, bed, desk, trash…),
   surfaces, chore-generating objects, and stable visual anchors (window, appliance, door)
   used for later re-localization.
4. Confirm editable chips; tap "This is the clean version" to set the clean-state baseline;
   set default points + frequency per chore.
5. Repeat per room; export house.json. Flow is re-runnable and incrementally editable.

## Part 2 — house.json (digital twin)
The exported contract every downstream feature reads. See house.schema.json for the
authoritative shape. Key fields:
- rooms[].anchors[].embedding → how a future scan recognizes "this is the Kitchen".
- rooms[].baselineImage + zones[].cleanBaseline → the "what clean looks like" reference.
- zones[] → spatially precise tasks ("the sink", not "the kitchen").
- chores[].steps[].verify → tap | photo | model-check (e.g. sink_empty, counter_clear).
- chores[].triggerWhen → state-conditional chores (only show "take out trash" when ≥80% full).
- chores[].ageMin → age-adaptive assignment (little bears never get the stove).

## Part 3 — Scan → Task → Completion
1. Localize: match live anchors against each room's anchors → "You're in the Kitchen".
2. Diff: compare current frame to each zone's cleanBaseline → per-zone mess score.
3. Build task list: zones above threshold (or triggerWhen met) → matching chores,
   filtered by user age, sorted by impact.
4. Run to completion: chore.steps[] drive a one-step-at-a-time checklist; each step
   confirmed by its verify method.
5. Verify & reward: closing scan confirms the zone now matches clean baseline → celebration
   + points + streak. If still messy, completion is withheld ("Almost! 🐻").
6. Learn: each confirmed clean state refines the baseline over time.

## Guardrails
- Everything must degrade gracefully to a fully working SIMULATED mode with zero config.
- Camera via getUserMedia; optional Claude vision (claude-opus-4-8 / claude-sonnet-4-6)
  for real detection, with simulated fallback.
- Age-adaptive: respect ageMin and the four age groups (kid/teen/adult/senior).
