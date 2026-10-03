import React, { useState, useRef, useEffect } from 'react';
import { X, Sparkles, Trophy } from 'lucide-react';
import {
  CREATURE_ROSTER,
  WARDROBE_CATALOG,
  ROOM_DECOR_CATALOG,
  updateMemberProfile,
  computeFinalRotation,
  type KidMonsterProfile,
} from '@/lib/monsterDenData';
import { monsterAudio } from '@/lib/monsterDenAudio';
import { loadPointsBalance, savePointsBalance } from '@/lib/familyos';

interface GachaWheelModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: KidMonsterProfile;
  onProfileUpdated: (p: KidMonsterProfile) => void;
  spendablePoints: number;
}

interface WheelSlice {
  id: string;
  label: string;
  sub: string;
  color: string;
  textColor: string;
  type: 'creature' | 'coins' | 'wardrobe' | 'room' | 'loot';
  value: string | number;
}

const SLICES: WheelSlice[] = [
  { id: '1', label: 'NEW BEAST!', sub: 'Adopt Monster', color: '#ec4899', textColor: '#ffffff', type: 'creature', value: 'burlap-bob' },
  { id: '2', label: '50 COINS', sub: 'Bear Bucks', color: '#eab308', textColor: '#451a03', type: 'coins', value: 50 },
  { id: '3', label: 'COOL SHADES', sub: 'Pixel Glasses', color: '#3b82f6', textColor: '#ffffff', type: 'wardrobe', value: 'pixel-shades' },
  { id: '4', label: 'LAVA LAMP', sub: 'Den Decor', color: '#a855f7', textColor: '#ffffff', type: 'room', value: 'lava-lamp' },
  { id: '5', label: 'STAR BEAST!', sub: 'Jackalope', color: '#06b6d4', textColor: '#ffffff', type: 'creature', value: 'star-jackalope' },
  { id: '6', label: '25 COINS', sub: 'Bonus Cash', color: '#f59e0b', textColor: '#451a03', type: 'coins', value: 25 },
  { id: '7', label: 'DINO CAPE', sub: 'Monster Drip', color: '#10b981', textColor: '#ffffff', type: 'wardrobe', value: 'dino-cape' },
  { id: '8', label: 'DISCO BALL', sub: 'Den Bling', color: '#f43f5e', textColor: '#ffffff', type: 'room', value: 'disco-ball' },
];

export const GachaWheelModal: React.FC<GachaWheelModalProps> = ({
  isOpen,
  onClose,
  profile,
  onProfileUpdated,
  spendablePoints,
}) => {
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [wonPrize, setWonPrize] = useState<WheelSlice | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  if (!isOpen) return null;

  const freeSpins = profile.spinsAvailable || 0;
  const canAffordPaidSpin = spendablePoints >= 30;
  const canSpin = !spinning && (freeSpins > 0 || canAffordPaidSpin);

  const startSpin = () => {
    if (!canSpin) return;

    // Deduct free spin or points
    let nextSpins = freeSpins;
    if (freeSpins > 0) {
      nextSpins -= 1;
    } else {
      const balance = loadPointsBalance();
      balance[profile.memberId] = Math.max(0, (balance[profile.memberId] || 0) - 30);
      savePointsBalance(balance);
    }

    setSpinning(true);
    setWonPrize(null);

    // Pick winning slice
    const winningIndex = Math.floor(Math.random() * SLICES.length);
    const sliceAngle = 360 / SLICES.length;
    const startRot = rotation;
    const finalRot = computeFinalRotation(startRot, winningIndex, SLICES.length);
    const duration = 3800;
    const startTime = performance.now();
    let lastTickAngle = startRot;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Ease out cubic
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentAngle = startRot + (finalRot - startRot) * easeOut;

      setRotation(currentAngle);

      // Web Audio tick sound whenever we cross slice boundary
      if (Math.abs(currentAngle - lastTickAngle) >= sliceAngle) {
        monsterAudio.playSound('tick');
        lastTickAngle = currentAngle;
      }

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        setSpinning(false);
        const prize = SLICES[winningIndex];
        setWonPrize(prize);
        monsterAudio.playSound('fanfare');

        // Apply reward to profile
        const patch: Partial<KidMonsterProfile> = { spinsAvailable: nextSpins };

        if (prize.type === 'creature') {
          const creatureId = String(prize.value);
          if (!profile.unlockedCreatureIds.includes(creatureId)) {
            patch.unlockedCreatureIds = [...profile.unlockedCreatureIds, creatureId];
          } else {
            // Already owned: give 40 coins compensation
            const balance = loadPointsBalance();
            balance[profile.memberId] = (balance[profile.memberId] || 0) + 40;
            savePointsBalance(balance);
          }
        } else if (prize.type === 'coins') {
          const balance = loadPointsBalance();
          balance[profile.memberId] = (balance[profile.memberId] || 0) + Number(prize.value);
          savePointsBalance(balance);
        } else if (prize.type === 'wardrobe') {
          const itemId = String(prize.value);
          if (!profile.unlockedWardrobeIds.includes(itemId)) {
            patch.unlockedWardrobeIds = [...profile.unlockedWardrobeIds, itemId];
          } else {
            // Duplicate wardrobe compensation
            const balance = loadPointsBalance();
            balance[profile.memberId] = (balance[profile.memberId] || 0) + 20;
            savePointsBalance(balance);
          }
        } else if (prize.type === 'room') {
          const itemId = String(prize.value);
          if (!profile.unlockedRoomItemIds.includes(itemId)) {
            patch.unlockedRoomItemIds = [...profile.unlockedRoomItemIds, itemId];
          } else {
            // Duplicate room item compensation
            const balance = loadPointsBalance();
            balance[profile.memberId] = (balance[profile.memberId] || 0) + 20;
            savePointsBalance(balance);
          }
        }

        const updated = updateMemberProfile(profile.memberId, patch);
        onProfileUpdated(updated);
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-md bg-stone-900 border-4 border-yellow-500 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-cream-100">
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={spinning}
          className="absolute top-4 right-4 p-2 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-white transition disabled:opacity-40"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Title */}
        <div className="text-center mb-4">
          <span className="inline-block px-3 py-1 bg-yellow-500/20 text-yellow-400 font-extrabold text-xs uppercase tracking-wider rounded-full mb-1">
            Carnival Claw & Wheel
          </span>
          <h2 className="text-2xl font-black text-yellow-400 tracking-wide drop-shadow">
            MONSTER PRIZE WHEEL
          </h2>
          <p className="text-xs text-stone-300">
            Spin to adopt weird creatures, unlock fresh drip, or score coins!
          </p>
        </div>

        {/* The Wheel Container */}
        <div className="relative my-2 w-64 h-64 flex items-center justify-center">
          {/* Top Pointer Needle */}
          <div className="absolute -top-3 z-30 flex flex-col items-center">
            <div className="w-6 h-7 bg-yellow-400 border-2 border-stone-900 shadow-md [clip-path:polygon(50%_100%,0%_0%,100%_0%)]" />
          </div>

          {/* Rotating SVG Wheel */}
          <svg
            viewBox="0 0 200 200"
            className="w-full h-full filter drop-shadow-lg"
            style={{ transform: `rotate(${rotation}deg)` }}
          >
            <circle cx="100" cy="100" r="98" fill="#1c1917" stroke="#eab308" strokeWidth="4" />
            {SLICES.map((slice, i) => {
              const count = SLICES.length;
              const angle = 360 / count;
              const startAngle = (i * angle * Math.PI) / 180;
              const endAngle = ((i + 1) * angle * Math.PI) / 180;
              const x1 = 100 + 94 * Math.cos(startAngle);
              const y1 = 100 + 94 * Math.sin(startAngle);
              const x2 = 100 + 94 * Math.cos(endAngle);
              const y2 = 100 + 94 * Math.sin(endAngle);
              const pathData = `M 100 100 L ${x1} ${y1} A 94 94 0 0 1 ${x2} ${y2} Z`;

              // Text rotation
              const midAngleDeg = i * angle + angle / 2;

              return (
                <g key={slice.id}>
                  <path d={pathData} fill={slice.color} stroke="#1c1917" strokeWidth="1.5" />
                  <g transform={`rotate(${midAngleDeg} 100 100)`}>
                    <text
                      x="162"
                      y="103"
                      fill={slice.textColor}
                      fontSize="8"
                      fontWeight="bold"
                      textAnchor="middle"
                      transform={`rotate(90 162 103)`}
                    >
                      {slice.label}
                    </text>
                  </g>
                </g>
              );
            })}
            {/* Center Peg */}
            <circle cx="100" cy="100" r="18" fill="#eab308" stroke="#713f12" strokeWidth="3" />
            <circle cx="100" cy="100" r="7" fill="#ffffff" />
          </svg>
        </div>

        {/* Won Prize Banner */}
        {wonPrize && !spinning && (
          <div className="w-full bg-yellow-500/20 border border-yellow-500 rounded-2xl p-3 my-2 text-center animate-in zoom-in-95">
            <span className="text-xs uppercase font-extrabold text-yellow-400">🎉 YOU WON!</span>
            <div className="text-lg font-black text-white">{wonPrize.label}</div>
            <div className="text-xs text-yellow-200">{wonPrize.sub} added to your inventory!</div>
          </div>
        )}

        {/* Spin Actions */}
        <div className="w-full flex flex-col gap-2 mt-2">
          <button
            onClick={startSpin}
            disabled={!canSpin}
            className={`w-full py-3.5 px-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95 ${
              canSpin
                ? 'bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-stone-950 cursor-pointer animate-pulse'
                : 'bg-stone-800 text-stone-500 cursor-not-allowed border border-stone-700'
            }`}
          >
            <Sparkles className="w-5 h-5" />
            {spinning
              ? 'SPINNING...'
              : freeSpins > 0
              ? `FREE SPIN! (${freeSpins} available)`
              : canAffordPaidSpin
              ? 'SPIN FOR 30 BEAR BUCKS'
              : 'NEED 30 BEAR BUCKS TO SPIN'}
          </button>

          <div className="flex justify-between items-center text-xs text-stone-400 px-2">
            <span>Free Daily Spins: <strong className="text-yellow-400">{freeSpins}</strong></span>
            <span>Your Coins: <strong className="text-yellow-400">{spendablePoints} 🪙</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
};
