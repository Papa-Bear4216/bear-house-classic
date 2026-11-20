import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Shirt,
  Compass,
  Bot,
  Gamepad2,
  LogOut,
  DoorOpen,
  Volume2,
  VolumeX,
  Radio,
  Lock,
  Sun,
  BookOpen,
  Moon,
  Utensils,
} from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import {
  getProfileForMember,
  updateMemberProfile,
  CREATURE_ROSTER,
  type KidMonsterProfile,
} from '@/lib/monsterDenData';
import { DenRoomCanvas } from './DenRoomCanvas';
import { GachaWheelModal } from './GachaWheelModal';
import { WardrobeModal } from './WardrobeModal';
import { ExpeditionStation } from './ExpeditionStation';
import { MonsterHermesDialog } from './MonsterHermesDialog';
import { BedtimeModal } from './BedtimeModal';
import { PetFeedingModal } from './PetFeedingModal';
import ArcadeHub from '@/components/familyos/arcade/ArcadeHub';
import RoutinesHub from '@/components/familyos/sections/RoutinesHub';
import KidRoom from '@/components/familyos/sections/KidRoom';
import { HomeworkTab } from '@/components/familyos/sections/KidsHub';
import { loadPointsBalance, loadRedemptions } from '@/lib/familyos';
import { monsterAudio } from '@/lib/monsterDenAudio';

interface KidsWorldShellProps {
  onExitKidMode?: () => void;
}

export const KidsWorldShell: React.FC<KidsWorldShellProps> = ({ onExitKidMode }) => {
  const { currentUser, currentRole, householdMembers } = useAppContext();

  // Child members
  const childMembers = householdMembers.filter((m) => m.role === 'child');
  const initialMemberId =
    currentRole === 'child' && currentUser ? currentUser.id : childMembers[0]?.id || 'kid-1';

  const [selectedKidId, setSelectedKidId] = useState(initialMemberId);
  const [profile, setProfile] = useState<KidMonsterProfile>(() =>
    getProfileForMember(selectedKidId)
  );

  // Modals state
  const [gachaOpen, setGachaOpen] = useState(false);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [expeditionOpen, setExpeditionOpen] = useState(false);
  const [hermesOpen, setHermesOpen] = useState(false);
  const [arcadeOpen, setArcadeOpen] = useState(false);
  const [routinesOpen, setRoutinesOpen] = useState(false);
  const [homeworkOpen, setHomeworkOpen] = useState(false);
  const [bedtimeOpen, setBedtimeOpen] = useState(false);
  const [petFeedingOpen, setPetFeedingOpen] = useState(false);
  const [kidRoomOpen, setKidRoomOpen] = useState(false);
  const [parentExitConfirm, setParentExitConfirm] = useState(false);
  const [mathAnswer, setMathAnswer] = useState('');

  // Spendable points
  const calculateSpendable = (kidId: string) => {
    const points = loadPointsBalance();
    const redemptions = loadRedemptions();
    const rawBalance = points[kidId] || 0;
    const pendingCost = redemptions
      .filter((r) => r.memberId === kidId && r.status === 'pending')
      .reduce((sum, r) => sum + r.cost, 0);
    return Math.max(0, rawBalance - pendingCost);
  };

  const [spendable, setSpendable] = useState(() => calculateSpendable(selectedKidId));

  useEffect(() => {
    setProfile(getProfileForMember(selectedKidId));
    setSpendable(calculateSpendable(selectedKidId));
  }, [selectedKidId]);

  const isOwner = currentUser?.id === selectedKidId || currentRole !== 'child';
  const selectedKid = householdMembers.find((m) => m.id === selectedKidId);
  const currentCreature =
    CREATURE_ROSTER.find((c) => c.id === profile.activeCreatureId) || CREATURE_ROSTER[0];

  const handleProfileUpdated = (updated: KidMonsterProfile) => {
    if (updated.memberId === selectedKidId) {
      setProfile(updated);
      setSpendable(calculateSpendable(selectedKidId));
    }
  };

  const verifyExit = () => {
    // Simple math lock for parents to exit kid space
    if (mathAnswer === '12' || !currentRole || currentRole !== 'child') {
      if (onExitKidMode) onExitKidMode();
    } else {
      monsterAudio.playSound('burp');
      setMathAnswer('');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#130b29] via-[#1a1033] to-[#0c1324] text-cream-100 flex flex-col font-sans select-none overflow-x-hidden relative">
      {/* Playful ambient clubhouse glows */}
      <div className="fixed -top-32 -left-32 w-96 h-96 rounded-full bg-fuchsia-600/15 blur-[130px] pointer-events-none" />
      <div className="fixed top-1/3 -right-32 w-96 h-96 rounded-full bg-amber-500/15 blur-[130px] pointer-events-none" />

      {/* ---------------- TOP GAME BAR ---------------- */}
      <header className="bg-[#160d2e]/90 backdrop-blur-xl border-b-2 border-pink-500/30 px-3 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shadow-lg z-30">
        {/* Left: Clubhouse Title & Active Creature */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 p-0.5 shadow-lg shadow-pink-500/30 flex items-center justify-center ring-2 ring-white/20">
            <span className="text-2xl">👹</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black tracking-wider bg-gradient-to-r from-amber-300 via-pink-300 to-purple-300 bg-clip-text text-transparent uppercase">
                MONSTER DEN
              </h1>
              <span className="text-[10px] px-2 py-0.5 bg-pink-500/25 border border-pink-400/40 text-pink-200 font-extrabold rounded-full">
                Kids World
              </span>
            </div>
            <div className="text-xs text-purple-200/90 flex items-center gap-2 mt-0.5">
              <span>Buddy: <strong className="text-white">{currentCreature.name}</strong></span>
              <span className="text-purple-400">•</span>
              <span className="text-pink-300 font-bold">❤️ {profile.happiness ?? 100}% Happy</span>
            </div>
          </div>
        </div>

        {/* Center: Kid Room Switcher ("Knock & Visit" Sibling Rooms — works on mobile too!) */}
        {childMembers.length > 1 && (
          <div className="flex items-center gap-1.5 bg-slate-950/60 p-1 rounded-2xl border border-purple-500/30 overflow-x-auto max-w-full">
            {childMembers.map((kid) => {
              const isSelected = selectedKidId === kid.id;
              return (
                <button
                  key={kid.id}
                  onClick={() => setSelectedKidId(kid.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 whitespace-nowrap active:scale-95 ${
                    isSelected
                      ? 'bg-gradient-to-r from-amber-400 to-pink-500 text-slate-950 shadow-md'
                      : 'text-purple-200 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <span>{(kid as { avatar?: string }).avatar || '🐻'}</span>
                  <span>{kid.name}&apos;s Den</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Right: Bear Bucks & Exit */}
        <div className="flex items-center gap-2 ml-auto sm:ml-0">
          <div className="px-3.5 py-1.5 bg-gradient-to-r from-amber-500/25 to-yellow-500/20 border border-amber-400/50 rounded-2xl flex items-center gap-1.5 text-xs sm:text-sm font-black text-amber-300 shadow-inner">
            <span className="text-base">🪙</span>
            <span>{spendable} Bear Bucks</span>
          </div>

          {onExitKidMode && (
            <button
              onClick={() => setParentExitConfirm(true)}
              className="px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition"
              title="Exit Kids World"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exit</span>
            </button>
          )}
        </div>
      </header>

      {/* ---------------- LABELED KID NAVIGATION DOCK ---------------- */}
      <nav
        aria-label="Kids World activities"
        className="bg-[#120a24]/80 border-b border-purple-500/20 px-3 sm:px-6 py-2.5 z-20"
      >
        <div className="max-w-6xl mx-auto flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none">
          <button
            onClick={() => setGachaOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-amber-500/25 to-pink-500/25 hover:from-amber-500/40 hover:to-pink-500/40 border border-amber-400/40 text-amber-200 text-xs font-extrabold whitespace-nowrap transition active:scale-95"
          >
            <span>🎡</span> Prize Wheel
          </button>
          <button
            onClick={() => setWardrobeOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-fuchsia-500/20 hover:bg-fuchsia-500/35 border border-fuchsia-400/35 text-fuchsia-200 text-xs font-extrabold whitespace-nowrap transition active:scale-95"
          >
            <span>👕</span> Dress Up
          </button>
          <button
            onClick={() => setExpeditionOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/35 text-emerald-200 text-xs font-extrabold whitespace-nowrap transition active:scale-95"
          >
            <span>🗺️</span> Adventure
          </button>
          <button
            onClick={() => setKidRoomOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-purple-500/20 hover:bg-purple-500/35 border border-purple-400/35 text-purple-200 text-xs font-extrabold whitespace-nowrap transition active:scale-95"
          >
            <span>🏰</span> My Room &amp; Journal
          </button>
          <button
            onClick={() => setArcadeOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-pink-500/25 hover:bg-pink-500/40 border border-pink-400/40 text-pink-200 text-xs font-extrabold whitespace-nowrap transition active:scale-95"
          >
            <span>🕹️</span> Arcade
          </button>
          <button
            onClick={() => setRoutinesOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/35 text-amber-200 text-xs font-extrabold whitespace-nowrap transition active:scale-95"
          >
            <span>☀️</span> Routines
          </button>
          <button
            onClick={() => setHomeworkOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-sky-500/20 hover:bg-sky-500/35 border border-sky-400/35 text-sky-200 text-xs font-extrabold whitespace-nowrap transition active:scale-95"
          >
            <span>📚</span> Homework
          </button>
          <button
            onClick={() => setPetFeedingOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-teal-500/20 hover:bg-teal-500/35 border border-teal-400/35 text-teal-200 text-xs font-extrabold whitespace-nowrap transition active:scale-95"
          >
            <span>🐾</span> Feed Pets
          </button>
          <button
            onClick={() => setHermesOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-cyan-500/20 hover:bg-cyan-500/35 border border-cyan-400/35 text-cyan-200 text-xs font-extrabold whitespace-nowrap transition active:scale-95"
          >
            <span>🤖</span> Ask Hermes
          </button>
          <button
            onClick={() => setBedtimeOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-indigo-500/20 hover:bg-indigo-500/35 border border-indigo-400/35 text-indigo-200 text-xs font-extrabold whitespace-nowrap transition active:scale-95"
          >
            <span>🌙</span> Bedtime
          </button>
        </div>
      </nav>

      {/* ---------------- MAIN CANVAS CONTENT ---------------- */}
      <main className="flex-1 p-2 sm:p-4 max-w-6xl w-full mx-auto flex flex-col justify-center">
        <DenRoomCanvas
          key={selectedKidId}
          profile={profile}
          onProfileUpdated={handleProfileUpdated}
          isOwner={isOwner}
          visitorMemberId={currentUser?.id}
          visitorName={currentUser?.name}
          onOpenGacha={() => setGachaOpen(true)}
          onOpenWardrobe={() => setWardrobeOpen(true)}
          onOpenExpeditions={() => setExpeditionOpen(true)}
          onOpenBedtime={() => setBedtimeOpen(true)}
          onOpenPetFeeding={() => setPetFeedingOpen(true)}
          spendablePoints={spendable}
        />
      </main>

      {/* ---------------- MODALS ---------------- */}
      <GachaWheelModal
        key={selectedKidId}
        isOpen={gachaOpen}
        onClose={() => setGachaOpen(false)}
        profile={profile}
        onProfileUpdated={handleProfileUpdated}
        spendablePoints={spendable}
      />

      <WardrobeModal
        key={selectedKidId}
        isOpen={wardrobeOpen}
        onClose={() => setWardrobeOpen(false)}
        profile={profile}
        onProfileUpdated={handleProfileUpdated}
        spendablePoints={spendable}
      />

      <ExpeditionStation
        key={selectedKidId}
        isOpen={expeditionOpen}
        onClose={() => setExpeditionOpen(false)}
        profile={profile}
        onProfileUpdated={handleProfileUpdated}
      />

      <BedtimeModal
        key={`bedtime-${selectedKidId}`}
        isOpen={bedtimeOpen}
        onClose={() => setBedtimeOpen(false)}
        profile={profile}
        onProfileUpdated={handleProfileUpdated}
      />

      <PetFeedingModal
        key={`petfeed-${selectedKidId}`}
        isOpen={petFeedingOpen}
        onClose={() => setPetFeedingOpen(false)}
        profile={profile}
        onProfileUpdated={handleProfileUpdated}
      />

      <MonsterHermesDialog
        key={selectedKidId}
        isOpen={hermesOpen}
        onClose={() => setHermesOpen(false)}
        profile={profile}
      />

      {/* Routines Modal */}
      {routinesOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-4xl bg-stone-900 border-4 border-amber-500 rounded-3xl p-5 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800 mb-4">
              <h2 className="text-xl font-black text-amber-400 flex items-center gap-2">
                <Sun className="w-6 h-6" /> DAILY ROUTINES & QUESTS
              </h2>
              <button
                onClick={() => setRoutinesOpen(false)}
                className="p-1 rounded-full bg-stone-800 text-stone-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <RoutinesHub />
          </div>
        </div>
      )}

      {/* Homework Modal */}
      {homeworkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-4xl bg-stone-900 border-4 border-blue-500 rounded-3xl p-5 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800 mb-4">
              <h2 className="text-xl font-black text-blue-400 flex items-center gap-2">
                <BookOpen className="w-6 h-6" /> HOMEWORK & SCHOOL
              </h2>
              <button
                onClick={() => setHomeworkOpen(false)}
                className="p-1 rounded-full bg-stone-800 text-stone-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <HomeworkTab isAdm={false} kids={childMembers.map((m) => m.name)} />
          </div>
        </div>
      )}

      {/* Kid Room & Sealed Private Journal Modal */}
      {kidRoomOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-4xl bg-slate-900 border-4 border-purple-500 rounded-3xl p-5 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h2 className="text-xl font-black text-purple-300 flex items-center gap-2">
                <DoorOpen className="w-6 h-6" /> MY ROOM &amp; SEALED JOURNAL
              </h2>
              <button
                onClick={() => setKidRoomOpen(false)}
                className="p-1.5 rounded-full bg-slate-800 text-slate-300 hover:text-white"
              >
                ✕
              </button>
            </div>
            <KidRoom />
          </div>
        </div>
      )}

      {/* Bear House Arcade Minigames Modal */}
      {arcadeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-4xl bg-stone-900 border-4 border-pink-500 rounded-3xl p-5 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800 mb-4">
              <h2 className="text-xl font-black text-pink-400 flex items-center gap-2">
                <Gamepad2 className="w-6 h-6" /> CHORE ARCADE
              </h2>
              <button
                onClick={() => setArcadeOpen(false)}
                className="p-1 rounded-full bg-stone-800 text-stone-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <ArcadeHub />
          </div>
        </div>
      )}

      {/* Parent Exit Math Lock */}
      {parentExitConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in zoom-in-95">
          <div className="w-full max-w-xs bg-stone-900 border-4 border-stone-700 rounded-2xl p-5 text-center text-cream-100 shadow-2xl">
            <Lock className="w-8 h-8 text-amber-400 mx-auto mb-2" />
            <h3 className="text-sm font-black text-white">Exit Monster Den?</h3>
            <p className="text-xs text-stone-400 mt-1 mb-3">
              Parents: What is <strong>6 + 6</strong>?
            </p>
            <input
              type="text"
              value={mathAnswer}
              onChange={(e) => setMathAnswer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && verifyExit()}
              className="w-full bg-stone-800 border border-stone-700 rounded-xl px-3 py-2 text-center text-sm text-white mb-3"
              placeholder="Answer..."
            />
            <div className="flex gap-2">
              <button
                onClick={() => setParentExitConfirm(false)}
                className="flex-1 py-2 bg-stone-800 rounded-xl text-xs font-bold text-stone-400"
              >
                Stay
              </button>
              <button
                onClick={verifyExit}
                className="flex-1 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black rounded-xl text-xs"
              >
                Exit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
