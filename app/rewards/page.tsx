'use client';

import { useState } from 'react';
import { Gift, Star, DollarSign, Video, Film, Moon, IceCream, PartyPopper, X, Check } from 'lucide-react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'motion/react';
import { useFamilyMembers } from '@/hooks/use-family';
import { audioSynth, triggerConfetti } from '@/lib/audio';

const REWARDS = [
  { id: 1, title: 'Extra Screen Time (30m)', cost: 50, icon: Video, color: 'bg-purple-100 text-purple-600' },
  { id: 2, title: 'Choose Movie Night', cost: 100, icon: Film, color: 'bg-rose-100 text-rose-600' },
  { id: 3, title: '$5 Allowance Bonus', cost: 200, icon: DollarSign, color: 'bg-green-100 text-green-600' },
  { id: 4, title: 'Stay Up 1hr Late', cost: 150, icon: Moon, color: 'bg-indigo-100 text-indigo-600' },
  { id: 5, title: 'Trip to Ice Cream Shop', cost: 300, icon: IceCream, color: 'bg-orange-100 text-orange-600' },
  { id: 6, title: 'Skip One Chore', cost: 120, icon: PartyPopper, color: 'bg-teal-100 text-teal-600' },
];

export default function RewardsPage() {
  const { users, updatePoints } = useFamilyMembers();
  const childrenFilter = users.filter(u => u.role === 'child');

  const [claimModal, setClaimModal] = useState<{cost: number, title: string} | null>(null);
  const [selectedChild, setSelectedChild] = useState<string>('');
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);

  const handleClaim = (cost: number, title: string) => {
    setClaimModal({ cost, title });
    setSelectedChild('');
    setClaimSuccess(null);
  };

  const confirmClaim = () => {
    if (!claimModal || !selectedChild) return;
    const child = users.find(u => u.id === selectedChild);
    if (!child || child.points < claimModal.cost) return;

    updatePoints(child.id, -claimModal.cost);
    setClaimSuccess(child.name);
    audioSynth.playLevelUp();
    triggerConfetti();
  };

  const closeModal = () => {
    setClaimModal(null);
    setSelectedChild('');
    setClaimSuccess(null);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8 xl:p-12">
      <div className="max-w-5xl mx-auto space-y-8">
        <header>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-100 text-amber-600 rounded-xl">
              <Gift className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-display text-4xl font-semibold tracking-tight text-slate-900">Reward Store</h1>
              <p className="text-slate-500 mt-1">Earn points by completing tasks and redeem them here.</p>
            </div>
          </div>
        </header>

        {/* Kids Point Balances */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {childrenFilter.map(child => (
            <div key={child.id} className="bg-white p-6 rounded-3xl border border-slate-200/60 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-4">
                {child.avatarUrl ? (
                  <Image 
                    src={child.avatarUrl} 
                    alt={child.name} 
                    width={56}
                    height={56}
                    className="w-14 h-14 rounded-full object-cover shadow-[0_4px_12px_rgba(0,0,0,0.1)] border-2 border-white hover:scale-110 transition-transform" 
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className={`w-12 h-12 rounded-full ${child.color} flex items-center justify-center text-white font-bold text-xl shadow-inner`}>
                    {child.name[0]}
                  </div>
                )}
                <div>
                  <h3 className="font-display font-medium text-lg text-slate-900">{child.name}&apos;s Points</h3>
                  <div className="flex items-center gap-1.5 mt-1 text-amber-500 font-semibold">
                    <Star className="w-4 h-4 fill-current" />
                    <span>{child.points} pts available</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* Store Catalog */}
        <section>
          <h2 className="font-display text-2xl font-semibold mb-6 text-slate-800">Catalog</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {REWARDS.map(reward => (
              <button 
                key={reward.id}
                onClick={() => handleClaim(reward.cost, reward.title)}
                className="group p-6 bg-white rounded-3xl border border-slate-200/60 shadow-sm hover:border-slate-300 transition-all text-left flex flex-col items-start gap-4 active:scale-95"
              >
                <div className={`p-4 rounded-2xl ${reward.color}`}>
                  <reward.icon className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="font-medium text-lg text-slate-900 group-hover:text-blue-600 transition-colors">{reward.title}</h3>
                  <div className="flex items-center gap-1.5 mt-2 px-3 py-1 bg-slate-100 text-slate-700 rounded-full w-max text-sm font-medium">
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                    {reward.cost} pts
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Claim Modal */}
      <AnimatePresence>
        {claimModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
            onClick={closeModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="bg-white rounded-2xl border-4 border-slate-900 shadow-[8px_8px_0_#1e293b] w-full max-w-md overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b-4 border-slate-900 bg-[#facc15]">
                <h2 className="font-display font-black text-lg uppercase tracking-wider text-slate-900">
                  {claimSuccess ? 'Claimed!' : 'Claim Reward'}
                </h2>
                <button
                  onClick={closeModal}
                  className="p-1.5 rounded-xl border-2 border-slate-900 bg-white hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5 text-slate-900" />
                </button>
              </div>

              <div className="p-5 space-y-5">
                {claimSuccess ? (
                  /* Success State */
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center py-4 space-y-4"
                  >
                    <div className="mx-auto w-16 h-16 rounded-full bg-[#ccff00] border-4 border-slate-900 flex items-center justify-center shadow-[4px_4px_0_#1e293b]">
                      <Check className="w-8 h-8 text-slate-900" strokeWidth={3} />
                    </div>
                    <div>
                      <p className="font-display font-black text-xl text-slate-900 uppercase tracking-wider">
                        Nice one!
                      </p>
                      <p className="text-slate-600 mt-1">
                        <span className="font-semibold">{claimModal.title}</span> claimed for{' '}
                        <span className="font-semibold">{claimSuccess}</span>!
                      </p>
                    </div>
                    <button
                      onClick={closeModal}
                      className="mt-2 px-6 py-3 rounded-2xl border-4 border-slate-900 bg-[#ccff00] font-display font-black uppercase tracking-wider text-sm text-slate-900 shadow-[4px_4px_0_#1e293b] hover:shadow-[2px_2px_0_#1e293b] hover:translate-x-[2px] hover:translate-y-[2px] transition-all active:shadow-none active:translate-x-[4px] active:translate-y-[4px]"
                    >
                      Done
                    </button>
                  </motion.div>
                ) : (
                  /* Selection State */
                  <>
                    {/* Reward being claimed */}
                    <div className="px-4 py-3 rounded-xl bg-slate-100 border-2 border-slate-200">
                      <p className="text-sm text-slate-500 font-medium">Redeeming</p>
                      <p className="font-display font-semibold text-slate-900">{claimModal.title}</p>
                      <div className="flex items-center gap-1.5 mt-1 text-amber-500 font-semibold text-sm">
                        <Star className="w-3.5 h-3.5 fill-current" />
                        <span>{claimModal.cost} pts</span>
                      </div>
                    </div>

                    {/* Child selection */}
                    <div>
                      <p className="font-display font-black text-sm uppercase tracking-wider text-slate-700 mb-3">
                        Who&apos;s claiming?
                      </p>
                      <div className="space-y-2">
                        {childrenFilter.map(child => {
                          const hasEnough = child.points >= claimModal.cost;
                          const isSelected = selectedChild === child.id;
                          return (
                            <button
                              key={child.id}
                              onClick={() => hasEnough && setSelectedChild(child.id)}
                              disabled={!hasEnough}
                              className={`w-full flex items-center gap-3 p-3 rounded-2xl border-4 transition-all text-left ${
                                isSelected
                                  ? 'border-slate-900 bg-[#ccff00] shadow-[4px_4px_0_#1e293b]'
                                  : hasEnough
                                  ? 'border-slate-200 bg-white hover:border-slate-400 hover:shadow-sm'
                                  : 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                              }`}
                            >
                              {child.avatarUrl ? (
                                <Image
                                  src={child.avatarUrl}
                                  alt={child.name}
                                  width={44}
                                  height={44}
                                  className="w-11 h-11 rounded-full object-cover border-2 border-white shadow-sm"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className={`w-11 h-11 rounded-full ${child.color} flex items-center justify-center text-white font-bold text-lg shadow-inner`}>
                                  {child.name[0]}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-display font-semibold text-slate-900">{child.name}</p>
                                <div className="flex items-center gap-1.5 text-sm">
                                  <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                                  <span className={hasEnough ? 'text-slate-600' : 'text-red-500 font-medium'}>
                                    {child.points} pts {!hasEnough && '(not enough)'}
                                  </span>
                                </div>
                              </div>
                              {isSelected && (
                                <div className="w-7 h-7 rounded-full bg-slate-900 flex items-center justify-center">
                                  <Check className="w-4 h-4 text-[#ccff00]" strokeWidth={3} />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-3 pt-1">
                      <button
                        onClick={closeModal}
                        className="flex-1 px-4 py-3 rounded-2xl border-4 border-slate-900 bg-white font-display font-black uppercase tracking-wider text-sm text-slate-900 shadow-[4px_4px_0_#1e293b] hover:shadow-[2px_2px_0_#1e293b] hover:translate-x-[2px] hover:translate-y-[2px] transition-all active:shadow-none active:translate-x-[4px] active:translate-y-[4px]"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={confirmClaim}
                        disabled={!selectedChild}
                        className={`flex-1 px-4 py-3 rounded-2xl border-4 border-slate-900 font-display font-black uppercase tracking-wider text-sm transition-all ${
                          selectedChild
                            ? 'bg-[#ccff00] text-slate-900 shadow-[4px_4px_0_#1e293b] hover:shadow-[2px_2px_0_#1e293b] hover:translate-x-[2px] hover:translate-y-[2px] active:shadow-none active:translate-x-[4px] active:translate-y-[4px]'
                            : 'bg-slate-200 text-slate-400 shadow-[4px_4px_0_#94a3b8] cursor-not-allowed'
                        }`}
                      >
                        Confirm
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
