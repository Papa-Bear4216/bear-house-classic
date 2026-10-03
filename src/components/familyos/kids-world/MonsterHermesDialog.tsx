import React, { useState } from 'react';
import { Bot, Send, Sparkles, X, Volume2 } from 'lucide-react';
import { monsterAudio } from '@/lib/monsterDenAudio';
import { type KidMonsterProfile, CREATURE_ROSTER } from '@/lib/monsterDenData';

interface MonsterHermesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  profile: KidMonsterProfile;
}

interface ChatMessage {
  id: string;
  sender: 'kid' | 'hermes';
  text: string;
  grunt?: string;
}

const CANNED_MONSTER_JOKES = [
  { grunt: "Snarl-grunt snort squish!", text: "Why did the monster make their bed? Because under the pillows is where the cleanest dust bunnies live!" },
  { grunt: "Chomp chomp wheeze bleep!", text: "What's a monster's favorite breakfast? Scrambled alarm clocks with extra snooze buttons!" },
  { grunt: "Giggle-snort burb!", text: "Hermes says: You're doing awesome today! Brush your teeth and your monster's pearly whites will shine in the dark!" },
  { grunt: "Wiggle-whistle roar!", text: "I just checked Mount Laundry—zero rogue socks in sight. You're a legendary room cleaner!" },
];

export const MonsterHermesDialog: React.FC<MonsterHermesDialogProps> = ({
  isOpen,
  onClose,
  profile,
}) => {
  const currentCreature =
    CREATURE_ROSTER.find((c) => c.id === profile.activeCreatureId) || CREATURE_ROSTER[0];

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'hermes',
      grunt: '*Snort-grunt squeeeak!*',
      text: `*BZZZT!* Hermes Pocket Translator online! ${currentCreature.name} says: 'Hey best buddy! Did we finish our chores today so we can go on an expedition to Couch Canyon?'`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userText = input.trim();
    setInput('');

    const newMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'kid',
      text: userText,
    };
    setMessages((prev) => [...prev, newMsg]);
    setLoading(true);
    monsterAudio.playSound('squeak');

    // Simulate Hermes translation with playful kid persona
    setTimeout(() => {
      const randomJoke = CANNED_MONSTER_JOKES[Math.floor(Math.random() * CANNED_MONSTER_JOKES.length)];
      const responseMsg: ChatMessage = {
        id: `hermes-${Date.now()}`,
        sender: 'hermes',
        grunt: randomJoke.grunt,
        text: `*Translator click*: ${randomJoke.text}`,
      };
      setMessages((prev) => [...prev, responseMsg]);
      setLoading(false);
      monsterAudio.playSound('fanfare');
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-lg bg-stone-900 border-4 border-cyan-500 rounded-3xl p-5 shadow-2xl flex flex-col h-[520px] text-cream-100">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-800">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 animate-pulse">
              <Bot className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-black text-cyan-400">HERMES POCKET TRANSLATOR</h3>
              <p className="text-[11px] text-stone-400">
                Translating {currentCreature.name}'s monster squeaks into human language!
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto py-3 space-y-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${m.sender === 'kid' ? 'items-end' : 'items-start'}`}
            >
              {m.grunt && (
                <span className="text-[10px] font-bold text-amber-400 italic mb-0.5">
                  {m.grunt}
                </span>
              )}
              <div
                className={`max-w-[85%] p-3 rounded-2xl text-xs ${
                  m.sender === 'kid'
                    ? 'bg-purple-600 text-white rounded-tr-none'
                    : 'bg-stone-800/90 text-stone-100 border border-cyan-500/40 rounded-tl-none'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="text-xs text-cyan-400 animate-pulse flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Decoding creature squeaks...
            </div>
          )}
        </div>

        {/* Quick Prompt Starters */}
        <div className="flex gap-1.5 overflow-x-auto py-2 border-t border-stone-800 text-[11px]">
          <button
            onClick={() => setInput("Tell me a funny monster joke!")}
            className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-cyan-300 whitespace-nowrap"
          >
            🤣 Tell a joke
          </button>
          <button
            onClick={() => setInput("What chores should I do next?")}
            className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-cyan-300 whitespace-nowrap"
          >
            ⚡ What's my next quest?
          </button>
          <button
            onClick={() => setInput("Can you tell me a bedtime story?")}
            className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-cyan-300 whitespace-nowrap"
          >
            📖 Bedtime story
          </button>
        </div>

        {/* Input Bar */}
        <div className="pt-2 flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={`Talk to ${currentCreature.name}...`}
            className="flex-1 bg-stone-800 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-cyan-400"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="p-2.5 bg-cyan-500 hover:bg-cyan-400 text-stone-950 rounded-xl font-bold transition disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
