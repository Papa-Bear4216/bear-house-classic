'use client';

import { useState } from 'react';
import { X, DollarSign, Loader2, Send, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Subscription } from '@/lib/detect-subscriptions';

interface Message { role: 'user' | 'assistant'; content: string }

interface Props {
  subscription: Subscription;
  onClose: () => void;
}

const HERMES_SYSTEM = `You are Hermes, the Bear House family AI. You specialize in helping cancel subscriptions and recover money.

When helping cancel a subscription:
- Give numbered steps, be specific
- Include the exact URL to cancel if you know it
- Include the phone number if cancellation requires a call
- Warn about retention tactics and how to bypass them
- State whether cancellation takes effect immediately or at end of billing period

When helping request a refund:
- State the company's official refund policy
- Provide an exact word-for-word script to use
- If they deny, provide a follow-up escalation script
- Mention chargeback as a last resort if applicable

Be direct, specific, and actionable. No fluff.`;

export function SubscriptionCancelModal({ subscription, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'choose' | 'chat'>('choose');

  const freq = subscription.frequency;
  const lastDate = new Date(subscription.lastCharged).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  async function sendMessage(content: string) {
    const newMessages: Message[] = [...messages, { role: 'user', content }];
    setMessages(newMessages);
    setLoading(true);
    setMode('chat');
    try {
      const res = await fetch('/api/hermes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          systemOverride: HERMES_SYSTEM,
          context: { date: new Date().toLocaleDateString() },
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.content ?? 'Sorry, could not reach Hermes.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Could not reach Hermes.' }]);
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    sendMessage(
      `Help me cancel my ${subscription.merchantName} subscription. I'm paying $${subscription.amount.toFixed(2)} ${freq}. Last charge: ${lastDate}. Give exact step-by-step instructions with direct URL or phone number. Warn about retention tactics.`
    );
  }

  function handleRefund() {
    sendMessage(
      `Help me cancel my ${subscription.merchantName} subscription AND get a refund for $${subscription.amount.toFixed(2)} charged on ${lastDate}. Cancellation steps first, then exact refund scripts. Include chargeback info if they refuse.`
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput('');
    await sendMessage(msg);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 50, opacity: 0 }}
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg flex flex-col"
        style={{ maxHeight: '85vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700 shrink-0">
          <div>
            <h2 className="font-bold text-lg text-white leading-tight">{subscription.merchantName}</h2>
            <p className="text-xs text-slate-400">
              ${subscription.amount.toFixed(2)}/{freq} · Last charged {lastDate}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {mode === 'chat' && (
              <button
                onClick={() => { setMessages([]); setMode('choose'); }}
                className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-red-400 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <AnimatePresence mode="wait">
            {mode === 'choose' && (
              <motion.div key="choose" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                <p className="text-sm text-slate-400 font-medium">What would you like Hermes to help with?</p>

                <button
                  onClick={handleCancel}
                  className="w-full flex items-start gap-3 p-4 bg-red-900/20 border border-red-500/30 rounded-xl hover:border-red-500/60 transition-colors text-left group"
                >
                  <div className="w-10 h-10 bg-red-900/40 rounded-xl flex items-center justify-center shrink-0">
                    <X className="w-5 h-5 text-red-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">Cancel Subscription</p>
                    <p className="text-xs text-slate-400 mt-0.5">Step-by-step guide with direct links and scripts to bypass retention offers</p>
                  </div>
                </button>

                <button
                  onClick={handleRefund}
                  className="w-full flex items-start gap-3 p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-xl hover:border-emerald-500/60 transition-colors text-left group"
                >
                  <div className="w-10 h-10 bg-emerald-900/40 rounded-xl flex items-center justify-center shrink-0">
                    <DollarSign className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">Cancel + Get Refund</p>
                    <p className="text-xs text-slate-400 mt-0.5">Cancel and recover your ${subscription.amount.toFixed(2)} — includes exact scripts and chargeback info</p>
                  </div>
                </button>
              </motion.div>
            )}

            {mode === 'chat' && (
              <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                {messages.filter(m => m.role === 'assistant').map((m, i) => (
                  <div key={i} className="text-sm text-slate-300 whitespace-pre-line leading-relaxed">
                    {m.content}
                  </div>
                ))}
                {loading && (
                  <div className="flex items-center gap-2 text-slate-500 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                    Hermes is working on it…
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {mode === 'chat' && (
          <form onSubmit={handleSubmit} className="border-t border-slate-700 p-3 flex gap-2 shrink-0">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask a follow-up…"
              disabled={loading}
              className="flex-1 text-sm bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="bg-violet-600 hover:bg-violet-500 text-white px-3 py-2 rounded-xl disabled:opacity-40 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
}
