import React, { useState, useEffect, useRef } from 'react';
import { Bot, Send, Trash2, Zap, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { getAccessToken } from '@/lib/householdAuth';
import { apiUrl } from '@/lib/api';
import {
  type TriadChatMessage,
  hydrateScopedChat,
  persistScopedChat,
  purgeChatSession,
  executeTriadJsonPipeline,
} from '@/lib/triadFusion';
import { useBentoGrid } from '../BentoGridContext';

export const BentoHermesChatPreview: React.FC = () => {
  const { scope } = useBentoGrid();
  const { hermesModelTier } = useAppContext();
  const [messages, setMessages] = useState<TriadChatMessage[]>(() => hydrateScopedChat(scope));

  useEffect(() => {
    setMessages(hydrateScopedChat(scope));
  }, [scope]);

  const latestMsg = messages[messages.length - 1];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-violet-300 font-semibold">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Hermes Copilot Active</span>
        </div>
        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-300">
          Tier: {hermesModelTier}
        </span>
      </div>

      <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1.5">
        <div className="text-[11px] text-slate-400 font-medium">Recent Stream Fragment:</div>
        <div className="text-xs text-slate-200 line-clamp-2 leading-relaxed italic">
          {latestMsg ? (
            <span>&ldquo;{latestMsg.text}&rdquo;</span>
          ) : (
            <span className="text-slate-500">
              &ldquo;Hey! I&apos;m Hermes, your family copilot. Ask what&apos;s for dinner, check chores, or summarize tasks.&rdquo;
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 pt-1">
        {["What's on my plate?", "Any overdue chores?", "Dinner ideas"].map((chip) => (
          <span
            key={chip}
            className="text-[10px] px-2 py-1 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-200 font-medium"
          >
            {chip}
          </span>
        ))}
      </div>
    </div>
  );
};

export const BentoHermesChatExpanded: React.FC = () => {
  const { scope } = useBentoGrid();
  const { householdMembers, currentUser, hermesModelTier } = useAppContext();
  const [messages, setMessages] = useState<TriadChatMessage[]>(() => hydrateScopedChat(scope));
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Hydrate strictly for this scope
  useEffect(() => {
    const loaded = hydrateScopedChat(scope);
    if (loaded.length === 0) {
      const welcome: TriadChatMessage = {
        role: 'assistant',
        text: `Hey ${currentUser?.name || 'friend'}! I'm Hermes. What can I help you tackle today?`,
        ts: Date.now(),
      };
      setMessages([welcome]);
      persistScopedChat(scope, [welcome]);
    } else {
      setMessages(loaded);
    }
  }, [scope, currentUser?.name]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Cleanup abort controller on unmount or collapse
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleClearChat = () => {
    if (confirm('Clear chat history for your session? (Triad Clear-Chat Protocol)')) {
      purgeChatSession(scope.householdId, scope.memberId);
      const resetMsg: TriadChatMessage = {
        role: 'assistant',
        text: 'Chat history cleared. What should we organize next?',
        ts: Date.now(),
      };
      setMessages([resetMsg]);
      persistScopedChat(scope, [resetMsg]);
    }
  };

  const handleSend = async (override?: string) => {
    const text = (override || input).trim();
    if (!text || loading) return;
    setInput('');
    setError(null);

    const userMsg: TriadChatMessage = { role: 'user', text, ts: Date.now() };
    const nextList = [...messages, userMsg];
    setMessages(nextList);
    persistScopedChat(scope, nextList);
    setLoading(true);

    // Cancel any previous request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      const token = await getAccessToken();
      const payload = {
        messages: nextList.map((m) => ({ role: m.role, content: m.text })),
        system: `You are Hermes, a proactive copilot for the ${currentUser?.name || 'family'} household. Current members: ${householdMembers.map((m) => m.name).join(', ')}. Keep replies short, structured, and ADHD-friendly.`,
        maxTokens: 500,
        model: hermesModelTier === 'sonnet' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001',
      };

      const result = await executeTriadJsonPipeline<{ text?: string }>(
        apiUrl('/api/chat'),
        payload,
        {
          signal: abortControllerRef.current.signal,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );

      if (!result.ok) {
        throw new Error(result.error || 'Failed to communicate with Hermes');
      }

      const replyText =
        result.data?.text || result.rawText || "Got it! I've updated the household stream.";
      const assistantMsg: TriadChatMessage = {
        role: 'assistant',
        text: replyText,
        ts: Date.now(),
      };

      const updated = [...nextList, assistantMsg];
      setMessages(updated);
      persistScopedChat(scope, updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('aborted')) {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[70vh] max-h-[700px] space-y-4">
      {/* Control Strip */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-violet-400" />
          <span className="text-sm font-bold text-white">Triad Fusion Copilot Stream</span>
          <span className="text-xs text-slate-400">({messages.length} messages scoped)</span>
        </div>
        <button
          onClick={handleClearChat}
          title="Triad Clear-Chat Protocol"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-rose-500/20 text-slate-300 hover:text-rose-200 border border-white/10 text-xs font-semibold transition"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clear Chat</span>
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto space-y-3.5 pr-2 scrollbar-thin">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex items-start gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {m.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-violet-500/20 border border-violet-500/40 text-violet-300 flex items-center justify-center flex-shrink-0 mt-1">
                <Bot className="w-4 h-4" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-amber-500 text-slate-950 font-medium'
                  : 'bg-white/5 border border-white/10 text-slate-100'
              }`}
            >
              <div className="whitespace-pre-wrap">{m.text}</div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-violet-300 text-xs animate-pulse p-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Hermes is thinking...</span>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="flex items-center gap-2 pt-2 border-t border-white/10"
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Hermes anything or give an action..."
          className="flex-1 bg-white/5 border border-white/15 rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 transition"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="flex items-center justify-center p-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-40 transition font-bold"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
