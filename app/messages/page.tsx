'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, MessageCircle, Loader2 } from 'lucide-react';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useMessages } from '@/hooks/use-messages';
import { format, isToday, isYesterday } from 'date-fns';
import { trackUsage } from '@/lib/usage-tracker';
import Image from 'next/image';

function formatTimestamp(ts: { seconds: number } | null) {
  if (!ts) return '';
  const d = new Date(ts.seconds * 1000);
  if (isToday(d)) return format(d, 'h:mm a');
  if (isYesterday(d)) return `Yesterday ${format(d, 'h:mm a')}`;
  return format(d, 'MMM d, h:mm a');
}

function Avatar({ name, color, avatarUrl, size = 8 }: { name: string; color: string; avatarUrl?: string; size?: number }) {
  const cls = `w-${size} h-${size} rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-xs border-2 border-white shadow-sm`;
  if (avatarUrl) return <Image src={avatarUrl} alt={name} width={32} height={32} className={`${cls} object-cover`} referrerPolicy="no-referrer" />;
  return <div className={`${cls} ${color}`}>{name[0]?.toUpperCase()}</div>;
}

export default function MessagesPage() {
  const { currentUser } = useCurrentUser();
  const familyCode = currentUser?.familyCode;
  const { messages, loading, sendMessage } = useMessages(familyCode);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { trackUsage('messages'); }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !currentUser || sending) return;
    setSending(true);
    await sendMessage({
      text: input,
      userId: currentUser.id,
      userName: currentUser.name,
      userColor: currentUser.color,
      avatarUrl: currentUser.avatarUrl,
    });
    setInput('');
    setSending(false);
  }

  if (!familyCode) return (
    <div className="flex-1 flex items-center justify-center text-slate-400 text-sm p-8 text-center">
      You need to be part of a family to use messages. Join a family first.
    </div>
  );

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-64px)] md:h-screen bg-slate-50">
      {/* Header */}
      <header className="p-4 sm:p-6 border-b border-slate-100 flex items-center gap-3 bg-white">
        <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl">
          <MessageCircle className="w-6 h-6" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900 leading-none mb-1">Family Chat</h1>
          <p className="text-slate-500 text-xs leading-none">Bear House only — just us</p>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
            <MessageCircle className="w-12 h-12 text-emerald-200" />
            <p className="font-medium text-slate-500">No messages yet</p>
            <p className="text-sm">Say hi to the family 👋</p>
          </div>
        )}

        {messages.map((msg, i) => {
          const isMe = msg.userId === currentUser?.id;
          const prevMsg = messages[i - 1];
          const sameAsPrev = prevMsg?.userId === msg.userId;

          return (
            <div key={msg.id} className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
              {/* Avatar — only show when sender changes */}
              <div className="w-8 flex-shrink-0">
                {!sameAsPrev && !isMe && (
                  <Avatar name={msg.userName} color={msg.userColor} avatarUrl={msg.avatarUrl} size={8} />
                )}
              </div>

              <div className={`flex flex-col gap-0.5 max-w-[75%] sm:max-w-[60%] ${isMe ? 'items-end' : 'items-start'}`}>
                {!sameAsPrev && (
                  <span className={`text-[11px] font-semibold px-1 ${isMe ? 'text-slate-400' : 'text-slate-500'}`}>
                    {isMe ? 'You' : msg.userName}
                  </span>
                )}
                <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${
                  isMe
                    ? 'bg-emerald-500 text-white rounded-br-sm'
                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-sm'
                }`}>
                  {msg.text}
                </div>
                <span className="text-[10px] text-slate-400 px-1">{formatTimestamp(msg.createdAt)}</span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-slate-100 bg-white">
        <form onSubmit={handleSend} className="flex items-center gap-3 max-w-4xl mx-auto">
          <Avatar
            name={currentUser?.name ?? '?'}
            color={currentUser?.color ?? 'bg-slate-400'}
            avatarUrl={currentUser?.avatarUrl}
            size={8}
          />
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Message the family…"
            className="flex-1 px-4 py-3 rounded-full border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 text-slate-700 shadow-sm bg-slate-50 text-sm"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="p-3 bg-emerald-500 text-white rounded-full hover:bg-emerald-600 disabled:opacity-40 transition-colors shadow-md active:scale-95"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
