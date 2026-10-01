import React, { useEffect, useState } from 'react';
import { KEYS, loadPointsBalance, loadRedemptions, saveJSON, type User } from '@/lib/familyos';
import { onSyncUpdate } from '@/lib/sync';
import { useAppContext } from '@/contexts/AppContext';
import {
  AVATARS,
  MOODS,
  ROOMS_KEY,
  THEME_PACKS,
  addJournalEntry,
  buyTheme,
  deleteJournalEntry,
  loadJournal,
  loadRooms,
  roomForMember,
  sanitizeRoom,
  saveRooms,
  themeById,
  updateJournalEntry,
  type JournalEntry,
  type KidRoomProfile,
} from '@/lib/kidRoom';

function formatWhen(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const KidRoom: React.FC = () => {
  const { currentUser, currentRole, householdMembers } = useAppContext();
  const [rooms, setRooms] = useState(loadRooms);
  const [balance, setBalance] = useState(loadPointsBalance);
  const [redemptions, setRedemptions] = useState(loadRedemptions);
  const [journalOpen, setJournalOpen] = useState(false);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const kids: User[] = householdMembers.filter((m) => m.role === 'child');
  const viewerIsChild = currentRole === 'child' && !!currentUser;
  const roster = viewerIsChild && currentUser && !kids.some((m) => m.id === currentUser.id)
    ? [currentUser, ...kids]
    : kids;
  const [selectedId, setSelectedId] = useState(() => (
    currentRole === 'child' && currentUser ? currentUser.id : kids[0]?.id ?? ''
  ));

  useEffect(() => onSyncUpdate((key) => {
    if (key === ROOMS_KEY || key === '*') setRooms(loadRooms());
    if (key === KEYS.points || key === '*') setBalance(loadPointsBalance());
    if (key === KEYS.redemptions || key === '*') setRedemptions(loadRedemptions());
  }), []);

  useEffect(() => {
    if (!selectedId && roster[0]) setSelectedId(roster[0].id);
  }, [selectedId, roster]);

  const friendIds = householdMembers.map((m) => m.id);
  const profile = selectedId ? roomForMember(rooms, selectedId, friendIds) : null;
  const owner = !!(profile && viewerIsChild && currentUser?.id === profile.memberId);
  const theme = themeById(profile?.themeId ?? 'den') ?? THEME_PACKS[0];
  const person = roster.find((m) => m.id === selectedId) ?? householdMembers.find((m) => m.id === selectedId);
  const spendable = profile
    ? (balance[profile.memberId] ?? 0) - redemptions
      .filter((r) => r.memberId === profile.memberId && r.status === 'pending')
      .reduce((sum, r) => sum + r.cost, 0)
    : 0;

  const persist = (patch: Partial<KidRoomProfile>) => {
    if (!selectedId) return;
    const allowed = householdMembers.map((m) => m.id);
    const live = roomForMember(loadRooms(), selectedId, allowed);
    const next = sanitizeRoom({ ...live, ...patch, memberId: selectedId, updatedAt: Date.now() }, selectedId, allowed);
    const saved = { ...loadRooms(), [selectedId]: next };
    setRooms(saved);
    saveRooms(saved);
  };

  const openJournal = () => {
    if (!owner || !profile) {
      setNotice('That door opens only for the kid who lives here, on their own sign-in.');
      return;
    }
    setEntries(loadJournal(profile.memberId));
    setJournalOpen(true);
    setNotice(null);
  };

  const switchRoom = (id: string) => {
    setSelectedId(id);
    setJournalOpen(false);
    setDraft('');
    setEditingId(null);
    setNotice(null);
  };

  if (!profile || roster.length === 0) {
    return (
      <div className="rounded-2xl border border-bark-600 bg-bark-800 p-6 text-cream-100">
        <h3 className="text-lg font-bold">No kid rooms yet</h3>
        <p className="mt-2 text-sm text-cream-300">Add a household member with the child role. Their room shows up here.</p>
      </div>
    );
  }

  const friends = profile.topFriendIds
    .map((id) => householdMembers.find((m) => m.id === id))
    .filter((m): m is User => !!m);

  const saveEntry = () => {
    if (!owner) return;
    const next = editingId
      ? updateJournalEntry(profile.memberId, editingId, draft)
      : addJournalEntry(profile.memberId, draft);
    if (!next) return;
    setEntries(next);
    setDraft('');
    setEditingId(null);
  };

  return (
    <div className="rounded-2xl p-4 sm:p-6 shadow-xl" style={{ background: theme.background, color: theme.ink }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em]" style={{ color: theme.accent }}>a room of their own</p>
          <h3 className="text-2xl font-black">{person?.name ?? 'Kid'}&apos;s page</h3>
        </div>
        {roster.length > 1 && (
          <label className="text-sm">
            <span className="sr-only">Whose room</span>
            <select
              value={selectedId}
              onChange={(e) => switchRoom(e.target.value)}
              className="rounded-lg border px-2 py-1 text-sm"
              style={{ background: theme.card, color: theme.ink, borderColor: theme.border }}
            >
              {roster.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="rounded-2xl border p-4 text-center" style={{ background: theme.card, borderColor: theme.border }}>
          <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full text-6xl" style={{ background: theme.background, border: `3px solid ${theme.accent}` }}>
            {profile.avatar}
          </div>
          <p className="mt-3 text-lg font-bold">{person?.name}</p>
          <p className="text-sm" style={{ color: theme.accent }}>{profile.mood}</p>
          <p className="mt-2 text-sm" style={{ color: theme.muted }}>{profile.status}</p>
          {owner && <p className="mt-3 text-xs" style={{ color: theme.muted }}>{spendable} points to spend</p>}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border p-4" style={{ background: theme.card, borderColor: theme.border }}>
            <h4 className="text-xs uppercase tracking-widest" style={{ color: theme.accent }}>About me</h4>
            <p className="mt-2 min-h-16 whitespace-pre-wrap text-sm">{profile.about || 'Nothing on the wall yet.'}</p>
            <h4 className="mt-4 text-xs uppercase tracking-widest" style={{ color: theme.accent }}>Now playing</h4>
            <p className="mt-1 text-sm">{profile.listening || 'Silence. For now.'}</p>
          </section>
          <section className="rounded-2xl border p-4" style={{ background: theme.card, borderColor: theme.border }}>
            <h4 className="text-xs uppercase tracking-widest" style={{ color: theme.accent }}>Top 8</h4>
            {friends.length === 0 ? (
              <p className="mt-2 text-sm" style={{ color: theme.muted }}>Nobody pinned yet.</p>
            ) : (
              <ol className="mt-2 space-y-1 text-sm">
                {friends.map((m, i) => (
                  <li key={m.id}>{i + 1}. {m.name}</li>
                ))}
              </ol>
            )}
            <button
              type="button"
              onClick={openJournal}
              className="mt-4 w-full rounded-xl border px-3 py-2 text-left text-sm font-semibold"
              style={{ borderColor: theme.accent, color: theme.ink }}
            >
              Secret journal
              <span className="mt-1 block text-xs font-normal" style={{ color: theme.muted }}>
                {owner ? 'Only you can open this door.' : 'Locked. Not part of the family record.'}
              </span>
            </button>
          </section>
        </div>
      </div>

      {notice && <p className="mt-3 text-sm" style={{ color: theme.accent }}>{notice}</p>}

      {journalOpen && owner && (
        <section className="mt-4 rounded-2xl border p-4" style={{ background: theme.card, borderColor: theme.border }}>
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-bold">Journal</h4>
            <button type="button" onClick={() => setJournalOpen(false)} className="text-sm underline" style={{ color: theme.accent }}>Back to the room</button>
          </div>
          <p className="mt-1 text-xs" style={{ color: theme.muted }}>
            These pages stay on this device. They are not copied into the family record. Signing out clears them with the rest of this household&apos;s cache.
          </p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={4000}
            rows={4}
            placeholder="Write something only you will see here."
            className="mt-3 w-full rounded-xl border p-3 text-sm"
            style={{ background: 'transparent', color: theme.ink, borderColor: theme.border }}
          />
          <button type="button" onClick={saveEntry} className="mt-2 rounded-lg px-3 py-1.5 text-sm font-semibold" style={{ background: theme.accent, color: theme.id === 'sketch' ? '#fffaf3' : '#1a120c' }}>
            {editingId ? 'Update entry' : 'Save entry'}
          </button>
          <ul className="mt-4 space-y-3">
            {entries.map((entry) => (
              <li key={entry.id} className="rounded-xl border p-3 text-sm" style={{ borderColor: theme.border }}>
                <p className="whitespace-pre-wrap">{entry.body}</p>
                <p className="mt-2 text-xs" style={{ color: theme.muted }}>{formatWhen(entry.updatedAt)}</p>
                <div className="mt-2 flex gap-3 text-xs">
                  <button type="button" className="underline" onClick={() => { setEditingId(entry.id); setDraft(entry.body); }}>Edit</button>
                  <button type="button" className="underline" onClick={() => setEntries(deleteJournalEntry(profile.memberId, entry.id))}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {owner && !journalOpen && (
        <>
          <section className="mt-4 rounded-2xl border p-4" style={{ background: theme.card, borderColor: theme.border }}>
            <h4 className="font-bold">Decorate</h4>
            <div className="mt-3 flex flex-wrap gap-2">
              {AVATARS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => persist({ avatar: emoji })}
                  className="rounded-lg border px-2 py-1 text-2xl"
                  style={{ borderColor: profile.avatar === emoji ? theme.accent : theme.border }}
                  aria-label={`Avatar ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                Mood
                <select
                  value={profile.mood}
                  onChange={(e) => persist({ mood: e.target.value })}
                  className="mt-1 w-full rounded-lg border px-2 py-1"
                  style={{ background: 'transparent', color: theme.ink, borderColor: theme.border }}
                >
                  {MOODS.map((mood) => <option key={mood} value={mood}>{mood}</option>)}
                </select>
              </label>
              <label className="text-sm">
                Status
                <input
                  value={profile.status}
                  maxLength={140}
                  onChange={(e) => persist({ status: e.target.value })}
                  className="mt-1 w-full rounded-lg border px-2 py-1"
                  style={{ background: 'transparent', color: theme.ink, borderColor: theme.border }}
                />
              </label>
              <label className="text-sm md:col-span-2">
                About me
                <textarea
                  value={profile.about}
                  maxLength={500}
                  rows={3}
                  onChange={(e) => persist({ about: e.target.value })}
                  className="mt-1 w-full rounded-lg border px-2 py-1"
                  style={{ background: 'transparent', color: theme.ink, borderColor: theme.border }}
                />
              </label>
              <label className="text-sm md:col-span-2">
                Now playing
                <input
                  value={profile.listening}
                  maxLength={80}
                  onChange={(e) => persist({ listening: e.target.value })}
                  className="mt-1 w-full rounded-lg border px-2 py-1"
                  style={{ background: 'transparent', color: theme.ink, borderColor: theme.border }}
                />
              </label>
            </div>
            <fieldset className="mt-3">
              <legend className="text-sm font-semibold">Top 8</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {householdMembers.filter((m) => m.id !== profile.memberId).map((m) => {
                      const on = profile.topFriendIds.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            const liveIds = roomForMember(loadRooms(), profile.memberId, friendIds).topFriendIds;
                            const topFriendIds = liveIds.includes(m.id)
                              ? liveIds.filter((id) => id !== m.id)
                              : [...liveIds, m.id].slice(0, 8);
                            persist({ topFriendIds });
                          }}
                      className="rounded-full border px-3 py-1 text-xs"
                      style={{ borderColor: on ? theme.accent : theme.border, color: theme.ink }}
                    >
                      {on ? '★ ' : ''}{m.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </section>

          <section className="mt-4">
            <h4 className="font-bold">Theme packs</h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {THEME_PACKS.map((pack) => {
                const owned = profile.ownedThemeIds.includes(pack.id);
                const equipped = profile.themeId === pack.id;
                return (
                  <article key={pack.id} className="rounded-2xl border p-3" style={{ background: pack.background, color: pack.ink, borderColor: pack.border }}>
                    <h5 className="font-bold">{pack.name}</h5>
                    <p className="mt-1 text-xs" style={{ color: pack.muted }}>{pack.blurb}</p>
                    <p className="mt-2 text-sm">{pack.cost === 0 ? 'Free' : `${pack.cost} points`}</p>
                    <button
                      type="button"
                      disabled={equipped}
                      onClick={() => {
                        const live = roomForMember(loadRooms(), profile.memberId, friendIds);
                        if (live.ownedThemeIds.includes(pack.id)) {
                          persist({ themeId: pack.id, ownedThemeIds: live.ownedThemeIds });
                          setNotice(null);
                          return;
                        }
                        const result = buyTheme(live, pack.id, loadPointsBalance(), loadRedemptions());
                        if (result.ok === false) {
                          setNotice(result.reason === 'not-enough-points'
                            ? `Need ${pack.cost} points. You can spend ${spendable}.`
                            : 'That pack is not in the shop.');
                          return;
                        }
                        persist(result.profile);
                        setBalance(result.balance);
                        saveJSON(KEYS.points, result.balance);
                        setNotice(result.spent > 0 ? `Bought ${pack.name} for ${result.spent} points.` : null);
                      }}
                      className="mt-3 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                      style={{ background: pack.accent, color: pack.id === 'sketch' ? '#fffaf3' : '#1a120c' }}
                    >
                      {equipped ? 'On the walls' : owned ? 'Use this' : 'Buy and use'}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}

      {!owner && (
        <p className="mt-4 text-xs" style={{ color: theme.muted }}>
          You can visit this page. {person?.name ?? 'They'} decorate it, buy themes with their reward points, and keep the journal on their own sign-in.
        </p>
      )}
    </div>
  );
};

export default KidRoom;
