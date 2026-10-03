import React, { useState, useEffect } from 'react';
import {
  Utensils,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  X,
  Award,
} from 'lucide-react';
import {
  type KidMonsterProfile,
  CREATURE_ROSTER,
  MONSTER_SNACKS,
  type MonsterSnack,
  loadFamilyPets,
  loadPetFeedings,
  recordPetFeeding,
  getPetFeedingStatus,
  feedMonster,
  getProfileForMember,
  defaultMealForPet,
  type FamilyPet,
  type PetFeedingLog,
} from '@/lib/monsterDenData';
import { CreatureRenderer } from './CreatureRenderer';
import { monsterAudio } from '@/lib/monsterDenAudio';
import { useAppContext } from '@/contexts/AppContext';

interface PetFeedingModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: KidMonsterProfile;
  onProfileUpdated: (updated: KidMonsterProfile) => void;
}

export const PetFeedingModal: React.FC<PetFeedingModalProps> = ({
  isOpen,
  onClose,
  profile,
  onProfileUpdated,
}) => {
  const { currentUser, currentRole, householdMembers } = useAppContext();
  const currentCreature =
    CREATURE_ROSTER.find((c) => c.id === profile.activeCreatureId) || CREATURE_ROSTER[0];

  const [activeTab, setActiveTab] = useState<'family' | 'monster'>('family');
  const [pets, setPets] = useState<FamilyPet[]>(loadFamilyPets);
  const [feedings, setFeedings] = useState<PetFeedingLog[]>(loadPetFeedings);
  const [selectedMeal, setSelectedMeal] = useState<Record<string, 'breakfast' | 'dinner'>>({});
  const [notice, setNotice] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPets(loadFamilyPets());
      setFeedings(loadPetFeedings());
      setNotice(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentMember = householdMembers.find((m) => m.id === profile.memberId);
  const memberName = currentMember?.name || (currentRole === 'child' ? currentUser?.name : 'Kid') || 'Kid';

  const handleFeedFamilyPet = (pet: FamilyPet) => {
    const meal = selectedMeal[pet.id] || defaultMealForPet(pet);

    if (!pet.feedTimes.includes(meal as 'breakfast' | 'dinner')) {
      monsterAudio.playSound('squeak');
      setNotice({
        text: `${pet.name} only eats ${pet.feedTimes.join(' and ')}! 🐾`,
        isError: true,
      });
      return;
    }

    const result = recordPetFeeding(pet.id, profile.memberId, memberName, meal);

    if (!result.success) {
      monsterAudio.playSound('burp');
      setNotice({
        text: result.reason || `${pet.name} was already fed!`,
        isError: true,
      });
      return;
    }

    monsterAudio.playSound('fanfare');
    setFeedings(loadPetFeedings());
    setNotice({
      text: `🎉 Good job! You fed ${pet.name} ${meal}! Earned +${result.fuelAwarded} Adventure Fuel & +${result.pointsAwarded} Bear Bucks!`,
      isError: false,
    });

    const updated = getProfileForMember(profile.memberId);
    onProfileUpdated(updated);
  };

  const handleFeedMonsterSnack = (snack: MonsterSnack) => {
    monsterAudio.playSound('burp');
    feedMonster(profile.memberId, snack.name);
    setNotice({
      text: `Nom nom! ${currentCreature.name} crunched on a ${snack.name}! (+${snack.hungerBoost}% Belly, +${snack.happinessBoost}% Happy)`,
      isError: false,
    });
    const updated = getProfileForMember(profile.memberId);
    onProfileUpdated(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-xl bg-stone-900 border-4 border-amber-600/70 rounded-3xl p-5 shadow-2xl flex flex-col max-h-[92vh] overflow-y-auto text-cream-100">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-800">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-2xl bg-amber-500/20 text-amber-400">
              <Utensils className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-black text-amber-400 uppercase tracking-wide">
                PET FEEDING STATION
              </h3>
              <p className="text-[11px] text-stone-400">
                Track family pet meals & feed your virtual monster treats!
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

        {/* Tab Switcher */}
        <div className="flex gap-2 my-3 bg-stone-950 p-1.5 rounded-2xl border border-stone-800">
          <button
            onClick={() => {
              setActiveTab('family');
              setNotice(null);
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 ${
              activeTab === 'family'
                ? 'bg-amber-500 text-stone-950 shadow'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            <span>🐶</span> Real Family Pets ("Who Fed the Dog?")
          </button>
          <button
            onClick={() => {
              setActiveTab('monster');
              setNotice(null);
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 ${
              activeTab === 'monster'
                ? 'bg-purple-600 text-white shadow'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            <span>👹</span> Feed {currentCreature.name}
          </button>
        </div>

        {/* Status Notice Banner */}
        {notice && (
          <div
            className={`mb-3 p-3 rounded-2xl text-xs flex items-center gap-2 animate-in fade-in ${
              notice.isError
                ? 'bg-red-950/80 border border-red-700/70 text-red-200'
                : 'bg-emerald-950/80 border border-emerald-700/70 text-emerald-200'
            }`}
          >
            {notice.isError ? (
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            )}
            <span>{notice.text}</span>
          </div>
        )}

        {/* Tab 1: Real Family Pets */}
        {activeTab === 'family' && (
          <div className="space-y-3">
            <div className="p-3 bg-stone-950/70 border border-stone-800 rounded-2xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                <span className="text-stone-300">
                  Feeding family pets charges <strong>+20 Habit Fuel</strong> & earns <strong>10 Bear Bucks</strong>!
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {pets.map((pet) => {
                const status = getPetFeedingStatus(pet.id);
                const meal = selectedMeal[pet.id] || defaultMealForPet(pet);

                return (
                  <div
                    key={pet.id}
                    className="p-3.5 bg-stone-950/90 border border-stone-800 hover:border-amber-600/40 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-3xl p-2 bg-stone-900 rounded-2xl border border-stone-800">
                        {pet.avatar}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-black text-amber-400">{pet.name}</h4>
                          <span className="text-[10px] text-stone-500 uppercase font-bold">
                            ({pet.species})
                          </span>
                        </div>
                        <div className="text-[11px] text-stone-400 flex items-center gap-1.5 mt-0.5">
                          <Clock className="w-3 h-3 text-stone-500" />
                          {status.todayFeeding ? (
                            <span>
                              Fed {status.todayFeeding.mealType} today by{' '}
                              <strong className="text-amber-300">
                                {status.todayFeeding.fedByName}
                              </strong>{' '}
                              ({new Date(status.todayFeeding.timestamp).toLocaleTimeString([], {
                                hour: 'numeric',
                                minute: '2-digit',
                              })})
                            </span>
                          ) : (
                            <span className="text-stone-500">
                              Not fed yet today {status.lastFeeding ? `(last: ${status.lastFeeding.mealType})` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <div className="flex bg-stone-900 p-1 rounded-xl border border-stone-800 text-[10px] font-bold">
                        {pet.feedTimes.map((time) => (
                          <button
                            key={time}
                            onClick={() =>
                              setSelectedMeal((prev) => ({ ...prev, [pet.id]: time }))
                            }
                            className={`px-2 py-1 rounded-lg capitalize ${
                              meal === time
                                ? 'bg-amber-500 text-stone-950'
                                : 'text-stone-400 hover:text-white'
                            }`}
                          >
                            {time}
                          </button>
                        ))}
                      </div>

                      <button
                        onClick={() => handleFeedFamilyPet(pet)}
                        className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-stone-950 font-black rounded-xl text-xs shadow active:scale-95 transition"
                      >
                        I Fed {pet.name}! 🥣
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 2: Virtual Monster Snacks */}
        {activeTab === 'monster' && (
          <div className="space-y-4">
            {/* Monster Belly Meter */}
            <div className="p-3.5 bg-stone-950/80 border border-purple-900/60 rounded-2xl flex items-center justify-between gap-4 shadow">
              <div className="flex items-center gap-3">
                <CreatureRenderer creature={currentCreature} profile={profile} size={70} interactive={false} />
                <div>
                  <h4 className="text-xs font-black text-purple-300">
                    {currentCreature.name}'s Belly
                  </h4>
                  <div className="w-40 sm:w-56 h-3 bg-stone-800 rounded-full mt-1.5 overflow-hidden p-0.5 border border-stone-700">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500"
                      style={{ width: `${profile.hunger ?? 80}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-black text-pink-400">{profile.hunger ?? 80}% Full</span>
                <p className="text-[10px] text-stone-400">Happy: {profile.happiness ?? 90}%</p>
              </div>
            </div>

            {/* Snack Treat Shelf */}
            <div>
              <h4 className="text-xs font-black text-stone-300 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Monster Snack Shelf
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {MONSTER_SNACKS.map((snack) => (
                  <div
                    key={snack.id}
                    className="p-3 bg-stone-950/80 border border-stone-800 hover:border-purple-600/50 rounded-2xl flex items-center justify-between gap-3 shadow transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl p-1.5 bg-stone-900 rounded-xl border border-stone-800">
                        {snack.icon}
                      </span>
                      <div>
                        <div className="text-xs font-bold text-cream-100">{snack.name}</div>
                        <div className="text-[10px] text-stone-400">{snack.blurb}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleFeedMonsterSnack(snack)}
                      className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl shadow active:scale-95 transition"
                    >
                      Feed 🍪
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
