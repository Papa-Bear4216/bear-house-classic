import React, { useState, useEffect } from 'react';
import {
  Moon,
  X,
  Music,
  Lightbulb,
  BookOpen,
  Check,
  Flame,
  Play,
  Square,
} from 'lucide-react';
import {
  type KidMonsterProfile,
  CREATURE_ROSTER,
  recordBedtime,
  wakeUpMonster,
  getProfileForMember,
  getSleepDayStr,
  getYesterdaySleepDayStr,
} from '@/lib/monsterDenData';
import { CreatureRenderer } from './CreatureRenderer';
import { monsterAudio } from '@/lib/monsterDenAudio';
import { triggerHaDevice, authedFetch } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';

interface BedtimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: KidMonsterProfile;
  onProfileUpdated: (updated: KidMonsterProfile) => void;
}

const CANNED_BEDTIME_STORIES = [
  {
    title: 'The Great Blanket Fort of Couch Canyon',
    story: `Once upon a cozy night, ${'{name}'} gathered every spare pillow and fuzzy blanket in the living room. Deep in the heart of Couch Canyon, beneath the glow of the imaginary moon, they built a fortress so soft that not even a single snarl could escape.\n\nAs the stars twinkled outside the window, ${'{name}'} pulled a warm fleece blanket up to their button eyes, counted three fluffy dust bunnies jumping over a shoebox, and gave one final, happy yawn.\n\nThe fortress kept them safe, warm, and dreaming of tomorrow's adventures. Goodnight, brave monster. Sweet dreams!`,
  },
  {
    title: 'The Moonbeam Pajama Party',
    story: `High up on the bedroom shelf, a tiny sliver of moonlight tapped ${'{name}'} gently on the nose. It was time for the secret pajama dance! With bunny slippers laced and fuzzy ears drooping with sleepiness, ${'{name}'} tip-toed across the rug.\n\nAll the toys in the room were already sound asleep—the teddy bears were snoring, and the toy cars were parked in dreamland. ${'{name}'} curled up tightly in their bed, tucking their claws and tail beneath the cozy quilt.\n\nThe whole house grew peaceful and quiet. The stars sang a sleepy song, and sleep swept in like a soft cloud. Nighty night!`,
  },
];

export const BedtimeModal: React.FC<BedtimeModalProps> = ({
  isOpen,
  onClose,
  profile,
  onProfileUpdated,
}) => {
  const { householdMembers } = useAppContext();
  const childName = householdMembers.find((m) => m.id === profile.memberId)?.name || 'Kid';
  const currentCreature =
    CREATURE_ROSTER.find((c) => c.id === profile.activeCreatureId) || CREATURE_ROSTER[0];

  const todaySleepDay = getSleepDayStr();
  const yesterdaySleepDay = getYesterdaySleepDayStr();
  const isStreakActive = !!profile.bedtimeStreak && (
    profile.lastBedtimeDate === todaySleepDay || profile.lastBedtimeDate === yesterdaySleepDay
  );

  const [lullabyActive, setLullabyActive] = useState(false);
  const [lightsStatus, setLightsStatus] = useState<string | null>(null);
  const [lightsLoading, setLightsLoading] = useState(false);
  const [story, setStory] = useState<{ title: string; text: string } | null>(null);
  const [storyLoading, setStoryLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [tuckedInDone, setTuckedInDone] = useState(profile.tuckedIn || false);
  const [justEarnedReward, setJustEarnedReward] = useState(false);

  useEffect(() => {
    setTuckedInDone(profile.tuckedIn || false);
  }, [profile.tuckedIn]);

  useEffect(() => {
    if (isOpen) {
      setLullabyActive(monsterAudio.getIsLullabyPlaying());
    } else {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);
      setJustEarnedReward(false);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      // Cleanup speech when unmounting (preserves background lullaby if child wants sleep chimes)
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  if (!isOpen) return null;

  const handleToggleLullaby = () => {
    const next = monsterAudio.toggleLullaby();
    setLullabyActive(next);
  };

  const handleDimLights = async () => {
    setLightsLoading(true);
    try {
      const roomLightEntity = 'light.kids_bedroom';
      const result = await triggerHaDevice(roomLightEntity, 'turn_on');
      if (result.ok) {
        setLightsStatus('💡 Bedroom lights dimmed to cozy glow!');
      } else {
        setLightsStatus("Couldn't reach smart lights — ask a grown-up!");
      }
    } catch {
      setLightsStatus("Couldn't reach smart lights — ask a grown-up!");
    } finally {
      setLightsLoading(false);
    }
  };

  const handleGetBedtimeStory = async () => {
    setStoryLoading(true);
    monsterAudio.playSound('squeak');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await authedFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          prompt: `Write a short, soothing 3-paragraph bedtime story for a child named ${childName} starring their pet monster ${currentCreature.name} (${currentCreature.title}). The story should be cozy, gentle, and help them fall asleep peacefully. Return with a cute title.`,
          maxTokens: 350,
          role: 'child',
          memberId: profile.memberId,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const text = data.text || data.message || '';
        if (text) {
          const lines = text.split('\n').filter(Boolean);
          const title = lines[0]?.replace(/^#+\s*/, '') || `${currentCreature.name}'s Cozy Slumber`;
          const body = lines.slice(1).join('\n\n') || text;
          setStory({ title, text: body });
          setStoryLoading(false);
          return;
        }
      }
    } catch {
      // Fallback to delightful canned story
    }

    // Canned fallback
    const fallbackTemplate =
      CANNED_BEDTIME_STORIES[Math.floor(Math.random() * CANNED_BEDTIME_STORIES.length)];
    setStory({
      title: fallbackTemplate.title,
      text: fallbackTemplate.story.replace(/{name}/g, currentCreature.name),
    });
    setStoryLoading(false);
  };

  const handleToggleSpeak = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    if (!story) return;

    const utterance = new SpeechSynthesisUtterance(story.text);
    utterance.rate = 0.85; // gently slower for bedtime
    utterance.pitch = 1.05;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  const handleTuckIn = () => {
    monsterAudio.playSound('lullaby_chime');
    const result = recordBedtime(profile.memberId);
    setJustEarnedReward(result.pointsAwarded > 0);
    setTuckedInDone(true);
    const updated = getProfileForMember(profile.memberId);
    onProfileUpdated(updated);
  };

  const handleWakeUp = () => {
    monsterAudio.playSound('cheer');
    monsterAudio.stopLullaby();
    setLullabyActive(false);
    setJustEarnedReward(false);
    const updated = wakeUpMonster(profile.memberId);
    setTuckedInDone(false);
    onProfileUpdated(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-xl bg-gradient-to-b from-stone-900 via-indigo-950 to-stone-950 border-4 border-indigo-500/60 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col max-h-[92vh] overflow-y-auto text-cream-100">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-indigo-900/60">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-2xl bg-indigo-500/20 text-indigo-300">
              <Moon className="w-6 h-6 animate-pulse" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-indigo-300 uppercase tracking-wide">
                  BEDTIME WIND-DOWN
                </h3>
                {isStreakActive ? (
                  <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 text-[10px] font-black rounded-full flex items-center gap-1 border border-amber-500/40">
                    <Flame className="w-3 h-3 text-amber-400" />
                    {profile.bedtimeStreak}d Streak
                  </span>
                ) : null}
              </div>
              <p className="text-[11px] text-indigo-200/70">
                Tuck {currentCreature.name} into bed & relax before sleep!
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-stone-800/80 hover:bg-stone-700 text-stone-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Center Sleeping Creature Stage */}
        <div className="my-4 py-3 bg-stone-950/70 border border-indigo-900/50 rounded-2xl flex flex-col items-center justify-center relative overflow-hidden shadow-inner">
          {/* Night Sky Stars */}
          <div className="absolute inset-0 pointer-events-none opacity-40">
            <span className="absolute top-3 left-8 text-xs text-yellow-200 animate-pulse">✨</span>
            <span className="absolute top-6 right-12 text-sm text-yellow-100 animate-ping duration-1000">⭐</span>
            <span className="absolute bottom-5 left-16 text-xs text-indigo-300 animate-pulse">🌟</span>
            <span className="absolute top-12 left-1/3 text-xs text-yellow-200">✨</span>
            <span className="absolute bottom-4 right-1/4 text-xs text-yellow-300 animate-pulse">⭐</span>
          </div>

          <CreatureRenderer
            creature={currentCreature}
            profile={profile}
            size={180}
            interactive={false}
            showSleeping={tuckedInDone}
          />

          <div className="mt-2 text-center z-10">
            <span className="text-xs font-black text-indigo-300">
              {tuckedInDone ? `💤 ${currentCreature.name} is sleeping peacefully...` : `🥱 ${currentCreature.name} is getting sleepy!`}
            </span>
          </div>
        </div>

        {/* Wind-Down Control Center */}
        <div className="grid grid-cols-2 gap-2.5 mb-4 text-xs">
          {/* HA Lights Button */}
          <button
            onClick={handleDimLights}
            disabled={lightsLoading}
            className="p-3 rounded-2xl bg-indigo-950/70 hover:bg-indigo-900/70 border border-indigo-800/60 flex items-center gap-2.5 text-left transition active:scale-95"
          >
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300">
              <Lightbulb className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-amber-200">Dim Lights</div>
              <div className="text-[10px] text-stone-400">Nightlight glow</div>
            </div>
          </button>

          {/* Lullaby Synthesizer */}
          <button
            onClick={handleToggleLullaby}
            className={`p-3 rounded-2xl border flex items-center gap-2.5 text-left transition active:scale-95 ${
              lullabyActive
                ? 'bg-purple-900/80 border-purple-400 text-purple-200 shadow-md'
                : 'bg-indigo-950/70 hover:bg-indigo-900/70 border-indigo-800/60 text-stone-300'
            }`}
          >
            <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300">
              <Music className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold">{lullabyActive ? 'Lullaby Playing' : 'Play Lullaby'}</div>
              <div className="text-[10px] text-stone-400">8-bit chime sleep loop</div>
            </div>
          </button>
        </div>

        {lightsStatus && (
          <div className="mb-3 px-3 py-1.5 bg-indigo-900/40 border border-indigo-700/60 rounded-xl text-[11px] text-indigo-200 text-center animate-in fade-in">
            {lightsStatus}
          </div>
        )}

        {/* Hermes Bedtime Story Section */}
        <div className="mb-4 bg-stone-900/90 border border-indigo-800/60 rounded-2xl p-3.5 flex flex-col">
          <div className="flex items-center justify-between pb-2 border-b border-stone-800">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
              <BookOpen className="w-4 h-4 text-cyan-400" />
              <span>Hermes Bedtime Story</span>
            </div>
            {story && (
              <button
                onClick={handleToggleSpeak}
                className="px-2.5 py-1 bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/40 rounded-lg text-[10px] font-bold text-cyan-300 flex items-center gap-1 transition"
              >
                {isSpeaking ? (
                  <>
                    <Square className="w-3 h-3 text-red-400 fill-current" /> Stop Voice
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 text-cyan-400 fill-current" /> Listen Aloud
                  </>
                )}
              </button>
            )}
          </div>

          {story ? (
            <div className="mt-2.5 space-y-2">
              <h4 className="text-xs font-extrabold text-amber-300">{story.title}</h4>
              <p className="text-[11px] text-stone-200 leading-relaxed whitespace-pre-line max-h-36 overflow-y-auto pr-1">
                {story.text}
              </p>
            </div>
          ) : (
            <div className="py-4 text-center">
              <p className="text-[11px] text-stone-400 mb-3">
                Ask Hermes to narrate a magical bedtime story starring {currentCreature.name}!
              </p>
              <button
                onClick={handleGetBedtimeStory}
                disabled={storyLoading}
                className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow transition disabled:opacity-50"
              >
                {storyLoading ? '✨ Dreaming up story...' : '📖 Tell Bedtime Story'}
              </button>
            </div>
          )}
        </div>

        {/* Big Action: Tuck In or Wake Up */}
        <div className="pt-2 border-t border-indigo-900/60 flex items-center gap-3">
          {tuckedInDone ? (
            <div className="flex-1 flex items-center justify-between bg-indigo-950/60 border border-indigo-800/80 rounded-2xl px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-emerald-400" />
                <div>
                  <div className="text-xs font-bold text-emerald-300">Tucked in for the night!</div>
                  <div className="text-[10px] text-indigo-300/70">
                    {justEarnedReward
                      ? '+15 Bear Bucks & Streak Earned!'
                      : (profile.lastBedtimeDate === todaySleepDay
                          ? 'Resting cozy for the night (Daily bonus earned)'
                          : '+15 Bear Bucks & Streak Earned')}
                  </div>
                </div>
              </div>
              <button
                onClick={handleWakeUp}
                className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-xl text-xs font-bold"
              >
                Wake Up ☀️
              </button>
            </div>
          ) : (
            <button
              onClick={handleTuckIn}
              className="flex-1 py-3 bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-600 hover:from-indigo-400 hover:to-pink-500 text-white font-black text-sm rounded-2xl shadow-lg flex items-center justify-center gap-2 transition active:scale-95"
            >
              <Moon className="w-4 h-4" /> {profile.lastBedtimeDate === todaySleepDay ? 'TUCK IN & SLEEP' : 'TUCK IN & SLEEP (+15 Bear Bucks)'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
