// Hermes "mind palace" memory — spatial, associative memory for the family assistant.
// Memories are organized into rooms (kitchen, calendar, …); the assistant recalls only the
// rooms relevant to the current question instead of dumping every note into the prompt.
// See docs/hermes-mind-palace-plan.md. Phase 1: keyword routing, room-scoped recall.
import { getAdminFirestore } from '@/lib/firebase-admin';
import { randomUUID } from 'crypto';

export type Room = 'kitchen' | 'calendar' | 'living_room' | 'office' | 'mudroom' | 'foyer';

export const ROOMS: Room[] = ['kitchen', 'calendar', 'living_room', 'office', 'mudroom', 'foyer'];

export const ROOM_LABELS: Record<Room, string> = {
  kitchen: 'Kitchen',
  calendar: 'Calendar',
  living_room: 'Living Room',
  office: 'Office',
  mudroom: 'Mudroom',
  foyer: 'Foyer',
};

export interface PalaceMemory {
  id: string;
  text: string;
  room: Room;
  confidence: number;
  createdAt: string;
  lastUsedAt: string;
  useCount: number;
  sourceMsgId?: string;
}

// Keyword → room routing. Deterministic and free; upgrade to a classifier/embeddings in Phase 3.
const ROOM_KEYWORDS: Record<Exclude<Room, 'foyer'>, string[]> = {
  kitchen: ['meal', 'food', 'grocery', 'groceries', 'dinner', 'lunch', 'breakfast', 'recipe',
    'snack', 'dish', 'cook', 'cooking', 'eat', 'eating', 'hungry', 'fridge', 'pantry', 'dairy',
    'allergy', 'allergic', 'diet', 'dietary', 'vegan', 'vegetarian', 'gluten', 'shopping list'],
  calendar: ['event', 'events', 'schedule', 'calendar', 'appointment', 'meeting', 'routine',
    'tomorrow', 'tonight', 'weekend', 'birthday', 'practice', 'pickup', 'dropoff', 'reminder',
    'when is', 'what time'],
  living_room: ['family', 'mom', 'dad', 'kid', 'kids', 'child', 'children', 'son', 'daughter',
    'wife', 'husband', 'partner', 'sibling', 'brother', 'sister', 'grandma', 'grandpa',
    'personality', 'prefers', 'likes', 'dislikes', 'favorite', 'relationship'],
  office: ['budget', 'money', 'spend', 'spending', 'cost', 'bill', 'bills', 'payment', 'pay',
    'expense', 'expenses', 'save', 'savings', 'afford', 'financial', 'account', 'income'],
  mudroom: ['task', 'tasks', 'chore', 'chores', 'todo', 'to-do', 'clean', 'cleaning', 'laundry',
    'trash', 'dishes', 'homework', 'assign', 'assigned', 'responsibility', 'who does', 'need to'],
};

// Route free text to the most relevant rooms. Returns ['foyer'] when nothing matches.
export function routeToRooms(text: string): Room[] {
  const hay = (text ?? '').toLowerCase();
  const scored: { room: Room; score: number }[] = [];
  for (const room of Object.keys(ROOM_KEYWORDS) as Exclude<Room, 'foyer'>[]) {
    let score = 0;
    for (const kw of ROOM_KEYWORDS[room]) {
      if (hay.includes(kw)) score++;
    }
    if (score > 0) scored.push({ room, score });
  }
  if (scored.length === 0) return ['foyer'];
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map(s => s.room);
}

const MAX_PER_ROOM = 30;

function roomRef(userId: string, room: Room) {
  return getAdminFirestore()
    .collection('households').doc(userId)
    .collection('palace').doc(room);
}

async function readRoom(userId: string, room: Room): Promise<PalaceMemory[]> {
  const snap = await roomRef(userId, room).get();
  if (!snap.exists) return [];
  const data = snap.data() as { memories?: PalaceMemory[] } | undefined;
  return Array.isArray(data?.memories) ? data!.memories : [];
}

// Store a memory note: route it to a room, dedup by text (reinforcing instead of duplicating),
// and cap the room, evicting the least-confident / oldest entries.
export async function storeMemory(userId: string, text: string, sourceMsgId?: string): Promise<void> {
  const clean = (text ?? '').trim();
  if (!userId || !clean) return;

  const room = routeToRooms(clean)[0] ?? 'foyer';
  const now = new Date().toISOString();
  const memories = await readRoom(userId, room);

  const existing = memories.find(m => m.text.trim().toLowerCase() === clean.toLowerCase());
  if (existing) {
    existing.confidence += 1;
    existing.useCount += 1;
    existing.lastUsedAt = now;
  } else {
    memories.unshift({
      id: randomUUID(),
      text: clean,
      room,
      confidence: 1,
      createdAt: now,
      lastUsedAt: now,
      useCount: 0,
      ...(sourceMsgId ? { sourceMsgId } : {}),
    });
  }

  memories.sort((a, b) => b.confidence - a.confidence || b.lastUsedAt.localeCompare(a.lastUsedAt));
  const trimmed = memories.slice(0, MAX_PER_ROOM);

  await roomRef(userId, room).set({ memories: trimmed, updatedAt: now }, { merge: true });
}

// Read legacy flat notes (households/{uid}/hermesMemory/hermesMemory → persistentNotes[]) so
// pre-migration memories aren't lost. Surfaced as foyer memories.
async function readLegacyNotes(userId: string): Promise<PalaceMemory[]> {
  try {
    const snap = await getAdminFirestore()
      .collection('households').doc(userId)
      .collection('hermesMemory').doc('hermesMemory').get();
    if (!snap.exists) return [];
    const notes = (snap.data() as { persistentNotes?: string[] } | undefined)?.persistentNotes;
    if (!Array.isArray(notes)) return [];
    const now = new Date().toISOString();
    return notes.filter(Boolean).map(text => ({
      id: `legacy:${text}`,
      text,
      room: 'foyer' as Room,
      confidence: 1,
      createdAt: now,
      lastUsedAt: now,
      useCount: 0,
    }));
  } catch {
    return [];
  }
}

// Recall the most relevant memories for the given rooms, ranked by confidence then recency.
export async function recallMemories(userId: string, rooms: Room[], limit = 8): Promise<PalaceMemory[]> {
  if (!userId) return [];
  const wanted = rooms.length ? Array.from(new Set(rooms)) : ['foyer' as Room];
  const roomBatches = await Promise.all(wanted.map(r => readRoom(userId, r)));
  const pool = roomBatches.flat();

  // Fold in legacy notes as a fallback when the foyer is in scope (or nothing else matched).
  if (wanted.includes('foyer') || pool.length === 0) {
    pool.push(...(await readLegacyNotes(userId)));
  }

  const seen = new Set<string>();
  const deduped = pool.filter(m => {
    const key = m.text.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => b.confidence - a.confidence || b.lastUsedAt.localeCompare(a.lastUsedAt));
  return deduped.slice(0, limit);
}

// Full palace, grouped by room, for the inspection endpoint / future "what Hermes remembers" UI.
export async function listPalace(userId: string): Promise<Record<Room, PalaceMemory[]>> {
  const result = {} as Record<Room, PalaceMemory[]>;
  await Promise.all(ROOMS.map(async room => {
    const memories = await readRoom(userId, room);
    if (room === 'foyer') memories.push(...(await readLegacyNotes(userId)));
    memories.sort((a, b) => b.confidence - a.confidence || b.lastUsedAt.localeCompare(a.lastUsedAt));
    result[room] = memories;
  }));
  return result;
}
