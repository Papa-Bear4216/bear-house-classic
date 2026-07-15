import React, { useState, useRef } from 'react';
import { Mic, MicOff, X, Loader2, Plus, CheckCircle2 } from 'lucide-react';
import { KEYS, uid, saveJSON, loadJSON, callClaude, callClaudeVision, householdPersons, TASK_CATEGORIES, PRIORITIES } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';

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
    setPhase('saved');
    setTimeout(() => { close(); }, 1200);
  };

  const TYPE_COLORS: Record<string, string> = {
    task: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    bill: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    shopping: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    appointment: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => { reset(); setOpen(true); }}
        className="fixed bottom-20 right-4 md:bottom-6 z-40 w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-500 shadow-xl shadow-indigo-500/30 flex items-center justify-center transition-all active:scale-95"
        title="Quick capture"
      >
        <Plus className="w-6 h-6 text-white" />
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-4 sm:pb-0">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">Quick Capture</span>
              <button onClick={close} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {phase === 'saved' ? (
              <div className="flex flex-col items-center py-6 gap-2 text-emerald-400">
                <CheckCircle2 className="w-10 h-10" />
                <span className="font-medium">Saved!</span>
              </div>
            ) : phase === 'confirm' && parsed ? (
              <div className="space-y-3">
                <div className={`border rounded-xl p-3 text-sm ${TYPE_COLORS[parsed.type] || 'bg-slate-800 border-slate-700 text-white'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="uppercase text-[10px] font-bold tracking-widest opacity-70">{parsed.type}</span>
                    {parsed.priority && <span className="text-[10px] opacity-60">· {parsed.priority}</span>}
                    {parsed.person && <span className="text-[10px] opacity-60">· {parsed.person}</span>}
                  </div>
                  <div className="font-medium">{parsed.text}</div>
                  {parsed.dueEstimate && parsed.dueEstimate !== 'No Deadline' && (
                    <div className="text-[11px] mt-1 opacity-60">{parsed.dueEstimate}</div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setPhase('idle')} className="flex-1 py-2 rounded-xl border border-slate-600 text-slate-400 text-sm hover:bg-slate-800 transition">Edit</button>
                  <button onClick={confirmSave} className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition">Save</button>
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
                    placeholder="Speak or type anything... 'buy milk', 'pay electric bill', 'dentist Friday'"
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 outline-none"
                    disabled={phase === 'listening' || phase === 'parsing'}
                  />
                  <button
                    onClick={phase === 'listening' ? stopListening : startListening}
                    disabled={phase === 'parsing'}
                    className={`p-3 rounded-xl border transition shrink-0 ${
                      phase === 'listening'
                        ? 'bg-rose-600 border-rose-500 text-white animate-pulse'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-indigo-500'
                    }`}
                  >
                    {phase === 'listening' ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>
                </div>

                {error && <p className="text-rose-400 text-xs">{error}</p>}

                <button
                  onClick={parseInput}
                  disabled={!input.trim() || phase === 'parsing' || phase === 'listening'}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-medium text-sm flex items-center justify-center gap-2 transition"
                >
                  {phase === 'parsing' ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Figuring it out…</>
                  ) : (
                    <><Plus className="w-4 h-4" /> Add to Bear House</>
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
