import {
  computeSpendable,
  loadJSON,
  saveJSON,
  uid,
  type PointsBalance,
  type RewardRedemption,
} from './familyos';

/** Public room pages sync with the household. Journal text does not. */
export const ROOMS_KEY = 'familyos_kid_rooms';

export const AVATARS = ['🐻', '🦊', '🐸', '🦄', '🐙', '🌟', '🎧', '🛹', '🌙', '🦖', '🎨', '⚡'] as const;
export const MOODS = ['chill', 'hyped', 'sleepy', 'focused', 'goofy', 'proud', 'meh', 'excited'] as const;

const STATUS_MAX = 140;
const ABOUT_MAX = 500;
const LISTENING_MAX = 80;
const FRIENDS_MAX = 8;
const JOURNAL_MAX = 4000;

export type ThemePack = {
  id: string;
  name: string;
  blurb: string;
  cost: number;
  background: string;
  card: string;
  ink: string;
  muted: string;
  accent: string;
  border: string;
};

export const THEME_PACKS: ThemePack[] = [
  {
    id: 'den',
    name: 'Starter Den',
    blurb: 'Wood, amber, and a bunk you already own.',
    cost: 0,
    background: 'linear-gradient(160deg, #3a2418 0%, #1c120c 55%, #2a1a10 100%)',
    card: 'rgba(62, 40, 24, 0.88)',
    ink: '#f6efe4',
    muted: '#d9c4a8',
    accent: '#e8a04a',
    border: '#8a5a32',
  },
  {
    id: 'glitter',
    name: 'Glitter Pop',
    blurb: 'Hot pink, purple chrome, and a cursor that never sits still.',
    cost: 30,
    background: 'linear-gradient(145deg, #ff4fa3 0%, #7a2cff 48%, #24143a 100%)',
    card: 'rgba(48, 16, 64, 0.82)',
    ink: '#fff5fb',
    muted: '#ffd0ea',
    accent: '#ffe14a',
    border: '#ff8ad4',
  },
  {
    id: 'night-market',
    name: 'Night Market',
    blurb: 'Neon signs, wet pavement, and a song leaking from a stall.',
    cost: 50,
    background: 'linear-gradient(180deg, #070b14 0%, #102033 40%, #041018 100%)',
    card: 'rgba(8, 18, 32, 0.86)',
    ink: '#e8fff8',
    muted: '#9ad7c8',
    accent: '#3dffe2',
    border: '#1f8f80',
  },
  {
    id: 'tide',
    name: 'Tide Pool',
    blurb: 'Glass water, shells, and a window that faces the ocean.',
    cost: 40,
    background: 'linear-gradient(165deg, #0e4d5c 0%, #083044 50%, #0a2230 100%)',
    card: 'rgba(8, 48, 62, 0.88)',
    ink: '#e7fbff',
    muted: '#b7e4ee',
    accent: '#7ee0ff',
    border: '#3aa0b8',
  },
  {
    id: 'moss',
    name: 'Moss Fort',
    blurb: 'A blanket fort that grew into a forest.',
    cost: 40,
    background: 'linear-gradient(160deg, #1d3a22 0%, #102016 55%, #1a2e18 100%)',
    card: 'rgba(18, 40, 22, 0.9)',
    ink: '#f3ffe8',
    muted: '#c6e2b4',
    accent: '#b6f27a',
    border: '#4e8a45',
  },
  {
    id: 'cabinet',
    name: 'Cabinet Glow',
    blurb: 'Scanlines, magenta bezel, and a high score nobody can beat.',
    cost: 75,
    background: 'linear-gradient(180deg, #1a0520 0%, #3a0840 35%, #120814 100%)',
    card: 'rgba(32, 6, 36, 0.9)',
    ink: '#ffe9ff',
    muted: '#f0b6e8',
    accent: '#ff4fd8',
    border: '#ff7ae0',
  },
  {
    id: 'orbit',
    name: 'Orbit',
    blurb: 'A porthole, a planet, and stickers on the ceiling.',
    cost: 75,
    background: 'radial-gradient(circle at 20% 10%, #3a4a88 0%, #0c1024 42%, #05060e 100%)',
    card: 'rgba(12, 16, 40, 0.88)',
    ink: '#eef2ff',
    muted: '#b9c4ee',
    accent: '#8eb4ff',
    border: '#5a6cb0',
  },
  {
    id: 'sketch',
    name: 'Ink & Stars',
    blurb: 'Notebook paper, a lamp, and margins full of doodles.',
    cost: 60,
    background: 'linear-gradient(180deg, #f4efe4 0%, #e7dcc8 100%)',
    card: 'rgba(255, 252, 245, 0.92)',
    ink: '#2a241c',
    muted: '#5c5144',
    accent: '#c45c26',
    border: '#c8b79a',
  },
];

export const FREE_THEME_ID = 'den';

export type KidRoomProfile = {
  memberId: string;
  avatar: string;
  status: string;
  about: string;
  mood: string;
  listening: string;
  topFriendIds: string[];
  themeId: string;
  ownedThemeIds: string[];
  updatedAt: number;
};

export type JournalEntry = {
  id: string;
  body: string;
  createdAt: number;
  updatedAt: number;
};

export function themeById(id: string): ThemePack | undefined {
  return THEME_PACKS.find((t) => t.id === id);
}

export function journalStorageKey(memberId: string): string {
  return `familyos_kid_journal_${memberId}`;
}

function clip(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max);
}

export function defaultRoom(memberId: string, now = Date.now()): KidRoomProfile {
  return {
    memberId,
    avatar: AVATARS[0],
    status: 'just moved in',
    about: '',
    mood: 'chill',
    listening: '',
    topFriendIds: [],
    themeId: FREE_THEME_ID,
    ownedThemeIds: [FREE_THEME_ID],
    updatedAt: now,
  };
}

export function sanitizeRoom(
  input: Partial<KidRoomProfile> | null | undefined,
  memberId: string,
  allowedFriendIds: string[],
  now = Date.now(),
): KidRoomProfile {
  const base = defaultRoom(memberId, now);
  if (!input || typeof input !== 'object') return base;
  const avatar = AVATARS.includes(input.avatar as (typeof AVATARS)[number]) ? input.avatar! : base.avatar;
  const mood = MOODS.includes(input.mood as (typeof MOODS)[number]) ? input.mood! : base.mood;
  const allowed = new Set(allowedFriendIds.filter((id) => id && id !== memberId));
  const friends: string[] = [];
  if (Array.isArray(input.topFriendIds)) {
    for (const id of input.topFriendIds) {
      if (typeof id !== 'string' || !allowed.has(id) || friends.includes(id)) continue;
      friends.push(id);
      if (friends.length >= FRIENDS_MAX) break;
    }
  }
  const owned = new Set<string>([FREE_THEME_ID]);
  if (Array.isArray(input.ownedThemeIds)) {
    for (const id of input.ownedThemeIds) {
      if (themeById(id)) owned.add(id);
    }
  }
  const requestedTheme = typeof input.themeId === 'string' ? input.themeId : FREE_THEME_ID;
  const themeId = owned.has(requestedTheme) ? requestedTheme : FREE_THEME_ID;
  return {
    memberId,
    avatar,
    status: typeof input.status === 'string' ? clip(input.status, STATUS_MAX) : base.status,
    about: clip(input.about, ABOUT_MAX),
    mood,
    listening: clip(input.listening, LISTENING_MAX),
    topFriendIds: friends,
    themeId,
    ownedThemeIds: [...owned],
    updatedAt: typeof input.updatedAt === 'number' && Number.isFinite(input.updatedAt) ? input.updatedAt : now,
  };
}

export function loadRooms(): Record<string, KidRoomProfile> {
  const raw = loadJSON<Record<string, Partial<KidRoomProfile>>>(ROOMS_KEY, {});
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, KidRoomProfile> = {};
  for (const [memberId, profile] of Object.entries(raw)) {
    if (!memberId) continue;
    const storedFriends = Array.isArray(profile?.topFriendIds)
      ? profile.topFriendIds.filter((id): id is string => typeof id === 'string')
      : [];
    out[memberId] = sanitizeRoom(profile, memberId, storedFriends);
  }
  return out;
}

/** Re-apply the live household roster so a saved friend id from another house cannot linger. */
export function roomForMember(
  rooms: Record<string, KidRoomProfile>,
  memberId: string,
  allowedFriendIds: string[],
): KidRoomProfile {
  return sanitizeRoom(rooms[memberId], memberId, allowedFriendIds, rooms[memberId]?.updatedAt ?? Date.now());
}

export function saveRooms(rooms: Record<string, KidRoomProfile>): void {
  saveJSON(ROOMS_KEY, rooms);
}

export type BuyThemeResult =
  | { ok: true; profile: KidRoomProfile; balance: PointsBalance; spent: number }
  | { ok: false; reason: 'unknown-theme' | 'not-enough-points' };

export function buyTheme(
  profile: KidRoomProfile,
  themeId: string,
  balance: PointsBalance,
  redemptions: RewardRedemption[],
  now = Date.now(),
): BuyThemeResult {
  const pack = themeById(themeId);
  if (!pack) return { ok: false, reason: 'unknown-theme' };
  if (profile.ownedThemeIds.includes(themeId)) {
    return {
      ok: true,
      profile: { ...profile, themeId, updatedAt: now },
      balance: { ...balance },
      spent: 0,
    };
  }
  const have = balance[profile.memberId] ?? 0;
  const spendable = computeSpendable(have, redemptions, profile.memberId);
  if (spendable < pack.cost) return { ok: false, reason: 'not-enough-points' };
  const nextBalance = { ...balance, [profile.memberId]: have - pack.cost };
  return {
    ok: true,
    profile: {
      ...profile,
      themeId,
      ownedThemeIds: [...profile.ownedThemeIds, themeId],
      updatedAt: now,
    },
    balance: nextBalance,
    spent: pack.cost,
  };
}

export function loadJournal(memberId: string): JournalEntry[] {
  if (!memberId) return [];
  try {
    const raw = localStorage.getItem(journalStorageKey(memberId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((row) => {
      if (!row || typeof row !== 'object') return [];
      const entry = row as Partial<JournalEntry>;
      const body = clip(entry.body, JOURNAL_MAX);
      if (!body || typeof entry.id !== 'string') return [];
      const createdAt = typeof entry.createdAt === 'number' ? entry.createdAt : Date.now();
      const updatedAt = typeof entry.updatedAt === 'number' ? entry.updatedAt : createdAt;
      return [{ id: entry.id, body, createdAt, updatedAt }];
    });
  } catch {
    return [];
  }
}

function writeJournal(memberId: string, entries: JournalEntry[]): JournalEntry[] {
  localStorage.setItem(journalStorageKey(memberId), JSON.stringify(entries));
  return entries;
}

export function addJournalEntry(memberId: string, body: string, now = Date.now()): JournalEntry[] | null {
  const text = clip(body, JOURNAL_MAX).trim();
  if (!memberId || !text) return null;
  const next = [{ id: uid(), body: text, createdAt: now, updatedAt: now }, ...loadJournal(memberId)];
  return writeJournal(memberId, next);
}

export function updateJournalEntry(memberId: string, entryId: string, body: string, now = Date.now()): JournalEntry[] | null {
  const text = clip(body, JOURNAL_MAX).trim();
  if (!memberId || !text) return null;
  const current = loadJournal(memberId);
  if (!current.some((e) => e.id === entryId)) return null;
  const next = current.map((e) => (e.id === entryId ? { ...e, body: text, updatedAt: now } : e));
  return writeJournal(memberId, next);
}

export function deleteJournalEntry(memberId: string, entryId: string): JournalEntry[] {
  const next = loadJournal(memberId).filter((e) => e.id !== entryId);
  return writeJournal(memberId, next);
}
