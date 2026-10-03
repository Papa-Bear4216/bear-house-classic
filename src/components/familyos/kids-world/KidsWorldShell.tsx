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
    <div className="min-h-screen bg-stone-950 text-cream-100 flex flex-col font-sans select-none overflow-x-hidden">
      {/* ---------------- TOP GAME BAR ---------------- */}
      <header className="bg-stone-900/90 border-b-4 border-amber-600/40 px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3 shadow-lg z-30">
        {/* Left: Clubhouse Title & Active Creature */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-pink-500 p-0.5 shadow-md flex items-center justify-center">
            <span className="text-2xl">👹</span>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm sm:text-base font-black tracking-wider text-amber-400 uppercase">
                MONSTER DEN
              </h1>
              <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-300 font-extrabold rounded">
                Kids World
              </span>
            </div>
            <div className="text-[11px] text-stone-300 flex items-center gap-2">
              <span>Pet: <strong>{currentCreature.name}</strong></span>
              <span className="text-stone-500">•</span>
              <span className="text-pink-400 font-bold">❤️ Happy: {profile.happiness ?? 100}%</span>
            </div>
          </div>
        </div>

        {/* Center: Kid Room Switcher ("Knock & Visit" Sibling Rooms) */}
        {childMembers.length > 1 && (
          <div className="hidden md:flex items-center gap-1 bg-stone-850 p-1 rounded-2xl border border-stone-750">
            {childMembers.map((kid) => {
              const isSelected = selectedKidId === kid.id;
              return (
                <button
                  key={kid.id}
                  onClick={() => setSelectedKidId(kid.id)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-amber-500 text-stone-950 shadow'
                      : 'text-stone-400 hover:text-white'
                  }`}
                >
                  <span>{(kid as { avatar?: string }).avatar || '🐻'}</span>
                  <span>{kid.name}'s Den</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Right: Bear Bucks & Action Badges */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Bear Bucks Counter */}
          <div className="px-3 py-1.5 bg-yellow-500/15 border border-yellow-500/40 rounded-2xl flex items-center gap-1.5 text-xs font-black text-yellow-400 shadow-inner">
            <span className="text-base">🪙</span>
            <span>{spendable} Bear Bucks</span>
          </div>

          {/* Quick Launcher Icons */}
          <button
            onClick={() => setRoutinesOpen(true)}
            className="p-2 rounded-xl bg-amber-600/20 border border-amber-500/40 text-amber-400 hover:bg-amber-600/40 transition"
            title="My Daily Routines"
          >
            <Sun className="w-4 h-4" />
          </button>

          <button
            onClick={() => setHomeworkOpen(true)}
            className="p-2 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-400 hover:bg-blue-600/40 transition"
            title="My Homework"
          >
            <BookOpen className="w-4 h-4" />
          </button>

          <button
            onClick={() => setHermesOpen(true)}
            className="p-2 rounded-xl bg-cyan-600/20 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-600/40 transition"
            title="Hermes Monster Translator"
          >
            <Bot className="w-4 h-4" />
          </button>

          <button
            onClick={() => setPetFeedingOpen(true)}
            className="p-2 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-600/40 transition"
            title="Pet Feeding Station"
          >
            <Utensils className="w-4 h-4" />
          </button>

          <button
            onClick={() => setBedtimeOpen(true)}
            className="p-2 rounded-xl bg-indigo-600/20 border border-indigo-500/40 text-indigo-400 hover:bg-indigo-600/40 transition"
            title="Bedtime Wind-Down"
          >
            <Moon className="w-4 h-4" />
          </button>

          <button
            onClick={() => setArcadeOpen(true)}
            className="p-2 rounded-xl bg-pink-600/20 border border-pink-500/40 text-pink-400 hover:bg-pink-600/40 transition"
            title="Arcade Minigames"
          >
            <Gamepad2 className="w-4 h-4" />
          </button>

          {/* Parent Exit Button */}
          {onExitKidMode && (
            <button
              onClick={() => setParentExitConfirm(true)}
              className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-white border border-stone-700"
              title="Parent Exit to Adult Dashboard"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

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
