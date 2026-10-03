import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  X,
  Volume2,
  Mic,
  MicOff,
  Square,
  VolumeX,
} from 'lucide-react';
import { monsterAudio } from '@/lib/monsterDenAudio';
import {
  type KidMonsterProfile,
  CREATURE_ROSTER,
  getPetFeedingStatus,
  loadFamilyPets,
  type FamilyPet,
} from '@/lib/monsterDenData';
import { authedFetch } from '@/lib/familyos';

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
  { grunt: "*Snarl-grunt snort squish!*", text: "Why did the monster make their bed? Because under the pillows is where the cleanest dust bunnies live!" },
  { grunt: "*Chomp chomp wheeze bleep!*", text: "What's a monster's favorite breakfast? Scrambled alarm clocks with extra snooze buttons!" },
  { grunt: "*Giggle-snort burb!*", text: "Hermes says: You're doing awesome today! Brush your teeth and your monster's pearly whites will shine in the dark!" },
  { grunt: "*Wiggle-whistle roar!*", text: "I just checked Mount Laundry—zero rogue socks in sight. You're a legendary room cleaner!" },
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
  const [isListening, setIsListening] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!isOpen) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      try {
        recognitionRef.current?.abort?.();
      } catch {}
      setIsListening(false);
      setSpeakingId(null);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      try {
        recognitionRef.current?.abort?.();
      } catch {}
    };
  }, []);

  if (!isOpen) return null;

  const speakText = (text: string, msgId: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    if (speakingId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = text.replace(/^\*.*?\*:\s*/, '').replace(/\*.*?\*/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.15; // friendly higher pitch
    utterance.onend = utterance.onerror = () => {
      setSpeakingId((cur) => (cur === msgId ? null : cur));
    };

    window.speechSynthesis.speak(utterance);
    setSpeakingId(msgId);
  };

  const handleToggleVoice = () => {
    if (typeof window === 'undefined') return;

    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRec) {
      setInput("Voice recognition unavailable on this device. Type here!");
      return;
    }

    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        monsterAudio.playSound('squeak');
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInput(transcript);
          handleSend(transcript, true);
        }
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const handleSend = async (overrideText?: string, wasVoice = false) => {
    const userText = (overrideText || input).trim();
    if (!userText || loading) return;
    setInput('');

    const newMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'kid',
      text: userText,
    };
    setMessages((prev) => [...prev, newMsg]);
    setLoading(true);
    monsterAudio.playSound('squeak');

    // Local ground truth: Answer "Who fed the dog/pet?" directly from verified state
    const pets = loadFamilyPets();
    const petMatch = userText.match(/who fed (?:the )?([a-z0-9_-]+)/i);
    const targetQuery = petMatch ? petMatch[1].toLowerCase() : '';
    const isPetQuery = /who fed/i.test(userText) && (
      ['dog', 'cat', 'fish', 'pet', 'pets'].includes(targetQuery) ||
      pets.some((p) => p.name.toLowerCase() === targetQuery || p.species.toLowerCase() === targetQuery)
    );

    if (isPetQuery) {
      let matchedPets: FamilyPet[] = [];
      if (['pet', 'pets', ''].includes(targetQuery)) {
        matchedPets = pets;
      } else {
        matchedPets = pets.filter(
          (p) => p.species.toLowerCase() === targetQuery || p.name.toLowerCase() === targetQuery
        );
        if (matchedPets.length === 0) matchedPets = pets;
      }

      let reply = '';
      if (matchedPets.length === 1) {
        const pet = matchedPets[0];
        const status = getPetFeedingStatus(pet.id);
        if (status.todayFeeding) {
          const timeStr = new Date(status.todayFeeding.timestamp).toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
          });
          reply = `Hermes checked the house logs: ${pet.name} (${pet.avatar}) was fed ${status.todayFeeding.mealType} today by ${status.todayFeeding.fedByName} at ${timeStr}!`;
        } else {
          reply = `Hermes checked: Nobody has fed ${pet.name} (${pet.avatar}) yet today! You can feed ${pet.name} at the Pet Feeding Station to earn +20 adventure fuel and 10 Bear Bucks! 🥣`;
        }
      } else {
        const summary = matchedPets
          .map((p) => {
            const s = getPetFeedingStatus(p.id);
            if (s.todayFeeding) {
              return `• ${p.name} ${p.avatar}: fed ${s.todayFeeding.mealType} today by ${s.todayFeeding.fedByName}`;
            }
            return `• ${p.name} ${p.avatar}: not fed yet today`;
          })
          .join('\n');
        reply = `Hermes checked the pet logs for today:\n${summary}\n\nYou can feed any hungry pets at the Pet Feeding Station! 🐾`;
      }

      const responseId = `hermes-${Date.now()}`;
      const responseMsg: ChatMessage = {
        id: responseId,
        sender: 'hermes',
        grunt: '*Snort-sniff bark!*',
        text: `*Translator click*: ${reply}`,
      };
      setMessages((prev) => [...prev, responseMsg]);
      setLoading(false);
      monsterAudio.playSound('fanfare');
      if (wasVoice) {
        speakText(reply, responseId);
      }
      return;
    }

    // Attempt authed /api/chat call with 15s timeout
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await authedFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          prompt: userText,
          system: `You are Hermes acting as the "Monster Pocket Translator" in Bear House Classic for ${currentCreature.name} (${currentCreature.title}). Your job is to translate their monster's squeaks, snarls, and chirps into funny, cheerful, kid-friendly human words! Always start with a playful creature grunt in asterisks like *Snort-snarl chirp!* then give a fun, encouraging, age-appropriate answer. Keep tone loving, goofy, and safe. Never discuss money, bills, or adult topics.`,
          maxTokens: 250,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const text = data.text || data.message || '';
        if (text) {
          const matchGrunt = text.match(/^\*([^*]+)\*/);
          const grunt = matchGrunt ? `*${matchGrunt[1]}*` : '*Snort-giggle chirp!*';
          const cleanText = text.replace(/^\*([^*]+)\*\s*:?\s*/, '').trim();
          const responseId = `hermes-${Date.now()}`;
          const responseMsg: ChatMessage = {
            id: responseId,
            sender: 'hermes',
            grunt,
            text: `*Translator click*: ${cleanText || text}`,
          };
          setMessages((prev) => [...prev, responseMsg]);
          setLoading(false);
          monsterAudio.playSound('fanfare');
          if (wasVoice) {
            speakText(cleanText || text, responseId);
          }
          return;
        }
      }
    } catch {
      // Fallback below
    }

    // Canned fallback
    setTimeout(() => {
      const randomJoke =
        CANNED_MONSTER_JOKES[Math.floor(Math.random() * CANNED_MONSTER_JOKES.length)];
      const responseId = `hermes-${Date.now()}`;
      const responseMsg: ChatMessage = {
        id: responseId,
        sender: 'hermes',
        grunt: randomJoke.grunt,
        text: `*Translator click*: ${randomJoke.text}`,
      };
      setMessages((prev) => [...prev, responseMsg]);
      setLoading(false);
      monsterAudio.playSound('fanfare');
      if (wasVoice) {
        speakText(randomJoke.text, responseId);
      }
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-lg bg-stone-900 border-4 border-cyan-500 rounded-3xl p-5 shadow-2xl flex flex-col h-[530px] text-cream-100">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-800">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 animate-pulse">
              <Bot className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-black text-cyan-400">HERMES POCKET TRANSLATOR</h3>
              <p className="text-[11px] text-stone-400">
                Voice & chat translating {currentCreature.name}'s monster squeaks!
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
              <div className="flex items-end gap-1.5 max-w-[88%]">
                <div
                  className={`p-3 rounded-2xl text-xs ${
                    m.sender === 'kid'
                      ? 'bg-purple-600 text-white rounded-tr-none'
                      : 'bg-stone-800/90 text-stone-100 border border-cyan-500/40 rounded-tl-none'
                  }`}
                >
                  {m.text}
                </div>
                {m.sender === 'hermes' && (
                  <button
                    onClick={() => speakText(m.text, m.id)}
                    className="p-1.5 bg-stone-800 hover:bg-stone-700 text-cyan-300 rounded-xl transition flex-shrink-0"
                    title="Listen aloud"
                  >
                    {speakingId === m.id ? (
                      <Square className="w-3.5 h-3.5 text-red-400 fill-current" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="text-xs text-cyan-400 animate-pulse flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Decoding creature squeaks with AI...
            </div>
          )}
        </div>

        {/* Quick Prompt Starters */}
        <div className="flex gap-1.5 overflow-x-auto py-2 border-t border-stone-800 text-[11px]">
          <button
            onClick={() => handleSend("Tell me a funny monster joke!")}
            className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-cyan-300 whitespace-nowrap"
          >
            🤣 Tell a joke
          </button>
          <button
            onClick={() => handleSend("What chores should I do next to get adventure fuel?")}
            className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-cyan-300 whitespace-nowrap"
          >
            ⚡ Next chore quest?
          </button>
          <button
            onClick={() => handleSend("Ask the house: who fed the dog today?")}
            className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-cyan-300 whitespace-nowrap"
          >
            🐶 Who fed the dog?
          </button>
          <button
            onClick={() => handleSend("Can you tell me a bedtime story?")}
            className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-cyan-300 whitespace-nowrap"
          >
            📖 Bedtime story
          </button>
        </div>

        {/* Input Bar with Voice Mic */}
        <div className="pt-2 flex items-center gap-2">
          <button
            onClick={handleToggleVoice}
            className={`p-2.5 rounded-xl border transition flex-shrink-0 ${
              isListening
                ? 'bg-red-500 border-red-400 text-white animate-pulse'
                : 'bg-stone-800 hover:bg-stone-700 border-stone-700 text-cyan-400'
            }`}
            title={isListening ? "Listening... click to stop" : "Speak to Hermes"}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={isListening ? "Listening to your voice..." : `Talk to ${currentCreature.name}...`}
            className="flex-1 bg-stone-800 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-cyan-400"
          />

          <button
            onClick={() => handleSend()}
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
