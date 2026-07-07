# Hermes "Mind Palace" Memory — Implementation Plan

Status: **Phase 1 in progress.** This doc is a self-contained handoff so any session can
pick the work up cold. Branch: `claude/bear-house-api-gateway-diagnosis-b2bqln`
(same branch/PR as the AI Gateway fixes — split only if instructed).

---

## Why

Hermes (the family assistant, `/api/hermes`) has essentially no structured memory today:

- **Flat memory.** `persistMemoryFromResponse()` in `app/api/hermes/route.ts` parses
  `ADD TO MEMORY:` lines out of the model's reply and appends them to a single Firestore
  array `households/{userId}/hermesMemory/hermesMemory → persistentNotes[]`, capped at 20.
  No dedup, no decay, no relevance — and on recall the client sends *all* of them back in
  `context.persistentMemory`, which gets JSON-stringified into the system prompt wholesale.
- **Dump-everything context.** The route stringifies the entire household snapshot
  (tasks, events, meals, shopping, users…) into the system prompt every call. Token-heavy;
  degrades as the family's data grows.

A **mind palace** (method of loci) reframes memory as spatial, associative retrieval —
which maps perfectly onto Bear House (a literal house) and fixes the real problem: stop
dumping all memory, retrieve only what's relevant to the current question. Bonus: it's
*inspectable* ("what does Hermes remember about the Kitchen?"), which doubles as trust UX
and a monitoring surface.

## Rooms (memory domains)

Reuse the app's existing surfaces as rooms:

| Room | Slug | Holds |
|---|---|---|
| Kitchen | `kitchen` | meals, shopping, food/dietary preferences |
| Calendar | `calendar` | events, schedules, routines |
| Living Room | `living_room` | family members, personalities, relationships |
| Office | `office` | budget, spending concerns |
| Mudroom | `mudroom` | tasks, chores, who-does-what |
| Foyer | `foyer` | general / uncategorized (fallback room) |

---

## Phase 1 — rooms + routing + room-scoped recall (THIS PHASE)

Self-contained backend foundation. No UI required. Keyword routing (no LLM call) — cheap,
deterministic, free. Semantic routing is Phase 3.

### New file: `lib/palace.ts`

Server-side helper (uses `getAdminFirestore` from `@/lib/firebase-admin`; same Firestore
API shape already used in `app/api/hermes/route.ts`).

```ts
export type Room = 'kitchen' | 'calendar' | 'living_room' | 'office' | 'mudroom' | 'foyer';

export interface PalaceMemory {
  id: string;          // stable id (e.g. crypto.randomUUID())
  text: string;
  room: Room;
  confidence: number;  // starts at 1; Phase 2 reinforces/decays
  createdAt: string;   // ISO
  lastUsedAt: string;  // ISO
  useCount: number;
  sourceMsgId?: string;
}
```

- `ROOM_KEYWORDS: Record<Room, string[]>` — keyword lists for routing
  (e.g. kitchen: meal, food, grocery, dinner, recipe, snack, dish, cook, eat, hungry,
  fridge, pantry, dairy, allergy, diet…).
- `routeToRooms(text: string): Room[]` — lowercase match against keyword lists; return all
  matched rooms; **default to `['foyer']`** when nothing matches. Cap at 2–3 rooms.
- `storeMemory(userId, text, sourceMsgId?)` — route → pick primary room → append a
  `PalaceMemory` to `households/{userId}/palace/{room}` doc's `memories[]` (merge-write).
  Dedup: skip if an existing memory in that room has identical (case-insensitive, trimmed)
  text — instead bump its `confidence`, `useCount`, `lastUsedAt`. Cap `memories[]` per room
  (e.g. 30), evicting lowest `confidence` then oldest `lastUsedAt`.
- `recallMemories(userId, rooms, limit = 8)` — read the given room docs, merge their
  `memories[]`, rank by `confidence` desc then `lastUsedAt` desc, return top `limit`.
  **Back-compat:** also read the legacy `hermesMemory/hermesMemory → persistentNotes[]`
  and fold those in as `foyer` memories (confidence 1) so nothing is lost pre-migration.
- `listPalace(userId)` — return all rooms → memories, for the inspection endpoint.

Firestore path shape (matches existing admin usage):
```
households/{userId}/palace/{room}   →   { memories: PalaceMemory[], updatedAt: string }
```

### Modify: `app/api/hermes/route.ts`

1. **Recall (context assembly).** Before building `gatewayMessages`, derive the latest user
   message text from `messages`, `routeToRooms()` it, `recallMemories(userId, rooms)`, and
   inject the results as a `Relevant memory (Kitchen, …):` context block — *instead of*
   relying on the client-sent `context.persistentMemory` dump. Keep accepting
   `context.persistentMemory` if present (append, deduped) so nothing regresses.
   `userId` is derived the same way `persistMemoryFromResponse` already does it:
   `context.currentUser.id ?? context.currentUser.uid`.
2. **Store.** Replace the body of `persistMemoryFromResponse()` to call
   `storeMemory(userId, note)` per parsed `ADD TO MEMORY:` line (routing each to a room).
   Keep the same `ADD TO MEMORY:` parsing regex.
3. Guard everything in try/catch (memory must never break a chat response) — the existing
   function already swallows errors; preserve that.

### New file: `app/api/hermes/memory/route.ts`

`GET` (auth via `verifyAuth`) → `listPalace(userId)` for the current user, so a future
"what Hermes remembers" UI can render rooms. `userId` from the authenticated request /
query param. Keep it read-only for Phase 1.

### Verification (Phase 1)

- `npx tsc --noEmit` clean (ignore the pre-existing `tsconfig.json` `baseUrl` deprecation).
- Cannot fully exercise Firestore/gateway in the dev sandbox — smoke-test on the Vercel
  preview: send a hermes turn containing `ADD TO MEMORY: <fact about dinner>`, confirm it
  lands in `households/{uid}/palace/kitchen`, then a later kitchen-topic turn recalls it
  and a budget-topic turn does not.
- Confirm legacy `persistentNotes[]` still surface via the `foyer` back-compat path.

---

## Phase 2 — reinforcement + feedback (later; needs UI decision)

- Thumbs up/down on each Hermes reply in the UI → store `{prompt, context, response, model,
  verdict, recalledMemoryIds}` in Firestore.
- On 👍: bump `confidence` of the memories that were recalled for that turn. On 👎 / unused:
  decay. Evict when `confidence` drops below a floor. (Wire `recallMemories` to stamp which
  memory ids it returned so feedback can target them.)
- Inspectable palace UI: per-room list the family can view/edit/delete — trust + correction.

## Phase 3 — semantic recall (later; only if keyword routing proves too coarse)

- Embed memories (and the query) and retrieve by vector similarity **within** the routed
  room(s), instead of / in addition to keyword routing. Could use Google text-embedding via
  the existing Gemini key, or a small on-write embedding cached in the memory doc.

---

## Open decisions / notes

- **Routing model:** Phase 1 uses keyword routing (free, deterministic). If it mis-routes in
  practice, upgrade to a cheap Gemini-flash classifier or embeddings (Phase 3).
- **Migration:** no destructive migration — new writes go to rooms; legacy `persistentNotes`
  are read via back-compat. A one-time migration script (legacy notes → `foyer`) is optional.
- **Gateway context:** unrelated to this work, but note Hermes still runs through OpenRouter
  (`lib/ai-gateway.ts`); avatar images now go direct to Google (`lib/google-image.ts`).
- **Also recommended, not in these phases:** instrument `gatewayChat` (path/latency/tokens,
  primary-vs-fallback rate) — the silent-failure gap that hid the empty-content bug for weeks.
