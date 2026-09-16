import React, { useState, useRef } from 'react';
import { Mic, MicOff, X, Loader2, Plus, CheckCircle2, Zap, Sparkles } from 'lucide-react';
import { KEYS, uid, saveJSON, loadJSON, callClaude, callClaudeVision, householdPersons, TASK_CATEGORIES, PRIORITIES } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';
import { triggerConfetti } from '@/lib/confetti';

const PARSE_PROMPT = (input: string, persons: string[], defaultPerson: string) => `You are parsing a voice/text capture for a family OS app. Given the input, classify it and extract structured data.

Input: "${input}"

Return ONLY valid JSON, no markdown:
{
  "type": "task" | "bill" | "shopping" | "appointment",
  "text": "clean description",
  "person": one of [${persons.join(', ')}],
  "priority": "High" | "Medium" | "Low",
  "category": one of [Shopping, Maintenance, Scheduling, Pet, Important Dates, General],
  "dueEstimate": "Today" | "This Week" | "This Month" | "No Deadline",
  "amount": number or null (for bills only),
  "quantity": string or null (for shopping only)
}

Rules:
- "buy/get/pick up/need" → shopping
- "pay/bill/due/owe" → bill
- "appointment/doctor/dentist/vet/meet" → appointment
- everything else → task
- If person not mentioned, use "${defaultPerson}" for tasks, "General" for shopping
- Keep text concise and action-oriented`;

interface ParsedItem {
  type: 'task' | 'bill' | 'shopping' | 'appointment';
  text: string;
  person: string;
  priority: string;
  category: string;
  dueEstimate: string;
  amount?: number | null;
  quantity?: string | null;
}

function saveItem(parsed: ParsedItem, defaultPerson: string) {
  const now = Date.now();
  const base = { id: uid(), createdAt: now, source: 'quick_capture' };

  if (parsed.type === 'task') {
    const tasks = loadJSON<any[]>(KEYS.tasks, []);
    tasks.unshift({
      ...base,
      text: parsed.text,
      person: parsed.person || defaultPerson,
      priority: parsed.priority || 'Medium',
      category: parsed.category || 'General',
      dueEstimate: parsed.dueEstimate || 'No Deadline',
      completed: false,
    });
    saveJSON(KEYS.tasks, tasks);
  } else if (parsed.type === 'bill') {
    const bills = loadJSON<any[]>('familyos_bills', []);
    bills.unshift({ ...base, name: parsed.text, amount: parsed.amount || 0, paid: false, recurring: false, dueDate: null });
    saveJSON('familyos_bills', bills);
  } else if (parsed.type === 'shopping') {
    const items = loadJSON<any[]>('familyos_shopping', []);
    items.unshift({ ...base, name: parsed.text, category: 'General', assignedTo: parsed.person || 'General', quantity: parsed.quantity || '1', completed: false });
    saveJSON('familyos_shopping', items);
  } else if (parsed.type === 'appointment') {
    const appts = loadJSON<any[]>('familyos_appointments', []);
    appts.unshift({ ...base, person: parsed.person || defaultPerson, type: parsed.category || 'General', doctor: '', date: null, notes: parsed.text });
    saveJSON('familyos_appointments', appts);
  }
}

type Phase = 'idle' | 'listening' | 'parsing' | 'confirm' | 'saved';

const QuickCapture: React.FC = () => {
  const { currentUser, householdMembers } = useAppContext();
  const persons = householdPersons(householdMembers);
  const defaultPerson = currentUser?.name || persons[0] || 'General';
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [parsed, setParsed] = useState<ParsedItem | null>(null);
  const [error, setError] = useState('');
  const recRef = useRef<any>(null);

  const reset = () => {
    setInput('');
    setPhase('idle');
    setParsed(null);
    setError('');
    if (recRef.current) { try { recRef.current.stop(); } catch {} recRef.current = null; }
  };

  const close = () => { reset(); setOpen(false); };

  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setError('Voice not supported in this browser. Type instead.'); return; }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = false;
    rec.onstart = () => setPhase('listening');
    rec.onend = () => { if (phase === 'listening') setPhase('idle'); };
    rec.onresult = (e: any) => {
      const t = e.results[0][0].transcript;
      setInput(t);
      setPhase('idle');
    };
    rec.onerror = (e: any) => { setError(`Voice error: ${e.error}`); setPhase('idle'); };
    recRef.current = rec;
    rec.start();
  };

  const stopListening = () => {
    if (recRef.current) { try { recRef.current.stop(); } catch {} }
    setPhase('idle');
  };

  const parseInput = async () => {
    if (!input.trim()) return;
    setPhase('parsing');
    setError('');
    const result = await callClaude(PARSE_PROMPT(input.trim(), persons, defaultPerson));
    if (!result.ok) { setError(result.text); setPhase('idle'); return; }
    try {
      const raw = result.text.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();
      const data: ParsedItem = JSON.parse(raw);
      setParsed(data);
      setPhase('confirm');
    } catch {
      setError('Could not parse response. Try again.');
      setPhase('idle');
    }
  };

  const confirmSave = () => {
    if (!parsed) return;
    saveItem(parsed, defaultPerson);
    triggerConfetti(window.innerWidth / 2, window.innerHeight * 0.45, 50);
    setPhase('saved');
    setTimeout(() => { close(); }, 1200);
  };

  const TYPE_COLORS: Record<string, string> = {
    task: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    bill: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    shopping: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    appointment: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => { reset(); setOpen(true); }}
        className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-gradient-to-tr from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 shadow-xl shadow-amber-500/30 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 ring-2 ring-white/20 focus-ring"
        title="Quick Brain Dump (+)"
      >
        <Plus className="w-6 h-6 text-slate-950 stroke-[3]" />
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md px-4 pb-4 sm:pb-0 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-gradient-to-b from-slate-900 to-slate-950 border border-white/10 rounded-3xl shadow-2xl p-6 space-y-5 relative overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <Zap className="w-4 h-4 fill-current" />
                </div>
                <div>
                  <span className="font-bold text-white text-base font-display">Emergency Brain Dump</span>
                  <p className="text-[11px] text-slate-400">Speak or dump raw thoughts — AI files it</p>
                </div>
              </div>
              <button onClick={close} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            {phase === 'saved' ? (
              <div className="flex flex-col items-center py-6 gap-2 text-emerald-400">
                <CheckCircle2 className="w-12 h-12 animate-bounce" />
                <span className="text-lg font-bold text-white">Dumped & Saved! 🔥</span>
                <span className="text-xs text-slate-400">Mental bandwidth restored.</span>
              </div>
            ) : phase === 'confirm' && parsed ? (
              <div className="space-y-4">
                <div className={`border rounded-2xl p-4 text-sm ${TYPE_COLORS[parsed.type] || 'bg-white/5 border-white/10 text-white'}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="uppercase text-[10px] font-extrabold tracking-widest opacity-80 px-2 py-0.5 rounded bg-black/20">{parsed.type}</span>
                    {parsed.priority && <span className="text-[10px] opacity-80">· {parsed.priority}</span>}
                    {parsed.person && <span className="text-[10px] opacity-80">· {parsed.person}</span>}
                  </div>
                  <div className="font-bold text-white text-base">{parsed.text}</div>
                  {parsed.dueEstimate && parsed.dueEstimate !== 'No Deadline' && (
                    <div className="text-xs mt-1.5 opacity-80 font-mono">📅 {parsed.dueEstimate}</div>
                  )}
                </div>
                <div className="flex gap-2.5">
                  <button onClick={() => setPhase('idle')} className="flex-1 py-3 rounded-2xl border border-white/10 text-slate-300 text-xs sm:text-sm font-semibold hover:bg-white/5 transition">Edit</button>
                  <button onClick={confirmSave} className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs sm:text-sm font-bold shadow-lg shadow-amber-500/25 transition active:scale-[0.98]">Confirm & Save</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex gap-2 items-start">
                  <input
                    autoFocus
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && parseInput()}
                    placeholder="e.g. 'buy oat milk', 'pay electric bill', 'dentist Friday 2pm'"
                    className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white placeholder-slate-500 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none transition"
                    disabled={phase === 'listening' || phase === 'parsing'}
                  />
                  <button
                    onClick={phase === 'listening' ? stopListening : startListening}
                    disabled={phase === 'parsing'}
                    className={`p-3.5 rounded-2xl border transition shrink-0 ${
                      phase === 'listening'
                        ? 'bg-rose-600 border-rose-500 text-white animate-pulse shadow-lg shadow-rose-600/30'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:border-amber-400/40 hover:bg-white/10'
                    }`}
                    title={phase === 'listening' ? 'Stop listening' : 'Voice input'}
                  >
                    {phase === 'listening' ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>
                </div>

                {error && <p className="text-rose-400 text-xs">{error}</p>}

                <button
                  onClick={parseInput}
                  disabled={!input.trim() || phase === 'parsing' || phase === 'listening'}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition active:scale-[0.98]"
                >
                  {phase === 'parsing' ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Sorting through the chaos…</>
                  ) : (
                    <><Plus className="w-4 h-4 stroke-[3]" /> Add to FamilyOS</>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default QuickCapture;
