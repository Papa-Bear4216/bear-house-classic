import React, { useState, useEffect } from 'react';
import { Compass, Sparkles, MapPin, Gift, Clock, CheckCircle2, ChevronRight, X } from 'lucide-react';
import {
  EXPEDITION_ZONES,
  updateMemberProfile,
  addAdventureFuel,
  type ExpeditionZone,
  type KidMonsterProfile,
  type PastExpeditionLog,
} from '@/lib/monsterDenData';
import { monsterAudio } from '@/lib/monsterDenAudio';
import { loadPointsBalance, savePointsBalance, saveJSON, KEYS, loadJSON } from '@/lib/familyos';

interface ExpeditionStationProps {
  isOpen: boolean;
  onClose: () => void;
  profile: KidMonsterProfile;
  onProfileUpdated: (p: KidMonsterProfile) => void;
}

export const ExpeditionStation: React.FC<ExpeditionStationProps> = ({
  isOpen,
  onClose,
  profile,
  onProfileUpdated,
}) => {
  const [selectedZone, setSelectedZone] = useState<ExpeditionZone>(EXPEDITION_ZONES[0]);
  const [now, setNow] = useState(Date.now());
  const [activeTab, setActiveTab] = useState<'map' | 'fuel' | 'postcards'>('map');
  const [claimedRewardModal, setClaimedRewardModal] = useState<PastExpeditionLog | null>(null);
  const [tasks, setTasks] = useState<any[]>(() => loadJSON<any[]>(KEYS.tasks, []).filter((t) => !t.completed));

  useEffect(() => {
    if (!isOpen) return;
    setTasks(loadJSON<any[]>(KEYS.tasks, []).filter((t) => !t.completed));
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const activeExpedition = profile.activeExpedition;
  const currentActiveZone = activeExpedition
    ? EXPEDITION_ZONES.find((z) => z.id === activeExpedition.zoneId) || EXPEDITION_ZONES[0]
    : null;

  const isComplete =
    activeExpedition && now >= activeExpedition.startTime + activeExpedition.durationMs;

  const progressFraction = activeExpedition
    ? Math.min(1, Math.max(0, (now - activeExpedition.startTime) / activeExpedition.durationMs))
    : 0;

  // Real-time Checkpoint calculation
  const currentCheckpoint = currentActiveZone
    ? [...currentActiveZone.checkpoints]
        .reverse()
        .find((cp) => progressFraction >= cp.timeFraction) || currentActiveZone.checkpoints[0]
    : null;

  const handleLaunch = (zone: ExpeditionZone) => {
    if (profile.adventureFuel < zone.fuelCost) {
      monsterAudio.playSound('burp');
      return;
    }

    const durationMs = zone.durationMinutes * 60 * 1000;
    const newExpedition = {
      zoneId: zone.id,
      startTime: Date.now(),
      durationMs,
      claimed: false,
    };

    const nextFuel = Math.max(0, profile.adventureFuel - zone.fuelCost);
    const updated = updateMemberProfile(profile.memberId, {
      activeExpedition: newExpedition,
      adventureFuel: nextFuel,
    });
    onProfileUpdated(updated);
    monsterAudio.playSound('fanfare');
  };

  const handleClaim = () => {
    if (!activeExpedition || !currentActiveZone) return;

    // Pick random souvenir and story
    const souvenir =
      currentActiveZone.possibleSouvenirs[
        Math.floor(Math.random() * currentActiveZone.possibleSouvenirs.length)
      ];
    const story =
      currentActiveZone.stories[Math.floor(Math.random() * currentActiveZone.stories.length)];
    const lootCoins = 35 + Math.floor(Math.random() * 25);

    const logEntry: PastExpeditionLog = {
      id: `exp-${Date.now()}`,
      zoneName: currentActiveZone.name,
      date: Date.now(),
      storyText: story,
      souvenirName: souvenir.name,
      souvenirIcon: souvenir.icon,
      lootCoins,
    };

    // Add loot coins to balance
    const balance = loadPointsBalance();
    balance[profile.memberId] = (balance[profile.memberId] || 0) + lootCoins;
    savePointsBalance(balance);

    // Give a bonus wheel spin for finishing expedition!
    const nextSpins = (profile.spinsAvailable || 0) + 1;

    const updated = updateMemberProfile(profile.memberId, {
      activeExpedition: null,
      expeditionHistory: [logEntry, ...(profile.expeditionHistory || [])],
      spinsAvailable: nextSpins,
    });
    onProfileUpdated(updated);
    monsterAudio.playSound('fanfare');
    setClaimedRewardModal(logEntry);
  };

  const handleCompleteChore = (taskId: string) => {
    const newFuel = addAdventureFuel(profile.memberId, 25);
    monsterAudio.playSound('coin');

    const allTasks = loadJSON<any[]>(KEYS.tasks, []);
    const updatedTasks = allTasks.map((t) =>
      t.id === taskId ? { ...t, completed: true, completedAt: Date.now() } : t
    );
    saveJSON(KEYS.tasks, updatedTasks);

    setTasks(updatedTasks.filter((t) => !t.completed));
    onProfileUpdated({ ...profile, adventureFuel: newFuel });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-3xl bg-stone-900 border-4 border-amber-500 rounded-3xl p-5 shadow-2xl flex flex-col max-h-[92vh] text-cream-100">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-800">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
              <Compass className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-xl font-black text-white">THE FINCH-STYLE EXPEDITION MAP</h2>
              <p className="text-xs text-stone-400">Complete chores to fuel adventures and send your beast into the wild!</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-3 py-1 bg-amber-500/20 border border-amber-500/50 rounded-full text-xs font-black text-amber-400">
              ⚡ Fuel: {profile.adventureFuel || 0} / 100%
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-2 my-3 border-b border-stone-800 pb-2">
          <button
            onClick={() => setActiveTab('map')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'map' ? 'bg-amber-600 text-white' : 'bg-stone-800 text-stone-400'
            }`}
          >
            🗺️ Live Journey Map
          </button>
          <button
            onClick={() => setActiveTab('fuel')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'fuel' ? 'bg-amber-600 text-white' : 'bg-stone-800 text-stone-400'
            }`}
          >
            ⚡ Chore Fuel Cells
          </button>
          <button
            onClick={() => setActiveTab('postcards')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'postcards' ? 'bg-amber-600 text-white' : 'bg-stone-800 text-stone-400'
            }`}
          >
            📬 Postcards & Souvenirs ({profile.expeditionHistory?.length || 0})
          </button>
        </div>

        {/* Content Tabs */}
        <div className="flex-1 overflow-y-auto pr-1">
          {/* TAB 1: Live Journey Map */}
          {activeTab === 'map' && (
            <div className="space-y-4">
              {/* Active Expedition in Progress */}
              {activeExpedition && currentActiveZone ? (
                <div className="bg-stone-950/80 border-2 border-amber-500/60 rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500 text-stone-950 uppercase">
                        Exploring Right Now!
                      </span>
                      <h3 className="text-lg font-black text-amber-300 mt-1">{currentActiveZone.name}</h3>
                      <p className="text-xs text-stone-300">{currentActiveZone.tagline}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-amber-400">
                        {Math.round(progressFraction * 100)}% Complete
                      </div>
                      <div className="text-xs text-stone-400 flex items-center gap-1 justify-end">
                        <Clock className="w-3.5 h-3.5" />
                        {isComplete ? 'Home safe!' : 'Returning soon'}
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-3 bg-stone-800 rounded-full mt-3 overflow-hidden p-0.5 border border-stone-700">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-full transition-all duration-500"
                      style={{ width: `${progressFraction * 100}%` }}
                    />
                  </div>

                  {/* Real-time Checkpoints Map */}
                  <div className="mt-4 pt-3 border-t border-stone-800 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {currentActiveZone.checkpoints.map((cp, idx) => {
                      const reached = progressFraction >= cp.timeFraction;
                      const isCurrent = currentCheckpoint?.name === cp.name;

                      return (
                        <div
                          key={idx}
                          className={`p-2.5 rounded-xl border transition ${
                            isCurrent
                              ? 'bg-amber-950/40 border-amber-400 ring-1 ring-amber-400'
                              : reached
                              ? 'bg-stone-800/80 border-green-600/50'
                              : 'bg-stone-900/50 border-stone-800 opacity-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{cp.icon}</span>
                            <div className="text-xs font-bold text-white truncate">{cp.name}</div>
                          </div>
                          <p className="text-[10px] text-stone-300 mt-1">{cp.blurb}</p>
                          {isCurrent && !isComplete && (
                            <div className="mt-1 text-[9px] font-bold text-amber-400 animate-pulse">
                              📍 Monster is here right now!
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Claim Button */}
                  {isComplete ? (
                    <button
                      onClick={handleClaim}
                      className="w-full mt-4 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-stone-950 font-black rounded-xl text-sm flex items-center justify-center gap-2 animate-bounce shadow-lg cursor-pointer"
                    >
                      <Gift className="w-5 h-5" /> CLAIM SOUVENIR & READ HERMES POSTCARD!
                    </button>
                  ) : (
                    <div className="mt-4 text-center text-xs text-stone-400">
                      Check back later throughout the day as your pet explores Couch Canyon!
                    </div>
                  )}
                </div>
              ) : (
                /* No Active Expedition: Choose a Zone */
                <div className="space-y-3">
                  <div className="text-sm font-bold text-stone-300">
                    Choose an Expedition Zone for your monster:
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {EXPEDITION_ZONES.map((zone) => {
                      const canAfford = profile.adventureFuel >= zone.fuelCost;
                      const isSelected = selectedZone.id === zone.id;

                      return (
                        <div
                          key={zone.id}
                          onClick={() => setSelectedZone(zone)}
                          className={`p-3.5 rounded-2xl border flex flex-col justify-between cursor-pointer transition ${
                            isSelected
                              ? 'bg-amber-950/40 border-amber-400 ring-2 ring-amber-500'
                              : 'bg-stone-850 border-stone-750 hover:border-amber-500/50'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-stone-800 text-stone-300">
                                {zone.difficulty}
                              </span>
                              <span className="text-xs font-bold text-amber-400">
                                ⏱️ {zone.durationMinutes}m
                              </span>
                            </div>
                            <h4 className="text-sm font-black text-white">{zone.name}</h4>
                            <p className="text-xs text-stone-400 mt-1 line-clamp-2">{zone.tagline}</p>
                          </div>

                          <div className="mt-4 pt-2 border-t border-stone-800 flex items-center justify-between text-xs">
                            <span className="text-stone-300 font-bold">Fuel Cost:</span>
                            <span className={`font-black ${canAfford ? 'text-amber-400' : 'text-red-400'}`}>
                              ⚡ {zone.fuelCost}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Launch Bar */}
                  <div className="p-4 bg-stone-950 rounded-2xl border border-stone-800 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-white">Selected: {selectedZone.name}</div>
                      <div className="text-xs text-stone-400">
                        {profile.adventureFuel >= selectedZone.fuelCost
                          ? 'Tank has enough fuel to launch!'
                          : `Need ${selectedZone.fuelCost - profile.adventureFuel}% more fuel from chores.`}
                      </div>
                    </div>
                    <button
                      onClick={() => handleLaunch(selectedZone)}
                      disabled={profile.adventureFuel < selectedZone.fuelCost}
                      className={`px-5 py-2.5 rounded-xl font-black text-sm flex items-center gap-2 transition ${
                        profile.adventureFuel >= selectedZone.fuelCost
                          ? 'bg-amber-500 hover:bg-amber-400 text-stone-950 cursor-pointer shadow-lg'
                          : 'bg-stone-800 text-stone-500 cursor-not-allowed'
                      }`}
                    >
                      <Sparkles className="w-4 h-4" /> LAUNCH EXPEDITION
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Chore Fuel Cells */}
          {activeTab === 'fuel' && (
            <div className="space-y-3">
              <div className="text-xs text-stone-300 bg-stone-800/60 p-3 rounded-xl border border-stone-700">
                Checking off daily chores and morning routines pumps high-octane <strong>Adventure Fuel</strong> directly into your monster's tank! Tap any chore below to complete it and fuel up.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {tasks.length === 0 ? (
                  <div className="col-span-2 text-center py-8 text-stone-400 text-xs">
                    🎉 All caught up on chores! Your creature is well-rested and ready for adventures.
                  </div>
                ) : (
                  tasks.slice(0, 8).map((task) => (
                    <div
                      key={task.id}
                      onClick={() => handleCompleteChore(task.id)}
                      className="p-3 bg-stone-950/70 hover:bg-amber-950/30 border border-stone-800 hover:border-amber-500/50 rounded-xl flex items-center justify-between cursor-pointer transition group"
                      title="Tap to complete chore and pump fuel!"
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-stone-500 group-hover:text-amber-400 transition" />
                        <span className="text-xs font-bold text-white truncate max-w-[180px]">
                          {task.text}
                        </span>
                      </div>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 group-hover:bg-amber-500 group-hover:text-stone-950 transition">
                        ⚡ +25% Fuel
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Postcards & Souvenirs */}
          {activeTab === 'postcards' && (
            <div className="space-y-3">
              {profile.expeditionHistory?.length === 0 ? (
                <div className="text-center py-10 text-stone-400 text-xs">
                  📬 No postcards yet! Send your beast on an expedition to bring back funny stories and souvenirs.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {profile.expeditionHistory?.map((post) => (
                    <div
                      key={post.id}
                      className="bg-stone-950 border border-amber-500/40 rounded-2xl p-4 flex flex-col justify-between shadow-md"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-2xl">{post.souvenirIcon}</span>
                          <span className="text-[10px] text-stone-400">
                            {new Date(post.date).toLocaleDateString()}
                          </span>
                        </div>
                        <h4 className="text-sm font-black text-amber-400">{post.zoneName}</h4>
                        <div className="text-xs font-bold text-white mt-1">
                          Souvenir: {post.souvenirName}
                        </div>
                        <p className="text-xs text-stone-300 mt-2 italic bg-stone-900/80 p-2.5 rounded-xl border border-stone-800">
                          "{post.storyText}"
                        </p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-stone-800 flex items-center justify-between text-xs text-yellow-400 font-bold">
                        <span>Hermes Postcard</span>
                        <span>+ {post.lootCoins} Coins 🪙</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Claimed Reward Celebration Modal */}
        {claimedRewardModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in zoom-in-95">
            <div className="max-w-md w-full bg-stone-900 border-4 border-amber-400 rounded-3xl p-6 text-center text-cream-100 shadow-2xl">
              <span className="text-5xl">{claimedRewardModal.souvenirIcon}</span>
              <h3 className="text-xl font-black text-yellow-400 mt-2">EXPEDITION COMPLETE!</h3>
              <p className="text-xs text-stone-300 mt-1">
                Your beast safely returned from <strong>{claimedRewardModal.zoneName}</strong>!
              </p>

              <div className="bg-stone-950 p-4 rounded-2xl border border-stone-800 my-4 text-xs italic text-stone-200">
                "{claimedRewardModal.storyText}"
                <div className="text-right text-[10px] text-amber-400 font-bold mt-1">— Hermes Copilot</div>
              </div>

              <div className="flex justify-around my-3 py-2 bg-stone-800/80 rounded-xl font-black text-xs text-yellow-400">
                <span>🎁 Souvenir: {claimedRewardModal.souvenirName}</span>
                <span>🪙 +{claimedRewardModal.lootCoins} Coins</span>
                <span>🎡 +1 Prize Spin!</span>
              </div>

              <button
                onClick={() => setClaimedRewardModal(null)}
                className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black rounded-xl text-sm transition"
              >
                SWEET! BACK TO DEN
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
