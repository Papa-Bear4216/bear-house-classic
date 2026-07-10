import React, { useState, useEffect } from 'react';
import { X, Loader2, Bot, Home, MapPin } from 'lucide-react';
import { KEYS, loadJSON } from '@/lib/familyos';
import { markBriefed } from '@/lib/presenceTracker';

interface Props {
  days: number;
  reason: 'offline' | 'location';
  miles?: number;
  onClose: () => void;
}

function buildReturnContext(days: number): string {
  const tasks = loadJSON<any[]>(KEYS.tasks, []);
  const open = tasks.filter(t => !t.completed);
  const high = open.filter(t => t.priority === 'High');
  const overdue = open.filter(t => t.dueDate && t.dueDate < Date.now());
  const bills = loadJSON<any[]>('familyos_bills', []).filter((b: any) => !b.paid);
  const appts = loadJSON<any[]>('familyos_appointments', []).slice(0, 4);
  const promises = loadJSON<any[]>(KEYS.promises, []).filter((p: any) => !p.completed).slice(0, 4);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return `You are Hermes, the Bear House family secretary. Michael has been away for ${days} days and just got back.

Today: ${today}.

CURRENT HOUSEHOLD STATE:
- Open tasks: ${open.length} (${high.length} high priority, ${overdue.length} overdue)
- High priority: ${high.slice(0, 4).map(t => `"${t.text}" → ${t.person}`).join(', ') || 'none'}
- Overdue: ${overdue.slice(0, 4).map(t => `"${t.text}"`).join(', ') || 'none'}
- Unpaid bills: ${bills.length} — ${bills.slice(0, 4).map((b: any) => `${b.name} $${b.amount}`).join(', ') || 'none'}
- Upcoming appointments: ${appts.map((a: any) => `${a.person}: ${a.title || a.type}`).join(', ') || 'none'}
- Open promises: ${promises.map((p: any) => `${p.person}: "${p.text}"`).join(', ') || 'none'}

Write a warm, brief welcome-back summary for Michael (plain text, no markdown, no bullet points, 3-4 sentences max).
Start with welcoming him back. Call out anything urgent (overdue tasks, bills). End with one actionable focus for today. Keep it human and warm — he has ADHD so be direct and prioritize the one most important thing.`;
}

const WelcomeBackModal: React.FC<Props> = ({ days, reason, miles, onClose }) => {
  const [brief, setBrief] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    generateBrief();
  }, []);

  const generateBrief = async () => {
    setLoading(true);
    try {
      // Try Gemini first if key available
      const geminiKey = localStorage.getItem(KEYS.geminiApiKey) || '';
      const context = buildReturnContext(days);

      if (geminiKey) {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: context }] }],
              generationConfig: { maxOutputTokens: 200 },
            }),
          }
        );
        if (res.ok) {
          const data = await res.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (text) { setBrief(text); setLoading(false); return; }
        }
      }

      // Fall back to Claude
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: context, maxTokens: 200 }),
      });
      if (res.ok) {
        const data = await res.json();
        setBrief(data.text || 'Welcome back. Check your tasks and bills to get caught up.');
      } else {
        setBrief('Welcome back. Check your tasks and bills to get caught up.');
      }
    } catch {
      setBrief('Welcome back. Check your tasks and bills to get caught up.');
    }
    setLoading(false);
  };

  const handleClose = () => {
    markBriefed();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="bg-slate-900 border border-violet-500/40 rounded-2xl max-w-md w-full shadow-2xl shadow-violet-900/40 overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-violet-950 to-slate-900 px-5 py-4 flex items-center gap-3 border-b border-violet-500/20">
          <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center ring-2 ring-violet-400/30 flex-shrink-0">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <div className="text-white font-bold">Welcome back, Michael</div>
            <div className="text-xs text-violet-300 flex items-center gap-1.5 mt-0.5">
              {reason === 'location'
                ? <><MapPin className="w-3 h-3" /> Away {days} days · {miles} miles from home</>
                : <><Home className="w-3 h-3" /> Away {days} day{days !== 1 ? 's' : ''}</>
              }
            </div>
          </div>
          <button onClick={handleClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Brief */}
        <div className="px-5 py-5">
          {loading ? (
            <div className="flex items-center gap-3 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
              <span className="text-sm">Hermes is catching you up…</span>
            </div>
          ) : (
            <p className="text-slate-200 text-sm leading-relaxed">{brief}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <button
            onClick={handleClose}
            className="w-full bg-violet-600 hover:bg-violet-500 text-white rounded-xl py-2.5 font-semibold text-sm transition"
          >
            Let's go →
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomeBackModal;
