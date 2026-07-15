import React, { useState } from 'react';
import { Plus, Trash2, CheckCircle2, Circle, MessageSquare, HelpCircle, Camera, List, Tv, Gamepad2, Check, X } from 'lucide-react';
import { loadJSON, saveJSON, uid, canDelete, User } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';

const FamilyHub: React.FC = () => {
  const { currentRole, householdMembers } = useAppContext();
  const [tab, setTab] = useState<'messages' | 'ask' | 'moments' | 'bucket' | 'watchlist' | 'gamenight'>('messages');
  const isAdm = currentRole && canDelete(currentRole);

  const TABS = [
    { id: 'messages' as const, label: 'Messages', icon: MessageSquare },
    { id: 'ask' as const, label: 'Ask Parents', icon: HelpCircle },
    { id: 'moments' as const, label: 'Moments', icon: Camera },
    { id: 'bucket' as const, label: 'Bucket List', icon: List },
    { id: 'watchlist' as const, label: 'Watchlist', icon: Tv },
    { id: 'gamenight' as const, label: 'Game Night', icon: Gamepad2 },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Family Hub</h2>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition ${tab === t.id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>
      {tab === 'messages' && <MessagesTab isAdm={!!isAdm} />}
      {tab === 'ask' && <AskParentsTab isAdm={!!isAdm} />}
      {tab === 'moments' && <MomentsTab isAdm={!!isAdm} />}
      {tab === 'bucket' && <BucketListTab isAdm={!!isAdm} />}
      {tab === 'watchlist' && <WatchlistTab isAdm={!!isAdm} />}
      {tab === 'gamenight' && <GameNightTab isAdm={!!isAdm} householdMembers={householdMembers} />}
    </div>
  );
};

interface Message { id: string; author: string; text: string; createdAt: number; deletedAt?: number; }

const MessagesTab: React.FC<{ isAdm: boolean }> = ({ isAdm }) => {
  const { currentUser } = useAppContext();
  const [messages, setMessages] = useState<Message[]>(() => loadJSON('familyos_messages', []));
  const [text, setText] = useState('');
  const save = (next: Message[]) => { setMessages(next); saveJSON('familyos_messages', next); };
  const post = () => {
    if (!text.trim() || !currentUser) return;
    save([...messages, { id: uid(), author: currentUser.name, text: text.trim(), createdAt: Date.now() }]);
    setText('');
  };
  const del = (id: string) => { if (isAdm) save(messages.map(m => m.id === id ? { ...m, deletedAt: Date.now() } : m)); };

  const active = messages.filter(m => !m.deletedAt).reverse();

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && post()} placeholder="Post a message to the family..." className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:border-indigo-500 outline-none" />
        <button onClick={post} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg transition"><MessageSquare className="w-4 h-4" /></button>
      </div>
      {active.length === 0 && <div className="text-center text-slate-500 py-6 text-sm">No messages yet. Post something!</div>}
      <div className="space-y-2">
        {active.map(m => (
          <div key={m.id} className="bg-slate-800/40 border border-slate-700 rounded-xl px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm">{m.text}</div>
                <div className="text-slate-500 text-xs mt-1">{m.author} · {new Date(m.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
              </div>
              {isAdm && <button onClick={() => del(m.id)} className="text-slate-600 hover:text-rose-400 transition"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface AskItem { id: string; kid: string; request: string; status: 'pending' | 'approved' | 'denied'; createdAt: number; deletedAt?: number; }

const AskParentsTab: React.FC<{ isAdm: boolean }> = ({ isAdm }) => {
  const { currentUser } = useAppContext();
  const [items, setItems] = useState<AskItem[]>(() => loadJSON('familyos_ask_parents', []));
  const [request, setRequest] = useState('');
  const save = (next: AskItem[]) => { setItems(next); saveJSON('familyos_ask_parents', next); };
  const submit = () => {
    if (!request.trim() || !currentUser) return;
    save([...items, { id: uid(), kid: currentUser.name, request: request.trim(), status: 'pending', createdAt: Date.now() }]);
    setRequest('');
  };
  const setStatus = (id: string, status: 'approved' | 'denied') => {
    if (!isAdm) return;
    save(items.map(i => i.id === id ? { ...i, status } : i));
  };
  const del = (id: string) => { if (isAdm) save(items.map(i => i.id === id ? { ...i, deletedAt: Date.now() } : i)); };

  const active = items.filter(i => !i.deletedAt).reverse();
  const pending = active.filter(i => i.status === 'pending');
  const resolved = active.filter(i => i.status !== 'pending');

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={request} onChange={e => setRequest(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="Ask permission for something..." className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:border-indigo-500 outline-none" />
        <button onClick={submit} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg transition"><Plus className="w-4 h-4" /></button>
      </div>
      {active.length === 0 && <div className="text-center text-slate-500 py-6 text-sm">No requests yet.</div>}
      {pending.length > 0 && (
        <div className="space-y-2">
          <div className="text-slate-400 text-xs uppercase tracking-wide">Pending</div>
          {pending.map(i => (
            <div key={i.id} className="bg-slate-800/40 border border-amber-500/30 rounded-xl px-4 py-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm">{i.request}</div>
                  <div className="text-slate-500 text-xs">{i.kid} · {new Date(i.createdAt).toLocaleDateString()}</div>
                </div>
                {isAdm && (
                  <div className="flex gap-1.5">
                    <button onClick={() => setStatus(i.id, 'approved')} className="text-emerald-400 hover:text-emerald-300 transition"><Check className="w-4 h-4" /></button>
                    <button onClick={() => setStatus(i.id, 'denied')} className="text-rose-400 hover:text-rose-300 transition"><X className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {resolved.length > 0 && (
        <div className="space-y-2">
          <div className="text-slate-500 text-xs uppercase tracking-wide">Resolved</div>
          {resolved.map(i => (
            <div key={i.id} className={`flex items-center gap-3 rounded-xl px-4 py-2.5 opacity-60 ${i.status === 'approved' ? 'bg-emerald-900/20 border border-emerald-500/20' : 'bg-rose-900/20 border border-rose-500/20'}`}>
              <div className="flex-1 min-w-0">
                <div className="text-slate-300 text-sm">{i.request}</div>
                <div className="text-slate-500 text-xs">{i.kid}</div>
              </div>
              <span className={`text-xs font-semibold ${i.status === 'approved' ? 'text-emerald-400' : 'text-rose-400'}`}>{i.status}</span>
              {isAdm && <button onClick={() => del(i.id)} className="text-slate-600 hover:text-rose-400 transition"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface Moment { id: string; caption: string; emoji: string; date: string; author: string; createdAt: number; deletedAt?: number; }

const MomentsTab: React.FC<{ isAdm: boolean }> = ({ isAdm }) => {
  const { currentUser } = useAppContext();
  const [moments, setMoments] = useState<Moment[]>(() => loadJSON('familyos_moments', []));
  const [caption, setCaption] = useState('');
  const [emoji, setEmoji] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [showForm, setShowForm] = useState(false);
  const save = (next: Moment[]) => { setMoments(next); saveJSON('familyos_moments', next); };
  const add = () => {
    if (!caption.trim() || !currentUser) return;
    save([{ id: uid(), caption: caption.trim(), emoji, date, author: currentUser.name, createdAt: Date.now() }, ...moments]);
    setCaption(''); setEmoji(''); setShowForm(false);
  };
  const del = (id: string) => { if (isAdm) save(moments.map(m => m.id === id ? { ...m, deletedAt: Date.now() } : m)); };
  const active = moments.filter(m => !m.deletedAt);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-slate-400 text-sm">{active.length} memories</span>
        <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-2.5 py-1.5 rounded-lg transition"><Plus className="w-3.5 h-3.5" /> Add Moment</button>
      </div>
      {showForm && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-slate-400 text-xs mb-1 block">Caption</label>
              <input value={caption} onChange={e => setCaption(e.target.value)} placeholder="A memory to remember..." className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-sm placeholder-slate-500 outline-none" autoFocus />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Emoji (optional)</label>
              <input value={emoji} onChange={e => setEmoji(e.target.value)} placeholder="🎉" className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-sm outline-none" />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-slate-400 text-xs hover:text-white transition">Cancel</button>
            <button onClick={add} className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1 rounded transition">Save</button>
          </div>
        </div>
      )}
      {active.length === 0 && <div className="text-center text-slate-500 py-6 text-sm">No moments saved yet.</div>}
      <div className="space-y-2">
        {active.map(m => (
          <div key={m.id} className="flex items-start gap-3 bg-slate-800/40 border border-slate-700 rounded-xl px-4 py-3">
            {m.emoji && <div className="text-2xl flex-shrink-0">{m.emoji}</div>}
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm">{m.caption}</div>
              <div className="text-slate-500 text-xs">{m.author} · {m.date}</div>
            </div>
            {isAdm && <button onClick={() => del(m.id)} className="text-slate-600 hover:text-rose-400 transition"><Trash2 className="w-3.5 h-3.5" /></button>}
          </div>
        ))}
      </div>
    </div>
  );
};

interface BucketItem { id: string; text: string; completed: boolean; createdAt: number; deletedAt?: number; }

const BucketListTab: React.FC<{ isAdm: boolean }> = ({ isAdm }) => {
  const [items, setItems] = useState<BucketItem[]>(() => loadJSON('familyos_bucket_list', []));
  const [text, setText] = useState('');
  const save = (next: BucketItem[]) => { setItems(next); saveJSON('familyos_bucket_list', next); };
  const add = () => {
    if (!text.trim()) return;
    save([...items, { id: uid(), text: text.trim(), completed: false, createdAt: Date.now() }]);
    setText('');
  };
  const toggle = (id: string) => save(items.map(i => i.id === id ? { ...i, completed: !i.completed } : i));
  const del = (id: string) => { if (isAdm) save(items.map(i => i.id === id ? { ...i, deletedAt: Date.now() } : i)); };
  const active = items.filter(i => !i.deletedAt);
  const open = active.filter(i => !i.completed);
  const done = active.filter(i => i.completed);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Something to do together..." className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:border-indigo-500 outline-none" />
        <button onClick={add} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg transition"><Plus className="w-4 h-4" /></button>
      </div>
      {active.length === 0 && <div className="text-center text-slate-500 py-6 text-sm">The family bucket list is empty!</div>}
      <div className="space-y-2">
        {open.map(i => (
          <div key={i.id} className="flex items-center gap-3 bg-slate-800/40 border border-slate-700 rounded-xl px-4 py-3">
            <button onClick={() => toggle(i.id)} className="text-slate-400 hover:text-emerald-400 transition flex-shrink-0"><Circle className="w-5 h-5" /></button>
            <div className="flex-1 text-white text-sm">{i.text}</div>
            {isAdm && <button onClick={() => del(i.id)} className="text-slate-600 hover:text-rose-400 transition"><Trash2 className="w-4 h-4" /></button>}
          </div>
        ))}
        {done.length > 0 && (
          <>
            <div className="text-slate-500 text-xs uppercase tracking-wide mt-2">Done ({done.length})</div>
            {done.map(i => (
              <div key={i.id} className="flex items-center gap-3 bg-slate-900/30 border border-slate-800 rounded-xl px-4 py-2.5 opacity-60">
                <button onClick={() => toggle(i.id)} className="text-emerald-500 flex-shrink-0"><CheckCircle2 className="w-5 h-5" /></button>
                <div className="flex-1 text-slate-400 text-sm line-through">{i.text}</div>
                {isAdm && <button onClick={() => del(i.id)} className="text-slate-600 hover:text-rose-400 transition"><Trash2 className="w-4 h-4" /></button>}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

interface WatchItem { id: string; title: string; type: 'movie' | 'show'; wantsToWatch: string[]; watched: boolean; createdAt: number; deletedAt?: number; }

const WatchlistTab: React.FC<{ isAdm: boolean }> = ({ isAdm }) => {
  const { currentUser } = useAppContext();
  const [items, setItems] = useState<WatchItem[]>(() => loadJSON('familyos_watchlist', []));
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'movie' | 'show'>('movie');
  const save = (next: WatchItem[]) => { setItems(next); saveJSON('familyos_watchlist', next); };
  const add = () => {
    if (!title.trim() || !currentUser) return;
    save([...items, { id: uid(), title: title.trim(), type, wantsToWatch: [currentUser.name], watched: false, createdAt: Date.now() }]);
    setTitle('');
  };
  const toggleWant = (id: string) => {
    if (!currentUser) return;
    save(items.map(i => i.id === id ? {
      ...i,
      wantsToWatch: i.wantsToWatch.includes(currentUser.name)
        ? i.wantsToWatch.filter(n => n !== currentUser.name)
        : [...i.wantsToWatch, currentUser.name]
    } : i));
  };
  const toggleWatched = (id: string) => save(items.map(i => i.id === id ? { ...i, watched: !i.watched } : i));
  const del = (id: string) => { if (isAdm) save(items.map(i => i.id === id ? { ...i, deletedAt: Date.now() } : i)); };
  const active = items.filter(i => !i.deletedAt);
  const unwatched = active.filter(i => !i.watched);
  const watched = active.filter(i => i.watched);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Movie or show title..." className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:border-indigo-500 outline-none" />
        <select value={type} onChange={e => setType(e.target.value as 'movie' | 'show')} className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-white text-sm outline-none">
          <option value="movie">Movie</option>
          <option value="show">Show</option>
        </select>
        <button onClick={add} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg transition"><Plus className="w-4 h-4" /></button>
      </div>
      {active.length === 0 && <div className="text-center text-slate-500 py-6 text-sm">Watchlist is empty.</div>}
      <div className="space-y-2">
        {unwatched.map(i => (
          <div key={i.id} className="flex items-center gap-3 bg-slate-800/40 border border-slate-700 rounded-xl px-4 py-3">
            <button onClick={() => toggleWatched(i.id)} className="text-slate-400 hover:text-emerald-400 transition flex-shrink-0"><Circle className="w-5 h-5" /></button>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm">{i.title}</div>
              <div className="text-slate-500 text-xs">{i.type} · Wants: {i.wantsToWatch.join(', ') || 'none'}</div>
            </div>
            <button onClick={() => toggleWant(i.id)} className={`text-xs px-2 py-0.5 rounded border transition ${currentUser && i.wantsToWatch.includes(currentUser.name) ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300' : 'border-slate-700 text-slate-500 hover:text-white'}`}>
              {currentUser && i.wantsToWatch.includes(currentUser.name) ? 'Watching' : '+ Watch'}
            </button>
            {isAdm && <button onClick={() => del(i.id)} className="text-slate-600 hover:text-rose-400 transition"><Trash2 className="w-4 h-4" /></button>}
          </div>
        ))}
        {watched.length > 0 && (
          <>
            <div className="text-slate-500 text-xs uppercase tracking-wide mt-2">Watched</div>
            {watched.map(i => (
              <div key={i.id} className="flex items-center gap-3 bg-slate-900/30 border border-slate-800 rounded-xl px-4 py-2.5 opacity-60">
                <button onClick={() => toggleWatched(i.id)} className="text-emerald-500 flex-shrink-0"><CheckCircle2 className="w-5 h-5" /></button>
                <div className="flex-1 text-slate-400 text-sm line-through">{i.title}</div>
                {isAdm && <button onClick={() => del(i.id)} className="text-slate-600 hover:text-rose-400 transition"><Trash2 className="w-4 h-4" /></button>}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

interface Game { id: string; name: string; scores: { player: string; score: number; date: string }[]; createdAt: number; }

const GameNightTab: React.FC<{ isAdm: boolean; householdMembers: User[] }> = ({ isAdm, householdMembers }) => {
  const { currentUser } = useAppContext();
  const [games, setGames] = useState<Game[]>(() => loadJSON('familyos_games', []));
  const [gameName, setGameName] = useState('');
  const [expandedGame, setExpandedGame] = useState<string | null>(null);
  const [scorePlayer, setScorePlayer] = useState(householdMembers.length > 0 ? householdMembers[0].name : '');
  const [scoreValue, setScoreValue] = useState('');
  const [scoreDate, setScoreDate] = useState(new Date().toISOString().slice(0, 10));
  const save = (next: Game[]) => { setGames(next); saveJSON('familyos_games', next); };
  const addGame = () => {
    if (!gameName.trim()) return;
    save([...games, { id: uid(), name: gameName.trim(), scores: [], createdAt: Date.now() }]);
    setGameName('');
  };
  const addScore = (gameId: string) => {
    if (!scoreValue) return;
    save(games.map(g => g.id === gameId ? { ...g, scores: [...g.scores, { player: scorePlayer, score: parseFloat(scoreValue), date: scoreDate }] } : g));
    setScoreValue('');
  };
  const delGame = (id: string) => { if (isAdm) save(games.filter(g => g.id !== id)); };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={gameName} onChange={e => setGameName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addGame()} placeholder="Add a game..." className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:border-indigo-500 outline-none" />
        <button onClick={addGame} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg transition"><Plus className="w-4 h-4" /></button>
      </div>
      {games.length === 0 && <div className="text-center text-slate-500 py-6 text-sm">No games yet. Add one!</div>}
      <div className="space-y-2">
        {games.map(g => {
          const isExp = expandedGame === g.id;
          const playerScores: Record<string, number[]> = {};
          g.scores.forEach(s => { if (!playerScores[s.player]) playerScores[s.player] = []; playerScores[s.player].push(s.score); });
          const leaders = Object.entries(playerScores).map(([p, sc]) => ({ p, best: Math.max(...sc) })).sort((a, b) => b.best - a.best);
          return (
            <div key={g.id} className="bg-slate-800/40 border border-slate-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-800/60" onClick={() => setExpandedGame(isExp ? null : g.id)}>
                <div className="flex-1">
                  <div className="text-white font-medium">{g.name}</div>
                  <div className="text-slate-500 text-xs">{g.scores.length} games played</div>
                  {leaders.length > 0 && <div className="text-slate-400 text-xs">{leaders[0].p}: {leaders[0].best}</div>}
                </div>
                {isAdm && <button onClick={e => { e.stopPropagation(); delGame(g.id); }} className="text-slate-600 hover:text-rose-400 transition"><Trash2 className="w-4 h-4" /></button>}
              </div>
              {isExp && (
                <div className="border-t border-slate-700/50 px-4 py-3 space-y-3">
                  <div className="flex gap-2 flex-wrap">
                    <select value={scorePlayer} onChange={e => setScorePlayer(e.target.value)} className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs outline-none">
                      {householdMembers.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                    </select>
                    <input type="number" value={scoreValue} onChange={e => setScoreValue(e.target.value)} placeholder="Score" className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs placeholder-slate-500 outline-none" />
                    <input type="date" value={scoreDate} onChange={e => setScoreDate(e.target.value)} className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs outline-none" />
                    <button onClick={() => addScore(g.id)} className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1 rounded transition">Log Score</button>
                  </div>
                  <div className="space-y-1">
                    {leaders.map(({ p, best }) => (
                      <div key={p} className="flex justify-between text-sm">
                        <span className="text-slate-300">{p}</span>
                        <span className="text-slate-400">Best: {best}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FamilyHub;
