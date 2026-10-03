import React, { useState } from 'react';
import { X, Check, Lock, Sparkles, Shirt } from 'lucide-react';
import {
  WARDROBE_CATALOG,
  CREATURE_ROSTER,
  updateMemberProfile,
  type WardrobeItem,
  type KidMonsterProfile,
} from '@/lib/monsterDenData';
import { CreatureRenderer } from './CreatureRenderer';
import { monsterAudio } from '@/lib/monsterDenAudio';
import { loadPointsBalance, savePointsBalance } from '@/lib/familyos';

interface WardrobeModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: KidMonsterProfile;
  onProfileUpdated: (p: KidMonsterProfile) => void;
  spendablePoints: number;
}

export const WardrobeModal: React.FC<WardrobeModalProps> = ({
  isOpen,
  onClose,
  profile,
  onProfileUpdated,
  spendablePoints,
}) => {
  const [activeTab, setActiveTab] = useState<'creatures' | 'head' | 'eyes' | 'neck' | 'feet'>('creatures');

  if (!isOpen) return null;

  const currentCreature =
    CREATURE_ROSTER.find((c) => c.id === profile.activeCreatureId) || CREATURE_ROSTER[0];

  const handleSelectCreature = (creatureId: string) => {
    if (!profile.unlockedCreatureIds.includes(creatureId)) return;
    const updated = updateMemberProfile(profile.memberId, { activeCreatureId: creatureId });
    onProfileUpdated(updated);
    monsterAudio.playSound('squeak');
  };

  const handleToggleItem = (item: WardrobeItem) => {
    const isUnlocked = profile.unlockedWardrobeIds.includes(item.id);

    if (!isUnlocked) {
      // Attempt buy
      if (spendablePoints < item.cost) {
        monsterAudio.playSound('burp');
        return;
      }
      const balance = loadPointsBalance();
      balance[profile.memberId] = Math.max(0, (balance[profile.memberId] || 0) - item.cost);
      savePointsBalance(balance);

      const nextUnlocked = [...profile.unlockedWardrobeIds, item.id];
      const nextEquipped = { ...profile.equippedWardrobe, [item.slot]: item.id };
      const updated = updateMemberProfile(profile.memberId, {
        unlockedWardrobeIds: nextUnlocked,
        equippedWardrobe: nextEquipped,
      });
      onProfileUpdated(updated);
      monsterAudio.playSound('coin');
      return;
    }

    // Toggle equip
    const currentEquippedInSlot = profile.equippedWardrobe[item.slot];
    const isCurrentlyEquipped = currentEquippedInSlot === item.id;
    const nextEquipped = { ...profile.equippedWardrobe };

    if (isCurrentlyEquipped) {
      delete nextEquipped[item.slot];
    } else {
      nextEquipped[item.slot] = item.id;
    }

    const updated = updateMemberProfile(profile.memberId, { equippedWardrobe: nextEquipped });
    onProfileUpdated(updated);
    monsterAudio.playSound('squeak');
  };

  const filteredWardrobe = WARDROBE_CATALOG.filter((i) => i.slot === activeTab);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-2xl bg-stone-900 border-4 border-purple-500 rounded-3xl p-5 shadow-2xl flex flex-col max-h-[90vh] text-cream-100">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-800">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-purple-500/20 text-purple-400">
              <Shirt className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-xl font-black text-white">WARDROBE & MONSTER CLOSET</h2>
              <p className="text-xs text-stone-400">Customize your beast and gear up with earned coins!</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-3 py-1 bg-yellow-500/20 border border-yellow-500/50 rounded-full text-xs font-black text-yellow-400">
              🪙 {spendablePoints} Coins
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body: Left Preview, Right Grid */}
        <div className="flex flex-col md:flex-row gap-5 my-4 overflow-y-auto">
          {/* Live Preview Stage */}
          <div className="flex flex-col items-center justify-center p-4 bg-stone-950/70 border border-stone-800 rounded-2xl min-w-[220px]">
            <CreatureRenderer creature={currentCreature} profile={profile} size={180} />
            <div className="text-center mt-2">
              <span className="text-sm font-black text-purple-300">{currentCreature.name}</span>
              <p className="text-[11px] text-stone-400 line-clamp-2 max-w-[200px]">{currentCreature.title}</p>
            </div>
          </div>

          {/* Catalog & Tabs */}
          <div className="flex-1 flex flex-col">
            {/* Slot Tabs */}
            <div className="flex gap-1 overflow-x-auto pb-2 border-b border-stone-800 text-xs font-bold">
              <button
                onClick={() => setActiveTab('creatures')}
                className={`px-3 py-1.5 rounded-xl transition ${
                  activeTab === 'creatures' ? 'bg-purple-600 text-white' : 'bg-stone-800 text-stone-400 hover:text-white'
                }`}
              >
                🐾 Beasts
              </button>
              <button
                onClick={() => setActiveTab('head')}
                className={`px-3 py-1.5 rounded-xl transition ${
                  activeTab === 'head' ? 'bg-purple-600 text-white' : 'bg-stone-800 text-stone-400 hover:text-white'
                }`}
              >
                🎩 Hats
              </button>
              <button
                onClick={() => setActiveTab('eyes')}
                className={`px-3 py-1.5 rounded-xl transition ${
                  activeTab === 'eyes' ? 'bg-purple-600 text-white' : 'bg-stone-800 text-stone-400 hover:text-white'
                }`}
              >
                🕶️ Glasses
              </button>
              <button
                onClick={() => setActiveTab('neck')}
                className={`px-3 py-1.5 rounded-xl transition ${
                  activeTab === 'neck' ? 'bg-purple-600 text-white' : 'bg-stone-800 text-stone-400 hover:text-white'
                }`}
              >
                🧣 Neck
              </button>
              <button
                onClick={() => setActiveTab('feet')}
                className={`px-3 py-1.5 rounded-xl transition ${
                  activeTab === 'feet' ? 'bg-purple-600 text-white' : 'bg-stone-800 text-stone-400 hover:text-white'
                }`}
              >
                👟 Shoes
              </button>
            </div>

            {/* Beast Selector Tab */}
            {activeTab === 'creatures' && (
              <div className="grid grid-cols-2 gap-2 mt-3 overflow-y-auto max-h-[300px] p-1">
                {CREATURE_ROSTER.map((c) => {
                  const unlocked = profile.unlockedCreatureIds.includes(c.id);
                  const isActive = profile.activeCreatureId === c.id;

                  return (
                    <button
                      key={c.id}
                      onClick={() => handleSelectCreature(c.id)}
                      disabled={!unlocked}
                      className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition relative ${
                        isActive
                          ? 'border-purple-400 bg-purple-950/60 ring-2 ring-purple-500'
                          : unlocked
                          ? 'border-stone-700 bg-stone-800/80 hover:border-purple-500/50'
                          : 'border-stone-800 bg-stone-900/50 opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-lg bg-stone-900 flex items-center justify-center text-lg">
                        {c.clan === 'fuggler' ? '👹' : '✨'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-black text-white truncate">{c.name}</div>
                        <div className="text-[10px] text-stone-400 capitalize">{c.clan}</div>
                      </div>
                      {isActive ? (
                        <Check className="w-4 h-4 text-purple-400" />
                      ) : !unlocked ? (
                        <Lock className="w-4 h-4 text-stone-500" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Clothing Slots Tab */}
            {activeTab !== 'creatures' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 overflow-y-auto max-h-[300px] p-1">
                {filteredWardrobe.map((item) => {
                  const unlocked = profile.unlockedWardrobeIds.includes(item.id);
                  const isEquipped = profile.equippedWardrobe[item.slot] === item.id;
                  const canAfford = spendablePoints >= item.cost;

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleToggleItem(item)}
                      className={`p-2.5 rounded-xl border flex flex-col justify-between transition cursor-pointer relative ${
                        isEquipped
                          ? 'border-green-400 bg-green-950/40 ring-2 ring-green-500'
                          : unlocked
                          ? 'border-stone-700 bg-stone-800 hover:border-purple-400'
                          : canAfford
                          ? 'border-amber-600/60 bg-amber-950/30 hover:border-amber-400'
                          : 'border-stone-800 bg-stone-900/60 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-2xl">{item.icon}</span>
                        {isEquipped && <Check className="w-4 h-4 text-green-400" />}
                        {!unlocked && <Lock className="w-3.5 h-3.5 text-amber-400" />}
                      </div>

                      <div className="mt-2">
                        <div className="text-xs font-bold text-white line-clamp-1">{item.name}</div>
                        <div className="text-[10px] text-stone-400">{item.description}</div>
                      </div>

                      <div className="mt-2 pt-1 border-t border-stone-800/80 flex items-center justify-between text-[11px]">
                        {unlocked ? (
                          <span className="text-purple-400 font-bold">
                            {isEquipped ? 'Equipped' : 'Owned'}
                          </span>
                        ) : (
                          <span className="text-yellow-400 font-extrabold flex items-center gap-1">
                            🪙 {item.cost}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
