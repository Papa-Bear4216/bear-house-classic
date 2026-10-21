import { parseHermesReply } from '@/lib/hermesReply';
import { buildSystemPrompt, extractClientSnapshot } from '@/lib/hermesPrompt';
import { executeAction, type Action, type ActionType } from '@/lib/hermesActionExecutor';
import { useOptionalBentoGrid } from '@/components/bento/BentoGridContext';
import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Loader2, Bot, ChevronDown, CheckCircle2, AlertCircle, Zap, Brain, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { KEYS, loadJSON, saveJSON, uid } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';
import { getAccessToken } from '@/lib/householdAuth';
import { defaultPlan, MEALS_STORAGE_KEY, applyMealCooked, type WeekPlan } from '@/components/familyos/sections/mealPlannerShared';
import { CARS_STORAGE_KEY } from '@/components/familyos/sections/carMaintenanceKeys';
import { runGenericAction, setMealPlanAction } from '@/lib/hermesActions';
import { loadPantry, decrementPantry, savePantry } from '@/lib/familyos';
import { apiUrl } from '@/lib/api';
import { getVoiceProvider } from '@/lib/voice';
import { loadHermesMemory, ensureHermesMemoryLoaded, cachedHermesMemory, addHermesMemory, clearHermesMemory } from '@/lib/hermesMemory';
import { loadHermesWeather } from '@/lib/hermesWeather';
import { buildMorningBrief } from '@/lib/morningBrief';
import { useFeatureFlag } from '@/lib/featureFlags';
import BiffToneCheckModal from './sections/BiffToneCheckModal';

// ─── Action types ────────────────────────────────────────────────────────────
interface ExecutedAction extends Action {
  result: string;
  ok: boolean;
}

interface Message {
  role: 'user' | 'assistant';
  text: string;
  ts: number;
  actions?: ExecutedAction[];
}

interface HermesResponse {
  text: string;
  actions?: Action[];
}

// ─── Action executor ─────────────────────────────────────────────────────────
async function callHermes(history: { role: string; content: string }[], householdMembers: { id: string; name: string; role: string }[], currentUserName: string | undefined, modelTier: 'haiku' | 'sonnet', currentRole?: string | null, neutralMode?: boolean, currentModule?: string): Promise<HermesResponse> {
  try {
    const token = await getAccessToken();
    const systemPrompt = buildSystemPrompt(householdMembers, currentUserName, currentRole);
    const res = await fetch(apiUrl('/api/chat'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        messages: history,
        system: systemPrompt, // Backward-compatible until the server context builder consumes clientSnapshot.
        surface: 'floating-chat',
        currentModule,
        clientSnapshot: extractClientSnapshot(systemPrompt),
        enableTools: true,
        neutralMode: neutralMode === true,
        maxTokens: 1200, // meal plans with recipes overran 600 and got cut off mid-JSON
        model: modelTier === 'sonnet' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001',
      }),
    });
    if (!res.ok) return { text: 'Something went wrong. Try again.' };
    const data = await res.json();
    const rawText = (data.text || '').trim();

    let result: { text: string; actions?: Action[] };
    if (Array.isArray(data.actions)) {
      result = {
        text: rawText || (data.toolsDegraded ? 'Hermes tools are temporarily degraded.' : 'Done.'),
        actions: data.actions,
      };
    } else {
      const parsed = parseHermesReply<Action>(rawText);
      result = {
        text: parsed.text || rawText || 'Done.',
        actions: parsed.actions,
      };
    }

    if (data.toolsDegraded) {
      const banner = '*(Hermes tools are temporarily in text mode; no actions were executed.)*';
      result.text = result.text ? `${result.text}\n\n${banner}` : banner;
    } else if (data.truncated || (data.droppedActions && data.droppedActions > 0)) {
      const warning = data.droppedActions
        ? '*(Some requested actions could not be validated or were cut off by token limits. Please verify or repeat.)*'
        : '*(Response was cut off by token limits. Please verify or repeat.)*';
      result.text = result.text ? `${result.text}\n\n${warning}` : warning;
    }

    return result;
  } catch {
    return { text: 'Network error. Check your connection.' };
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
const STARTERS = [
  "What's on my plate today?",
  "Any overdue tasks?",
  "What do we need from the store?",
  "How are the kids doing?",
  "Summarize our bills",
  "Add: take out trash",
];

const ACTION_ICONS: Partial<Record<ActionType, string>> = {
  addTask: '📋', completeTask: '✅', uncompleteTask: '🔄', deleteTask: '🗑️',
  addShopping: '🛒', completeShoppingItem: '✅',
  addBill: '💸', markBillPaid: '💚',
  addAppointment: '📅',
  addPromise: '🤝', completePromise: '✅',
  logEmotion: '💭',
  updateMemory: '🧠',
  clearWeekMeals: '🍽️',
  setMealPlan: '🍽️',
  markMealCooked: '✅',
  addCarMaintenanceEntry: '🚗',
  genericAction: '⚡',
  controlDevice: '🏠',
  discoverSmartHome: '🔍',
  notifyPerson: '📲',
  manageMember: '👥',
};

// ─── Proactive greeting ─────────────────────────────────────────────────────
// Deterministic "here's what needs attention" summary shown when the chat
// opens with no messages. Reads the same live local JSON the system prompt
// uses — no API call, no keys. Updates itself as the household's data
// changes between visits.
function buildProactiveGreeting(userName: string | undefined): string {
  const brief = buildMorningBrief();
  const name = userName ? userName.split(' ')[0] : 'there';
  const lines: string[] = [`Hey ${name}. Here's the lay of the land today:`, ...brief.map(l => `${l.emoji} ${l.text}`)];

  if (brief.length === 0) {
    lines.push('Nothing urgent on the board right now — the coast is clear.');
  } else {
    lines.push('Want me to dive into any of these?');
  }
  return lines.join('\n');
}

// Proactive greeting keyed per member so each household member sees the
// summary once per chat-session-per-day instead of every single open.
function greetingKey(userId: string | undefined): string {
  const today = new Date().toISOString().slice(0, 10);
  return `hermes_greeting_${userId ?? 'anon'}_${today}`;
}
function shouldShowGreeting(userId: string | undefined): boolean {
  return localStorage.getItem(greetingKey(userId)) !== '1';
}
function markGreetingShown(userId: string | undefined) {
  localStorage.setItem(greetingKey(userId), '1');
}

// ─── Quick-reply chips ──────────────────────────────────────────────────────
// Shown under each assistant reply so the user can continue without typing.
// Each maps to a follow-up prompt that likely needs no further context.
const FOLLOW_UP_PROMPTS = [
  'Add a task',
  'Add to shopping',
];

// Context-aware follow-ups based on what the last reply touched, so the
// chip row never suggests an irrelevant action. Keyed by the action types
// present in the last response.
function followUpsFor(lastMsg: Message | undefined): string[] {
  const base = [...FOLLOW_UP_PROMPTS];
  const types = new Set((lastMsg?.actions || []).map(a => a.type));
  if (types.has('markBillPaid') || types.has('addBill')) base.push('Show unpaid bills');
  if (types.has('addShopping') || types.has('completeShoppingItem')) base.push('Show shopping list');
  if (types.has('addTask') || types.has('completeTask')) base.push('Show open tasks');
  return base.slice(0, 4);
}

const HermesChat: React.FC = () => {
  const { currentUser, currentRole, householdMembers, voiceUnlocked, hermesModelTier } = useAppContext();
  const bentoContext = useOptionalBentoGrid();
  const isAdult = currentRole === 'admin' || currentRole === 'superadmin';
  const neutralFlagEnabled = useFeatureFlag('hermes_neutral');
  const [neutralMode, setNeutralMode] = useState(false);
  const effectiveNeutralMode = neutralFlagEnabled && neutralMode;
  const [toneCheckOpen, setToneCheckOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const [memoryCount, setMemoryCount] = useState(0);
  const [listening, setListening] = useState(false);
  const [voiceOutput, setVoiceOutput] = useState(() => localStorage.getItem('hermes_voice_output') === '1');
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockCode, setUnlockCode] = useState('');
  const [unlockStatus, setUnlockStatus] = useState<'idle' | 'checking' | 'error'>('idle');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const voice = getVoiceProvider(voiceUnlocked, getAccessToken, apiUrl);

  useEffect(() => {
    loadHermesWeather(); // fire-and-forget, cachedHermesWeather() reads whatever lands
    (async () => {
      // One-time migration: if this device has an old localStorage memory
      // blob and the household hasn't got any server-side memory yet,
      // import it, then remove the local copy so it doesn't re-import.
      const legacy = localStorage.getItem('hermes_memory');
      const notes = await loadHermesMemory();
      if (legacy && notes.length === 0) {
        const lines = legacy.split('\n').filter(Boolean);
        const writes = await Promise.all(lines.map((line) => addHermesMemory(line)));
        if (writes.every(Boolean)) localStorage.removeItem('hermes_memory');
        setMemoryCount(cachedHermesMemory().length);
      } else {
        setMemoryCount(notes.length);
      }
    })();
  }, [open]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => inputRef.current?.focus(), 100);
      // Proactive greeting: the first time this member opens the chat
      // today (and no conversation is in flight), lead with a deterministic
      // household summary instead of a blank input.
      if (messages.length === 0 && shouldShowGreeting(currentUser?.id)) {
        markGreetingShown(currentUser?.id);
        setMessages([{ role: 'assistant', text: buildProactiveGreeting(currentUser?.name), ts: Date.now() }]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (override?: string) => {
    const msg = (override || input).trim();
    if (!msg || loading) return;
    setInput('');

    const userMsg: Message = { role: 'user', text: msg, ts: Date.now() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setLoading(true);

    // The prompt reads the memory cache synchronously, so guarantee the cold
    // load (and any outbox retries) finish before creating a request.
    await ensureHermesMemoryLoaded();

    // Build history for API (last 12 turns, user/assistant only, stripping any UI warning banners)
    const history = nextMessages.slice(-12).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.text.replace(/\n\n\*\((?:Some requested actions|Response was cut off).*?\)\*$/s, ''),
    }));

    const response = await callHermes(history, householdMembers, currentUser?.name, hermesModelTier, currentRole, effectiveNeutralMode, bentoContext?.lastExpandedModule || undefined);

    // Execute any actions
    const executed: ExecutedAction[] = [];
    const defaultPerson = currentUser?.name || householdMembers[0]?.name || 'General';
    const canControlDevices = currentUser?.canControlDevices ?? isAdult;
    for (const action of response.actions || []) {
      if (!isAdult && (action.type === 'manageMember' || action.type === 'notifyPerson' || action.type === 'addBill' || action.type === 'markBillPaid' || action.type === 'clearWeekMeals')) {
        executed.push({ ...action, result: 'Permission denied (admin required)', ok: false });
        continue;
      }
      if (!canControlDevices && (action.type === 'controlDevice' || action.type === 'discoverSmartHome')) {
        executed.push({ ...action, result: 'Permission denied (smart home access required)', ok: false });
        continue;
      }
      if (action.type === 'controlDevice') {
        const svc = String(action.params?.service || '');
        if (svc === 'unlock' || svc === 'open_cover') {
          const confirmed = typeof window !== 'undefined' && typeof window.confirm === 'function'
            ? window.confirm(`Hermes wants to ${svc.replace('_', ' ')} ${action.params?.entityId}. Confirm?`)
            : true;
          if (!confirmed) {
            executed.push({ ...action, result: 'Cancelled by user (security confirmation declined)', ok: false });
            continue;
          }
        }
      }
      if (action.type === 'clearWeekMeals') {
        const confirmed = typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm('Hermes wants to clear the entire weekly meal plan. Confirm?')
          : true;
        if (!confirmed) {
          executed.push({ ...action, result: 'Cancelled by user (clear confirmation declined)', ok: false });
          continue;
        }
      }
      if (action.type === 'genericAction' && action.params?.op === 'clear') {
        const confirmed = typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm(`Hermes wants to clear all items in ${action.params?.domain}. Confirm?`)
          : true;
        if (!confirmed) {
          executed.push({ ...action, result: 'Cancelled by user (clear confirmation declined)', ok: false });
          continue;
        }
      }
      const { result, ok } = await executeAction(action, defaultPerson, householdMembers, currentUser?.id);
      executed.push({ ...action, result, ok });
      // Update memory counter if memory was updated
      if (action.type === 'updateMemory') {
        setMemoryCount(cachedHermesMemory().length);
      }
    }

    const assistantMsg: Message = {
      role: 'assistant',
      text: response.text,
      ts: Date.now(),
      actions: executed.length ? executed : undefined,
    };

    setMessages(prev => [...prev, assistantMsg]);
    setLoading(false);
    if (!open) setUnread(n => n + 1);
    if (voiceOutput) voice.speak(response.text);
  };

  const toggleListening = () => {
    if (listening) {
      voice.stopListening();
      setListening(false);
      return;
    }
    if (!voice.supported) return;
    setListening(true);
    voice.startListening(
      (transcript) => { setInput(transcript); send(transcript); },
      () => setListening(false)
    );
  };

  const toggleVoiceOutput = () => {
    setVoiceOutput(v => {
      const next = !v;
      localStorage.setItem('hermes_voice_output', next ? '1' : '0');
      if (!next) voice.stopSpeaking();
      return next;
    });
  };

  const redeemVoiceCode = async () => {
    if (!/^\d{6}$/.test(unlockCode)) { setUnlockStatus('error'); return; }
    setUnlockStatus('checking');
    try {
      const token = await getAccessToken();
      const res = await fetch(apiUrl('/api/voice-unlock'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ code: unlockCode }),
      });
      if (!res.ok) { setUnlockStatus('error'); return; }
      // Full unlock takes effect on next session load (AppContext reads it
      // from Supabase); reload so the whole household sees it immediately.
      window.location.reload();
    } catch {
      setUnlockStatus('error');
    }
  };

  const clearChat = () => {
    setMessages([]);
    setInput('');
  };

  // Household-wide and destructive, so adults only — and kept off the main
  // header so it can't be mistaken for "clear chat".
  const clearMemory = async () => {
    if (confirm('Clear Hermes memory for the whole household? He will forget all learned preferences on every device.')) {
      await clearHermesMemory();
      setMemoryCount(0);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-24 right-20 z-40 w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-500 shadow-xl shadow-amber-500/30 flex items-center justify-center transition-all active:scale-95 border border-amber-400/40 group focus-ring"
        title="Ask Hermes"
      >
        <Bot className="w-6 h-6 text-white group-hover:scale-110 transition-transform" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold shadow-md">
            {unread}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-24 right-4 z-50 w-full max-w-sm sm:max-w-md flex flex-col bg-slate-900/95 backdrop-blur-xl border border-amber-500/30 rounded-3xl shadow-2xl shadow-black/80 overflow-hidden"
          style={{ height: '540px' }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3.5 bg-white/[0.03] border-b border-white/10 flex-shrink-0">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center flex-shrink-0 shadow-md shadow-amber-500/25 ring-2 ring-amber-400/30">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold text-white flex items-center gap-1.5 tracking-tight">
                Hermes Copilot
                <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
              </div>
              <div className="text-[10px] font-semibold text-amber-300/90 flex items-center gap-1">
                <Brain className="w-2.5 h-2.5 text-amber-400" />
                {memoryCount > 0 ? `${memoryCount} memories learned` : 'Active & learning…'}
                {isAdult && memoryCount > 0 && (
                  <button onClick={clearMemory} className="ml-1 underline text-slate-500 hover:text-rose-400" title="Forget everything Hermes has learned about the household">
                    forget
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {neutralFlagEnabled && (
                <button
                  onClick={() => setNeutralMode((n) => !n)}
                  title={effectiveNeutralMode ? 'Neutral Co-Parent Mode Active' : 'Enable Neutral Co-Parent Mode'}
                  className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-all border ${
                    effectiveNeutralMode
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  🌿 Neutral
                </button>
              )}
              {messages.length > 0 && (
                <button
                  onClick={clearChat}
                  className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg transition-colors"
                >
                  clear chat
                </button>
              )}
              <button
                onClick={toggleVoiceOutput}
                title={voiceOutput ? 'Voice replies on' : 'Voice replies off'}
                className={`p-1.5 rounded-xl transition-all ${voiceOutput ? 'text-amber-400 bg-amber-400/15' : 'text-slate-400 hover:text-white'}`}
              >
                {voiceOutput ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              {!voiceUnlocked && (
                <button
                  onClick={() => setUnlockOpen(o => !o)}
                  title="Unlock premium voice"
                  className="text-[10px] font-bold uppercase tracking-wider text-amber-300 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 px-2 py-1 rounded-lg transition-all"
                >
                  upgrade
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white p-1.5 transition-colors">
                <ChevronDown className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Neutral mode active banner */}
          {effectiveNeutralMode && (
            <div className="bg-emerald-950/60 border-b border-emerald-500/20 px-4 py-1.5 flex items-center justify-between text-[11px] text-emerald-300 flex-shrink-0">
              <span className="flex items-center gap-1.5 font-medium">
                <span>🌿 BIFF Neutral Mode Active</span>
              </span>
              <button
                onClick={() => setToneCheckOpen(true)}
                className="underline hover:text-white font-semibold text-[10px]"
              >
                Tone Check Draft
              </button>
            </div>
          )}

          {/* Voice unlock */}
          {unlockOpen && !voiceUnlocked && (
            <div className="px-4 py-2.5 border-b border-white/10 flex-shrink-0 flex items-center gap-2 bg-amber-950/20">
              <input
                value={unlockCode}
                onChange={e => { setUnlockCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setUnlockStatus('idle'); }}
                placeholder="6-digit code"
                inputMode="numeric"
                maxLength={6}
                className={`flex-1 bg-white/[0.04] border rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none transition-all ${
                  unlockStatus === 'error' ? 'border-rose-500' : 'border-white/10 focus:border-amber-500'
                }`}
              />
              <button
                onClick={redeemVoiceCode}
                disabled={unlockStatus === 'checking' || unlockCode.length !== 6}
                className="text-xs font-semibold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-40 text-white px-3.5 py-1.5 rounded-xl transition-all shadow-sm"
              >
                {unlockStatus === 'checking' ? '...' : 'Unlock'}
              </button>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3.5 space-y-3.5">
            {messages.length === 0 && (
              <div className="text-center py-6">
                <div className="w-12 h-12 mx-auto mb-2 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Bot className="w-6 h-6 text-amber-400" />
                </div>
                <p className="text-xs text-slate-300 font-medium max-w-xs mx-auto">
                  I coordinate tasks, meals, shopping, and home devices. Ask or tell me anything!
                </p>
              </div>
            )}
            {!messages.some(m => m.role === 'user') && (
              <div className="grid grid-cols-2 gap-2">
                {STARTERS.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-xs bg-white/[0.03] hover:bg-amber-500/15 border border-white/5 hover:border-amber-500/30 rounded-2xl px-3.5 py-2.5 text-slate-200 transition-all leading-snug font-medium shadow-sm active:scale-95"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} gap-1.5`}>
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-br-xs shadow-md shadow-amber-500/20 font-medium'
                      : 'bg-white/[0.05] border border-white/10 text-slate-100 rounded-bl-xs backdrop-blur-sm'
                  }`}
                >
                  {m.text}
                </div>

                {/* Action results */}
                {m.actions && m.actions.length > 0 && (
                  <div className="max-w-[88%] flex flex-col gap-1.5">
                    {m.actions.map((a, ai) => (
                      <div
                        key={ai}
                        className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-xl border font-medium ${
                          a.ok
                            ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                            : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
                        }`}
                      >
                        {a.ok ? (
                          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-rose-400" />
                        )}
                        <span>{ACTION_ICONS[a.type] || '⚡'} {a.result}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Quick-reply chips */}
                {m.role === 'assistant' && i !== messages.length - 1 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {followUpsFor(m).map(p => (
                      <button
                        key={p}
                        onClick={() => send(p)}
                        className="text-[11px] font-medium bg-white/5 hover:bg-amber-500/20 border border-white/10 hover:border-amber-500/30 rounded-full px-3 py-1 text-slate-300 hover:text-amber-200 transition-all active:scale-95"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex items-start gap-2">
                <div className="bg-white/[0.05] border border-white/10 rounded-2xl rounded-bl-xs px-4 py-2.5 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  <span className="text-xs text-slate-400">Hermes is thinking…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-3 border-t border-white/10 flex gap-2 flex-shrink-0 bg-slate-950/40">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={listening ? 'Listening…' : 'Ask or tell Hermes anything…'}
              className="flex-1 bg-white/[0.04] border border-white/10 focus:border-amber-500 focus:bg-white/[0.07] rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-all shadow-inner"
            />
            {voice.supported && (
              <button
                onClick={toggleListening}
                title={listening ? 'Stop listening' : 'Speak to Hermes'}
                className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                  listening
                    ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-md shadow-rose-500/30'
                    : 'bg-white/5 border border-white/10 hover:border-amber-500/40 text-slate-300 hover:text-amber-300'
                }`}
              >
                {listening ? <MicOff className="w-4 h-4 text-white" /> : <Mic className="w-4 h-4" />}
              </button>
            )}
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="w-10 h-10 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-40 flex items-center justify-center flex-shrink-0 transition-all shadow-md shadow-amber-500/25 active:scale-95"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      )}

      {neutralFlagEnabled && (
        <BiffToneCheckModal
          open={toneCheckOpen}
          onOpenChange={setToneCheckOpen}
          initialText={input}
          onApplyText={(cleanText) => setInput(cleanText)}
        />
      )}
    </>
  );
};

export default HermesChat;
