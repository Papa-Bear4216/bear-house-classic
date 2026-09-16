import React, { useState, useEffect } from 'react';
import { Plus, Trash2, CheckCircle2, Circle, MessageSquare, HelpCircle, Camera, List, Tv, Gamepad2, Check, X, Sparkles, Heart, Trophy } from 'lucide-react';
import { loadJSON, saveJSON, uid, canDelete, User } from '@/lib/familyos';
import { onSyncUpdate } from '@/lib/sync';
import { useAppContext } from '@/contexts/AppContext';
import { triggerConfetti } from '@/lib/confetti';

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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2.5 tracking-tight">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm shadow-amber-500/10">
              <Heart className="w-5 h-5" />
            </div>
            Family Hub
          </h2>
          <p className="text-xs text-slate-400 mt-1">Chat, permissions, shared memories, watchlists & game nights</p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {TABS.map(t => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button 
              key={t.id} 
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition active:scale-95 focus-ring ${
                isActive 
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/20' 
                  : 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800/80 hover:border-slate-700/80'
              }`}
            >
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
  useEffect(() => onSyncUpdate((key) => {
    if (key !== 'familyos_messages' && key !== '*') return;
    setMessages(loadJSON('familyos_messages', []));
  }), []);
  const post = () => {
    if (!text.trim() || !currentUser) return;
    save([...messages, { id: uid(), author: currentUser.name, text: text.trim(), createdAt: Date.now() }]);
    setText('');
    triggerConfetti(undefined, undefined, 15);
  };
  const del = (id: string) => { if (isAdm) save(messages.map(m => m.id === id ? { ...m, deletedAt: Date.now() } : m)); };

  const active = messages.filter(m => !m.deletedAt).reverse();

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input 
          value={text} 
          onChange={e => setText(e.target.value)} 
          onKeyDown={e => e.key === 'Enter' && post()} 
          placeholder="Post a message to the family bulletin..." 
          className="flex-1 bg-slate-900/80 border border-slate-800/80 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition" 
        />
        <button 
          onClick={post} 
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl transition shadow-lg shadow-amber-500/20 active:scale-95 focus-ring flex items-center gap-1.5"
        >
          <MessageSquare className="w-4 h-4" /> Post
        </button>
      </div>

      {active.length === 0 && (
        <div className="text-center bg-slate-900/40 border border-slate-800/60 rounded-2xl py-10 px-4">
          <MessageSquare className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-60" />
          <p className="text-slate-400 text-sm font-medium">No messages posted yet.</p>
          <p className="text-slate-500 text-xs mt-0.5">Post something the whole household should see!</p>
        </div>
      )}

      <div className="space-y-2.5">
        {active.map(m => (
          <div key={m.id} className="bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-2xl px-4 py-3.5 shadow-md group">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-medium leading-relaxed">{m.text}</div>
                <div className="text-slate-500 text-xs mt-1.5 flex items-center gap-1.5 font-medium">
                  <span className="text-amber-400/90">{m.author}</span>
                  <span>·</span>
                  <span>{new Date(m.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                </div>
              </div>
              {isAdm && (
                <button 
                  onClick={() => del(m.id)} 
                  className="text-slate-500 hover:text-rose-400 transition p-1 opacity-60 group-hover:opacity-100 focus-ring"
                  title="Delete message"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
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
  useEffect(() => onSyncUpdate((key) => {
    if (key !== 'familyos_ask_parents' && key !== '*') return;
    setItems(loadJSON('familyos_ask_parents', []));
  }), []);
  const submit = () => {
    if (!request.trim() || !currentUser) return;
    save([...items, { id: uid(), kid: currentUser.name, request: request.trim(), status: 'pending', createdAt: Date.now() }]);
    setRequest('');
    triggerConfetti(undefined, undefined, 20);
  };
  const setStatus = (id: string, status: 'approved' | 'denied', e?: React.MouseEvent) => {
    if (!isAdm) return;
    if (status === 'approved') {
      if (e) triggerConfetti(e.clientX, e.clientY, 35);
      else triggerConfetti(undefined, undefined, 35);
    }
    save(items.map(i => i.id === id ? { ...i, status } : i));
  };
  const del = (id: string) => { if (isAdm) save(items.map(i => i.id === id ? { ...i, deletedAt: Date.now() } : m)); };

  const active = items.filter(i => !i.deletedAt).reverse();
  const pending = active.filter(i => i.status === 'pending');
  const resolved = active.filter(i => i.status !== 'pending');

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input 
          value={request} 
          onChange={e => setRequest(e.target.value)} 
          onKeyDown={e => e.key === 'Enter' && submit()} 
          placeholder="Ask permission for sleepovers, Robux, staying up late..." 
          className="flex-1 bg-slate-900/80 border border-slate-800/80 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition" 
        />
        <button 
          onClick={submit} 
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl transition shadow-lg shadow-amber-500/20 active:scale-95 focus-ring flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Ask
        </button>
      </div>

      {active.length === 0 && (
        <div className="text-center bg-slate-900/40 border border-slate-800/60 rounded-2xl py-10 px-4">
          <HelpCircle className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-60" />
          <p className="text-slate-400 text-sm font-medium">No permission requests right now.</p>
          <p className="text-slate-500 text-xs mt-0.5">Kids can submit requests here for instant parental decisions.</p>
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-2">
          <div className="text-amber-400/90 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>Pending Decisions ({pending.length})</span>
          </div>
          <div className="space-y-2">
            {pending.map(i => (
              <div key={i.id} className="bg-slate-900/70 backdrop-blur-md border border-amber-500/30 rounded-2xl px-4 py-3.5 shadow-md">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-semibold">{i.request}</div>
                    <div className="text-slate-400 text-xs mt-1">Requested by <span className="text-amber-400 font-medium">{i.kid}</span> · {new Date(i.createdAt).toLocaleDateString()}</div>
                  </div>
                  {isAdm && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button 
                        onClick={(e) => setStatus(i.id, 'approved', e)} 
                        className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 hover:bg-emerald-500/30 text-emerald-300 flex items-center justify-center transition active:scale-95 focus-ring"
                        title="Approve request"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setStatus(i.id, 'denied')} 
                        className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-500/40 hover:bg-rose-500/30 text-rose-300 flex items-center justify-center transition active:scale-95 focus-ring"
                        title="Deny request"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {resolved.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider">Previous Decisions</div>
          <div className="space-y-2">
            {resolved.map(i => (
              <div 
                key={i.id} 
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 border transition ${
                  i.status === 'approved' 
                    ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-300' 
                    : 'bg-rose-950/20 border-rose-500/20 text-rose-300'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-slate-200 text-sm font-medium">{i.request}</div>
                  <div className="text-slate-500 text-xs">{i.kid}</div>
                </div>
                <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                  i.status === 'approved' 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                }`}>
                  {i.status}
                </span>
                {isAdm && (
                  <button 
                    onClick={() => del(i.id)} 
                    className="text-slate-500 hover:text-rose-400 transition p-1 focus-ring"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface Moment { id: string; caption: string; emoji: string; date: string; author: string; createdAt: number; deletedAt?: number; }

const MomentsTab: React.FC<{ isAdm: boolean }> = ({ isAdm }) => {
  const { currentUser } = useAppContext();
  const [moments, setMoments] = useState<Moment[]>(() => loadJSON('familyos_moments', []));
  useEffect(() => onSyncUpdate((key) => {
    if (key !== 'familyos_moments' && key !== '*') return;
    setMoments(loadJSON('familyos_moments', []));
  }), []);
  const [caption, setCaption] = useState('');
  const [emoji, setEmoji] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [showForm, setShowForm] = useState(false);
  const save = (next: Moment[]) => { setMoments(next); saveJSON('familyos_moments', next); };
  const add = () => {
    if (!caption.trim() || !currentUser) return;
    save([{ id: uid(), caption: caption.trim(), emoji, date, author: currentUser.name, createdAt: Date.now() }, ...moments]);
    setCaption(''); setEmoji(''); setShowForm(false);
    triggerConfetti(undefined, undefined, 30);
  };
  const del = (id: string) => { if (isAdm) save(moments.map(m => m.id === id ? { ...m, deletedAt: Date.now() } : m)); };
  const active = moments.filter(m => !m.deletedAt);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">{active.length} Saved Moments</span>
        <button 
          onClick={() => setShowForm(f => !f)} 
          className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition shadow-lg shadow-amber-500/20 active:scale-95 focus-ring"
        >
          <Plus className="w-3.5 h-3.5" /> Add Moment
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-900/80 backdrop-blur-md border border-amber-500/30 rounded-2xl p-5 shadow-xl space-y-3 animate-in fade-in duration-200">
          <div className="font-semibold text-sm text-amber-400 flex items-center gap-2">
            <Camera className="w-4 h-4" /> Capture Family Memory
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-1 sm:col-span-2">
              <label className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-1 block">Caption</label>
              <input 
                value={caption} 
                onChange={e => setCaption(e.target.value)} 
                placeholder="A funny quote, milestone, or special day..." 
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2 text-white text-sm placeholder-slate-500 focus:border-amber-500 outline-none transition" 
                autoFocus 
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-1 block">Emoji</label>
              <input 
                value={emoji} 
                onChange={e => setEmoji(e.target.value)} 
                placeholder="🏖️ 🎂 🍕" 
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2 text-white text-sm outline-none" 
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-1 block">Date</label>
              <input 
                type="date" 
                value={date} 
                onChange={e => setDate(e.target.value)} 
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2 text-white text-sm outline-none" 
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button 
              onClick={() => setShowForm(false)} 
              className="text-slate-400 hover:text-white text-xs font-medium px-4 py-2 rounded-xl transition focus-ring"
            >
              Cancel
            </button>
            <button 
              onClick={add} 
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-5 py-2 rounded-xl transition shadow-lg shadow-amber-500/20 focus-ring"
            >
              Save Memory
            </button>
          </div>
        </div>
      )}

      {active.length === 0 && !showForm && (
        <div className="text-center bg-slate-900/40 border border-slate-800/60 rounded-2xl py-10 px-4">
          <Camera className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-60" />
          <p className="text-slate-400 text-sm font-medium">No moments saved yet.</p>
          <p className="text-slate-500 text-xs mt-0.5">Capture funny things kids say, victories, or milestone days.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {active.map(m => (
          <div key={m.id} className="flex items-start gap-3 bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-2xl px-4 py-3.5 shadow-md group">
            {m.emoji ? (
              <div className="text-2xl flex-shrink-0 w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">{m.emoji}</div>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-500 flex-shrink-0">
                <Sparkles className="w-4 h-4 text-amber-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-medium leading-relaxed">{m.caption}</div>
              <div className="text-slate-400 text-xs mt-1">{m.author} · {m.date}</div>
            </div>
            {isAdm && (
              <button 
                onClick={() => del(m.id)} 
                className="text-slate-500 hover:text-rose-400 transition p-1 opacity-60 group-hover:opacity-100 focus-ring"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
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
  useEffect(() => onSyncUpdate((key) => {
    if (key !== 'familyos_bucket_list' && key !== '*') return;
    setItems(loadJSON('familyos_bucket_list', []));
  }), []);
  const add = () => {
    if (!text.trim()) return;
    save([...items, { id: uid(), text: text.trim(), completed: false, createdAt: Date.now() }]);
    setText('');
    triggerConfetti(undefined, undefined, 20);
  };
  const toggle = (id: string, e?: React.MouseEvent) => {
    const item = items.find(i => i.id === id);
    if (item && !item.completed) {
      if (e) triggerConfetti(e.clientX, e.clientY, 35);
      else triggerConfetti(undefined, undefined, 35);
    }
    save(items.map(i => i.id === id ? { ...i, completed: !i.completed } : i));
  };
  const del = (id: string) => { if (isAdm) save(items.map(i => i.id === id ? { ...i, deletedAt: Date.now() } : i)); };
  const active = items.filter(i => !i.deletedAt);
  const open = active.filter(i => !i.completed);
  const done = active.filter(i => i.completed);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input 
          value={text} 
          onChange={e => setText(e.target.value)} 
          onKeyDown={e => e.key === 'Enter' && add()} 
          placeholder="Something we want to do together as a family..." 
          className="flex-1 bg-slate-900/80 border border-slate-800/80 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition" 
        />
        <button 
          onClick={add} 
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl transition shadow-lg shadow-amber-500/20 active:scale-95 focus-ring flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {active.length === 0 && (
        <div className="text-center bg-slate-900/40 border border-slate-800/60 rounded-2xl py-10 px-4">
          <List className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-60" />
          <p className="text-slate-400 text-sm font-medium">The bucket list is empty.</p>
          <p className="text-slate-500 text-xs mt-0.5">Add road trips, game marathons, park visits, or baking projects!</p>
        </div>
      )}

      <div className="space-y-2">
        {open.map(i => (
          <div key={i.id} className="flex items-center gap-3 bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-2xl px-4 py-3.5 shadow-md group">
            <button 
              onClick={(e) => toggle(i.id, e)} 
              className="text-slate-500 hover:text-emerald-400 transition flex-shrink-0 focus-ring"
              title="Mark as done!"
            >
              <Circle className="w-5 h-5" />
            </button>
            <div className="flex-1 text-white text-sm font-medium">{i.text}</div>
            {isAdm && (
              <button 
                onClick={() => del(i.id)} 
                className="text-slate-500 hover:text-rose-400 transition p-1 opacity-60 group-hover:opacity-100 focus-ring"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
        {done.length > 0 && (
          <div className="space-y-2 pt-2">
            <div className="text-slate-500 text-xs font-bold uppercase tracking-wider">Completed Adventures ({done.length})</div>
            {done.map(i => (
              <div key={i.id} className="flex items-center gap-3 bg-slate-900/30 border border-slate-800/40 rounded-2xl px-4 py-2.5 opacity-60 hover:opacity-90 transition">
                <button onClick={(e) => toggle(i.id, e)} className="text-emerald-400 flex-shrink-0 focus-ring">
                  <CheckCircle2 className="w-5 h-5" />
                </button>
                <div className="flex-1 text-slate-400 text-sm line-through">{i.text}</div>
                {isAdm && (
                  <button onClick={() => del(i.id)} className="text-slate-600 hover:text-rose-400 transition p-1 focus-ring">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
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
  useEffect(() => onSyncUpdate((key) => {
    if (key !== 'familyos_watchlist' && key !== '*') return;
    setItems(loadJSON('familyos_watchlist', []));
  }), []);
  const add = () => {
    if (!title.trim() || !currentUser) return;
    save([...items, { id: uid(), title: title.trim(), type, wantsToWatch: [currentUser.name], watched: false, createdAt: Date.now() }]);
    setTitle('');
    triggerConfetti(undefined, undefined, 20);
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
  const toggleWatched = (id: string, e?: React.MouseEvent) => {
    const item = items.find(i => i.id === id);
    if (item && !item.watched) {
      if (e) triggerConfetti(e.clientX, e.clientY, 30);
      else triggerConfetti(undefined, undefined, 30);
    }
    save(items.map(i => i.id === id ? { ...i, watched: !i.watched } : i));
  };
  const del = (id: string) => { if (isAdm) save(items.map(i => i.id === id ? { ...i, deletedAt: Date.now() } : i)); };
  const active = items.filter(i => !i.deletedAt);
  const unwatched = active.filter(i => !i.watched);
  const watched = active.filter(i => i.watched);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input 
          value={title} 
          onChange={e => setTitle(e.target.value)} 
          onKeyDown={e => e.key === 'Enter' && add()} 
          placeholder="Movie or TV show title..." 
          className="flex-1 bg-slate-900/80 border border-slate-800/80 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition" 
        />
        <select 
          value={type} 
          onChange={e => setType(e.target.value as 'movie' | 'show')} 
          className="bg-slate-900/80 border border-slate-800/80 rounded-xl px-3 py-2 text-white text-xs outline-none"
        >
          <option value="movie">Movie</option>
          <option value="show">Show</option>
        </select>
        <button 
          onClick={add} 
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl transition shadow-lg shadow-amber-500/20 active:scale-95 focus-ring flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {active.length === 0 && (
        <div className="text-center bg-slate-900/40 border border-slate-800/60 rounded-2xl py-10 px-4">
          <Tv className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-60" />
          <p className="text-slate-400 text-sm font-medium">Watchlist is empty.</p>
          <p className="text-slate-500 text-xs mt-0.5">Queue up films and series for weekend movie nights.</p>
        </div>
      )}

      <div className="space-y-2">
        {unwatched.map(i => (
          <div key={i.id} className="flex items-center gap-3 bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-2xl px-4 py-3.5 shadow-md group">
            <button 
              onClick={(e) => toggleWatched(i.id, e)} 
              className="text-slate-500 hover:text-emerald-400 transition flex-shrink-0 focus-ring"
              title="Mark as watched"
            >
              <Circle className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-semibold truncate">{i.title}</div>
              <div className="text-slate-400 text-xs mt-0.5 flex items-center gap-2">
                <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-bold">{i.type}</span>
                <span>Wants: {i.wantsToWatch.join(', ') || 'nobody yet'}</span>
              </div>
            </div>
            <button 
              onClick={() => toggleWant(i.id)} 
              className={`text-xs px-3 py-1 rounded-xl border font-semibold transition active:scale-95 focus-ring ${
                currentUser && i.wantsToWatch.includes(currentUser.name) 
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' 
                  : 'border-slate-700 bg-slate-800/60 text-slate-400 hover:text-white'
              }`}
            >
              {currentUser && i.wantsToWatch.includes(currentUser.name) ? 'I Want In' : '+ Me Too'}
            </button>
            {isAdm && (
              <button 
                onClick={() => del(i.id)} 
                className="text-slate-500 hover:text-rose-400 transition p-1 opacity-60 group-hover:opacity-100 focus-ring"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}

        {watched.length > 0 && (
          <div className="space-y-2 pt-2">
            <div className="text-slate-500 text-xs font-bold uppercase tracking-wider">Watched ({watched.length})</div>
            {watched.map(i => (
              <div key={i.id} className="flex items-center gap-3 bg-slate-900/30 border border-slate-800/40 rounded-2xl px-4 py-2.5 opacity-60 hover:opacity-90 transition">
                <button onClick={(e) => toggleWatched(i.id, e)} className="text-emerald-400 flex-shrink-0 focus-ring">
                  <CheckCircle2 className="w-5 h-5" />
                </button>
                <div className="flex-1 text-slate-400 text-sm line-through">{i.title}</div>
                {isAdm && (
                  <button onClick={() => del(i.id)} className="text-slate-600 hover:text-rose-400 transition p-1 focus-ring">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface Game { id: string; name: string; scores: { player: string; score: number; date: string }[]; createdAt: number; }

const GameNightTab: React.FC<{ isAdm: boolean; householdMembers: User[] }> = ({ isAdm, householdMembers }) => {
  const { currentUser } = useAppContext();
  const [games, setGames] = useState<Game[]>(() => loadJSON('familyos_games', []));
  useEffect(() => onSyncUpdate((key) => {
    if (key !== 'familyos_games' && key !== '*') return;
    setGames(loadJSON('familyos_games', []));
  }), []);
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
    triggerConfetti(undefined, undefined, 20);
  };
  const addScore = (gameId: string) => {
    if (!scoreValue) return;
    save(games.map(g => g.id === gameId ? { ...g, scores: [...g.scores, { player: scorePlayer, score: parseFloat(scoreValue), date: scoreDate }] } : g));
    setScoreValue('');
    triggerConfetti(undefined, undefined, 35);
  };
  const delGame = (id: string) => { if (isAdm) save(games.filter(g => g.id !== id)); };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input 
          value={gameName} 
          onChange={e => setGameName(e.target.value)} 
          onKeyDown={e => e.key === 'Enter' && addGame()} 
          placeholder="Add a board game or video game title..." 
          className="flex-1 bg-slate-900/80 border border-slate-800/80 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition" 
        />
        <button 
          onClick={addGame} 
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl transition shadow-lg shadow-amber-500/20 active:scale-95 focus-ring flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Add Game
        </button>
      </div>

      {games.length === 0 && (
        <div className="text-center bg-slate-900/40 border border-slate-800/60 rounded-2xl py-10 px-4">
          <Gamepad2 className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-60" />
          <p className="text-slate-400 text-sm font-medium">No games tracked yet.</p>
          <p className="text-slate-500 text-xs mt-0.5">Track Catan, Mario Kart, Uno, or Scrabble champions.</p>
        </div>
      )}

      <div className="space-y-3">
        {games.map(g => {
          const isExp = expandedGame === g.id;
          const playerScores: Record<string, number[]> = {};
          g.scores.forEach(s => { if (!playerScores[s.player]) playerScores[s.player] = []; playerScores[s.player].push(s.score); });
          const leaders = Object.entries(playerScores).map(([p, sc]) => ({ p, best: Math.max(...sc) })).sort((a, b) => b.best - a.best);
          return (
            <div key={g.id} className="bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-2xl overflow-hidden shadow-md">
              <div 
                className="px-4 py-3.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-800/40 transition select-none" 
                onClick={() => setExpandedGame(isExp ? null : g.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
                    <Gamepad2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-white font-bold text-sm flex items-center gap-2">
                      {g.name}
                      {leaders.length > 0 && (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full">
                          <Trophy className="w-3 h-3 text-amber-400" /> {leaders[0].p} ({leaders[0].best} pts)
                        </span>
                      )}
                    </div>
                    <div className="text-slate-400 text-xs mt-0.5">{g.scores.length} match records logged</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-amber-400 font-medium">{isExp ? 'Close' : 'Scoreboard'}</span>
                  {isAdm && (
                    <button 
                      onClick={e => { e.stopPropagation(); delGame(g.id); }} 
                      className="text-slate-500 hover:text-rose-400 transition p-1.5 focus-ring"
                      title="Remove game"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {isExp && (
                <div className="border-t border-slate-800/80 bg-slate-900/40 px-4 py-3.5 space-y-3">
                  <div className="flex gap-2 flex-wrap items-center">
                    <select 
                      value={scorePlayer} 
                      onChange={e => setScorePlayer(e.target.value)} 
                      className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-white text-xs outline-none"
                    >
                      {householdMembers.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                    </select>
                    <input 
                      type="number" 
                      value={scoreValue} 
                      onChange={e => setScoreValue(e.target.value)} 
                      placeholder="Score" 
                      className="w-24 bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-white text-xs placeholder-slate-500 outline-none" 
                    />
                    <input 
                      type="date" 
                      value={scoreDate} 
                      onChange={e => setScoreDate(e.target.value)} 
                      className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-white text-xs outline-none" 
                    />
                    <button 
                      onClick={() => addScore(g.id)} 
                      className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-1.5 rounded-xl transition shadow-md shadow-amber-500/20 active:scale-95 focus-ring"
                    >
                      Log Score
                    </button>
                  </div>
                  {leaders.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Leaderboard</div>
                      {leaders.map(({ p, best }, idx) => (
                        <div key={p} className="flex justify-between items-center text-xs bg-slate-800/50 px-3 py-2 rounded-xl border border-slate-700/40">
                          <span className="text-slate-200 font-semibold flex items-center gap-1.5">
                            <span className="text-slate-500 font-mono text-[10px]">#{idx + 1}</span>
                            {p}
                          </span>
                          <span className="text-amber-400 font-bold tabular-nums">{best} pts</span>
                        </div>
                      ))}
                    </div>
                  )}
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
