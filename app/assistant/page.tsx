'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Sparkles, Loader2, Cpu } from 'lucide-react';
import { useTasks } from '@/hooks/use-tasks';
import { useEvents } from '@/hooks/use-events';
import { useFamilyMembers } from '@/hooks/use-family';
import { useShopping } from '@/hooks/use-shopping';
import { useMeals, getWeekStart } from '@/hooks/use-meals';
import { useMessages } from '@/hooks/use-messages';
import { useCurrentUser } from '@/hooks/use-current-user';
import { format } from 'date-fns';
import { askHermes, type HermesMessage } from '@/lib/hermes';
import { trackUsage, trackHermesQuery, getHermesMemory, buildMemorySummary } from '@/lib/usage-tracker';
import { useSettings } from '@/hooks/use-settings';

const QUICK_PROMPTS = [
  "Brief me on today",
  "What should we have for dinner?",
  "Who's been most active this week?",
  "Suggest a family activity for the weekend",
];

const HERMES_SYSTEM = `You are Hermes, the Bear House Family OS AI. You have FULL control over this family's data. You can read and write everything.

When you need to take an action, output a JSON block like this (you can combine multiple actions):
\`\`\`json
{"actions":[
  {"type":"add_task","args":{"title":"...","assigneeId":"<userId>","date":"YYYY-MM-DD","pointsValue":15,"status":"todo"}},
  {"type":"complete_task","args":{"taskId":"<id>"}},
  {"type":"delete_task","args":{"taskId":"<id>"}},
  {"type":"add_event","args":{"title":"...","userId":"<userId>","date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM"}},
  {"type":"add_user","args":{"name":"...","role":"child","color":"bg-blue-500"}},
  {"type":"add_shopping_item","args":{"name":"...","quantity":1,"unit":"item","category":"other"}},
  {"type":"send_message","args":{"text":"..."}},
  {"type":"update_feature","args":{"feature":"showBudget|showScanner|showGallery|showCalls|showMap|showRewards|showGames","value":true}},
  {"type":"update_points","args":{"autoAward":true,"defaultTaskPoints":10,"easyPoints":15,"mediumPoints":30,"hardPoints":50}}
]}
\`\`\`

Shopping categories: produce, meat, dairy, bakery, pantry, frozen, beverages, household, personal-care, other
Task status options: todo, pending, done
Feature keys: showBudget, showScanner, showGallery, showCalls, showMap, showRewards, showGames

update_feature and update_points require the user to be admin or superadmin — only apply these when Mike or Gwen explicitly asks.

When you respond to the user, ALWAYS output the JSON block first if you're taking actions, then your conversational reply. If not taking any actions, just reply conversationally.

You know this family deeply. Be warm, proactive, and treat reducing their cognitive load as your primary mission.`;

export default function AssistantPage() {
  const { tasks, addTask, updateTaskStatus, deleteTask } = useTasks();
  const { events, addEvent } = useEvents();
  const { users, addUser } = useFamilyMembers();
  const { items: shoppingItems, addItem: addShoppingItem } = useShopping();
  const weekStart = useMemo(() => getWeekStart(), []);
  const { meals } = useMeals(weekStart);
  const { currentUser } = useCurrentUser();
  const { sendMessage } = useMessages(currentUser?.familyCode);
  const { updateFeatureSettings, updatePointSettings } = useSettings();

  const [input, setInput] = useState('');
  const [history, setHistory] = useState<Array<{ role: 'user' | 'assistant'; text: string; model?: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => { trackUsage('assistant'); }, []);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const resetHistory = () => {
    setHistory([]);
    setInput('');
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  async function handleSend(text: string) {
    if (!text.trim() || isLoading) return;

    const userMsg = text.trim();
    setHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    setIsLoading(true);

    try {
      const messages: HermesMessage[] = [
        ...history.map(m => ({ role: m.role, content: m.text })),
        { role: 'user', content: userMsg },
      ];

      trackHermesQuery(userMsg);
      const memory = await getHermesMemory();
      const context = {
        date: format(new Date(), 'yyyy-MM-dd HH:mm EEEE'),
        currentUser,
        users,
        tasks,
        events,
        meals,
        shopping: shoppingItems,
        usageMemory: memory ? buildMemorySummary(memory) : undefined,
        persistentMemory: memory?.persistentNotes,
      };

      const { content, model } = await askHermes(messages, context, HERMES_SYSTEM);

      let replyText = content;
      const jsonMatch = content.match(/```json\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        try {
          const data = JSON.parse(jsonMatch[1]);
          let count = 0;
          if (data.actions && Array.isArray(data.actions)) {
            for (const action of data.actions) {
              if (action.type === 'add_task') {
                await addTask({ ...action.args, completed: action.args.status === 'done', status: action.args.status ?? 'todo' });
                count++;
              } else if (action.type === 'complete_task') {
                await updateTaskStatus(action.args.taskId, 'done');
                count++;
              } else if (action.type === 'delete_task') {
                await deleteTask(action.args.taskId);
                count++;
              } else if (action.type === 'add_event') {
                await addEvent(action.args);
                count++;
              } else if (action.type === 'add_user') {
                await addUser({
                  id: crypto.randomUUID(),
                  name: action.args.name ?? 'New Member',
                  role: action.args.role ?? 'child',
                  color: action.args.color ?? 'bg-indigo-500',
                  points: action.args.points ?? 0,
                });
                count++;
              } else if (action.type === 'add_shopping_item') {
                await addShoppingItem({
                  name: action.args.name,
                  quantity: action.args.quantity ?? 1,
                  unit: action.args.unit ?? 'item',
                  category: action.args.category ?? 'other',
                  checked: false,
                  addedManually: true,
                });
                count++;
              } else if (action.type === 'send_message' && currentUser) {
                await sendMessage({
                  text: action.args.text,
                  userId: currentUser.id,
                  userName: `Hermes (via ${currentUser.name})`,
                  userColor: 'bg-purple-500',
                  avatarUrl: currentUser.avatarUrl,
                });
                count++;
              } else if (action.type === 'update_feature') {
                const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';
                if (isAdmin) {
                  await updateFeatureSettings({ [action.args.feature]: action.args.value });
                  count++;
                }
              } else if (action.type === 'update_points') {
                const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';
                if (isAdmin) {
                  await updatePointSettings(action.args);
                  count++;
                }
              }
            }
          }
          replyText = content.replace(/```json[\s\S]*?```/, '').trim() ||
            `Done! Completed ${count} action${count !== 1 ? 's' : ''}.`;
        } catch { /* leave replyText as-is */ }
      }

      setHistory(prev => [...prev, { role: 'assistant', text: replyText, model }]);
    } catch (err) {
      console.error(err);
      setHistory(prev => [...prev, {
        role: 'assistant',
        text: "I'm having trouble connecting right now. Make sure AI_GATEWAY_KEY is set in your Vercel env vars.",
      }]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col" style={{ height: 'calc(100vh - 7rem)' }}>
      {/* Header */}
      <header className="px-6 py-4 border-b border-slate-800 flex items-center gap-3 flex-shrink-0">
        <div className="p-2.5 bg-violet-900/40 border border-violet-700/40 rounded-xl">
          <Cpu className="w-5 h-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white leading-none">Hermes</h1>
          <p className="text-xs text-slate-500 mt-0.5">Full control — tasks, events, shopping, messages, and more</p>
        </div>
        <button
          type="button"
          onClick={resetHistory}
          className="ml-auto px-3 py-2 text-xs font-semibold text-slate-300 bg-slate-800 border border-slate-700 rounded-full hover:bg-slate-700 transition-colors"
        >
          Clear chat
        </button>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {history.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full">
            <Sparkles className="w-10 h-10 mb-4 text-violet-700" />
            <p className="font-medium text-slate-500 text-center">What can I help with?</p>
            <div className="flex flex-wrap gap-2 mt-5 justify-center max-w-lg">
              {QUICK_PROMPTS.map(p => (
                <button
                  key={p}
                  onClick={() => handleSend(p)}
                  className="px-4 py-2 bg-slate-800 border border-slate-700 text-slate-300 rounded-full text-sm font-medium hover:bg-violet-900/30 hover:border-violet-600/50 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {history.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-3 ${
              m.role === 'user'
                ? 'bg-violet-600 text-white rounded-br-none'
                : 'bg-slate-800 border border-slate-700 text-slate-200 rounded-bl-none'
            }`}>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.text}</p>
              {m.model && (
                <p className={`text-[10px] mt-1 ${m.role === 'user' ? 'text-violet-300' : 'text-slate-500'}`}>
                  via {m.model}
                </p>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-bl-none px-4 py-3 text-slate-500 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
              <span className="text-sm">Hermes is thinking…</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="px-6 pb-4 border-t border-slate-800">
        <div className="mb-3">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Quick prompts</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_PROMPTS.map(prompt => (
              <button
                key={prompt}
                onClick={() => handleSend(prompt)}
                className="px-3 py-2 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-xs hover:bg-violet-950 transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-slate-800 flex-shrink-0">
        <form
          onSubmit={e => { e.preventDefault(); handleSend(input); }}
          className="flex relative items-center max-w-3xl mx-auto"
        >
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask Hermes anything — or tell him what to do…"
            className="w-full pl-5 pr-14 py-3.5 rounded-full bg-slate-800 border border-slate-700 focus:outline-none focus:border-violet-500 text-white placeholder-slate-500"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 p-2.5 bg-violet-600 text-white rounded-full hover:bg-violet-500 disabled:opacity-50 transition-colors active:scale-95"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
