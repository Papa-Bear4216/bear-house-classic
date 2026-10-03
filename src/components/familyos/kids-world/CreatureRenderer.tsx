import React, { useState } from 'react';
import { CREATURE_ROSTER, type CreatureSpec, type KidMonsterProfile } from '@/lib/monsterDenData';
import { monsterAudio } from '@/lib/monsterDenAudio';

interface CreatureRendererProps {
  creature?: CreatureSpec;
  profile?: KidMonsterProfile;
  size?: number; // width/height in px, default 260
  interactive?: boolean;
  onPet?: () => void;
  showSleeping?: boolean;
}

export const CreatureRenderer: React.FC<CreatureRendererProps> = ({
  creature = CREATURE_ROSTER[0],
  profile,
  size = 260,
  interactive = true,
  onPet,
  showSleeping = false,
}) => {
  const [squish, setSquish] = useState(false);
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);

  const isSleepy = showSleeping || (profile && profile.hunger < 25);
  const equipped = profile?.equippedWardrobe || {};
  const uid = React.useId().replace(/:/g, '_');
  const burlapId = `burlap_${uid}`;
  const feltId = `felt_${uid}`;
  const nebulaId = `nebula_${uid}`;

  const handlePointerDown = () => {
    if (!interactive) return;
    setSquish(true);
    monsterAudio.playSound('squeak');

    // Spawn floating heart
    const newHeart = { id: Date.now() + Math.random(), x: 45 + Math.random() * 20, y: 30 };
    setHearts((prev) => [...prev.slice(-3), newHeart]);
    setTimeout(() => {
      setHearts((prev) => prev.filter((h) => h.id !== newHeart.id));
    }, 1200);

    if (onPet) onPet();
    setTimeout(() => setSquish(false), 250);
  };

  return (
    <div
      className={`relative select-none flex items-center justify-center ${interactive ? 'cursor-pointer' : ''}`}
      style={{ width: size, height: size }}
      onClick={handlePointerDown}
      title={interactive ? `Pet ${creature.name}!` : creature.name}
    >
      {/* Floating Hearts / Stars animation on pet */}
      {hearts.map((h) => (
        <span
          key={h.id}
          className="absolute text-xl pointer-events-none animate-bounce transition-all duration-1000 z-40 text-pink-400 font-bold"
          style={{ left: `${h.x}%`, top: `${h.y}%`, opacity: 0.9 }}
        >
          💖
        </span>
      ))}

      {/* Sleep Zzz Bubbles */}
      {isSleepy && (
        <div className="absolute top-2 right-4 text-purple-300 font-bold text-sm z-30 animate-pulse">
          💤 Zzz...
        </div>
      )}

      <svg
        viewBox="0 0 200 200"
        className={`w-full h-full transition-transform duration-200 filter drop-shadow-md ${
          squish ? 'scale-90 rotate-2' : 'hover:scale-105'
        }`}
      >
        <defs>
          {/* Burlap Weave Pattern */}
          <pattern id={burlapId} width="6" height="6" patternUnits="userSpaceOnUse">
            <line x1="0" y1="3" x2="6" y2="3" stroke="#000000" strokeWidth="0.8" opacity="0.18" />
            <line x1="3" y1="0" x2="3" y2="6" stroke="#ffffff" strokeWidth="0.8" opacity="0.15" />
          </pattern>

          {/* Felt Fiber Pattern */}
          <pattern id={feltId} width="4" height="4" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.8" fill="#000000" opacity="0.12" />
          </pattern>

          {/* Cosmic Nebula Glow */}
          <radialGradient id={nebulaId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#c084fc" stopOpacity="0.8" />
            <stop offset="60%" stopColor="#3b82f6" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#1e1b4b" stopOpacity="0.9" />
          </radialGradient>
        </defs>

        {/* ---------------- WINGS / HORNS (BACKGROUND LAYER) ---------------- */}
        {creature.specialTrait === 'wings' && (
          <g className="animate-pulse">
            <path d="M 40 85 C 5 60 10 30 35 45 C 45 52 48 70 50 85 Z" fill="#6b21a8" opacity="0.8" stroke="#3b0764" strokeWidth="2" />
            <path d="M 160 85 C 195 60 190 30 165 45 C 155 52 152 70 150 85 Z" fill="#6b21a8" opacity="0.8" stroke="#3b0764" strokeWidth="2" />
          </g>
        )}

        {creature.ears === 'bunny-antlers' && (
          <g>
            <path d="M 65 50 Q 55 10 40 18 Q 50 32 60 48" fill="none" stroke="#60a5fa" strokeWidth="5" strokeLinecap="round" />
            <path d="M 135 50 Q 145 10 160 18 Q 150 32 140 48" fill="none" stroke="#60a5fa" strokeWidth="5" strokeLinecap="round" />
          </g>
        )}

        {creature.ears === 'goblin' && (
          <g>
            <polygon points="50,75 10,60 45,95" fill={creature.baseColor} stroke="#27272a" strokeWidth="2" />
            <polygon points="150,75 190,60 155,95" fill={creature.baseColor} stroke="#27272a" strokeWidth="2" />
          </g>
        )}

        {creature.ears === 'mismatched-flop' && (
          <g>
            <ellipse cx="45" cy="65" rx="14" ry="22" fill={creature.baseColor} stroke="#27272a" strokeWidth="2" transform="rotate(-20 45 65)" />
            <ellipse cx="155" cy="72" rx="12" ry="18" fill={creature.baseColor} stroke="#27272a" strokeWidth="2" transform="rotate(35 155 72)" />
          </g>
        )}

        {creature.ears === 'bear' && (
          <g>
            <circle cx="50" cy="55" r="16" fill={creature.baseColor} stroke="#27272a" strokeWidth="2" />
            <circle cx="50" cy="55" r="8" fill={creature.bellyColor} />
            <circle cx="150" cy="55" r="16" fill={creature.baseColor} stroke="#27272a" strokeWidth="2" />
            <circle cx="150" cy="55" r="8" fill={creature.bellyColor} />
          </g>
        )}

        {creature.specialTrait === 'nebula-horn' && (
          <polygon points="100,10 90,45 110,45" fill={`url(#${nebulaId})`} stroke="#93c5fd" strokeWidth="2" />
        )}

        {/* ---------------- BODY & BELLY ---------------- */}
        <g>
          {/* Main Round/Potato Fuggler Body */}
          <path
            d="M 50 100 C 45 45 155 45 150 100 C 155 160 145 175 100 175 C 55 175 45 160 50 100 Z"
            fill={creature.texture === 'nebula' ? `url(#${nebulaId})` : creature.baseColor}
            stroke="#1c1917"
            strokeWidth="3.5"
          />

          {/* Texture Overlay */}
          {creature.texture === 'burlap' && (
            <path
              d="M 50 100 C 45 45 155 45 150 100 C 155 160 145 175 100 175 C 55 175 45 160 50 100 Z"
              fill={`url(#${burlapId})`}
            />
          )}
          {creature.texture === 'felt' && (
            <path
              d="M 50 100 C 45 45 155 45 150 100 C 155 160 145 175 100 175 C 55 175 45 160 50 100 Z"
              fill={`url(#${feltId})`}
            />
          )}

          {/* Stitches Details for Fugglers */}
          {creature.specialTrait === 'stitches' && (
            <g stroke="#18181b" strokeWidth="2" strokeLinecap="round">
              <line x1="60" y1="70" x2="80" y2="85" />
              <line x1="65" y1="73" x2="63" y2="82" />
              <line x1="72" y1="78" x2="70" y2="87" />
              <line x1="78" y1="83" x2="76" y2="92" />
            </g>
          )}

          {/* Belly Patch */}
          <ellipse cx="100" cy="132" rx="35" ry="28" fill={creature.bellyColor} opacity="0.85" />
        </g>

        {/* ---------------- ARMS & FEET ---------------- */}
        <g fill={creature.baseColor} stroke="#1c1917" strokeWidth="3">
          {/* Left Foot */}
          <ellipse cx="70" cy="172" rx="14" ry="10" />
          {/* Right Foot */}
          <ellipse cx="130" cy="172" rx="14" ry="10" />
          {/* Left Arm */}
          <path d="M 48 115 C 30 125 35 145 48 138 Z" />
          {/* Right Arm */}
          <path d="M 152 115 C 170 125 165 145 152 138 Z" />
        </g>

        {/* ---------------- GOOFY HUMAN-LIKE FUGGLER TEETH & MOUTH ---------------- */}
        <g id="mouthAndTeeth">
          {/* Open Quirky Mouth Cavity */}
          <ellipse cx="100" cy="112" rx="32" ry="16" fill="#3f1618" stroke="#1c1917" strokeWidth="2.5" />
          {/* Tongue */}
          <ellipse cx="100" cy="122" rx="14" ry="7" fill="#f43f5e" />

          {/* Teeth Varieties */}
          {creature.teeth === 'human-chompers' && (
            <g fill="#fef9c3" stroke="#713f12" strokeWidth="1">
              {/* Upper Pearly Human Teeth */}
              <rect x="76" y="99" width="7" height="9" rx="2" />
              <rect x="84" y="99" width="7.5" height="10" rx="2" />
              <rect x="92.5" y="99" width="8" height="10.5" rx="2" />
              <rect x="101.5" y="99" width="7.5" height="10" rx="2" />
              <rect x="110" y="99" width="7" height="9" rx="2" />
              {/* Lower Teeth */}
              <rect x="80" y="117" width="6.5" height="8" rx="2" />
              <rect x="87.5" y="118" width="7" height="8.5" rx="2" />
              <rect x="95.5" y="118" width="7" height="8.5" rx="2" />
              <rect x="103.5" y="117" width="6.5" height="8" rx="2" />
            </g>
          )}

          {creature.teeth === 'gap' && (
            <g fill="#fef9c3" stroke="#713f12" strokeWidth="1">
              {/* Gap Tooth Goofiness */}
              <rect x="78" y="100" width="8" height="9" rx="2" />
              {/* Big gap in middle */}
              <rect x="108" y="100" width="8" height="9" rx="2" />
              <rect x="92" y="118" width="7" height="8" rx="2" />
            </g>
          )}

          {creature.teeth === 'crooked-fangs' && (
            <g fill="#fef08a" stroke="#451a03" strokeWidth="1">
              <polygon points="80,100 86,100 83,114" />
              <rect x="89" y="100" width="7" height="8" rx="2" />
              <polygon points="112,100 118,100 115,114" />
            </g>
          )}

          {creature.teeth === 'buck' && (
            <g fill="#ffffff" stroke="#713f12" strokeWidth="1">
              {/* Bunny Buck Teeth */}
              <rect x="91" y="98" width="8" height="13" rx="2" />
              <rect x="101" y="98" width="8" height="13" rx="2" />
            </g>
          )}

          {creature.teeth === 'pearly' && (
            <g fill="#ffffff" stroke="#000000" strokeWidth="0.8">
              <rect x="80" y="101" width="6" height="8" rx="1.5" />
              <rect x="87" y="100" width="6" height="9" rx="1.5" />
              <rect x="94" y="100" width="6" height="9" rx="1.5" />
              <rect x="101" y="100" width="6" height="9" rx="1.5" />
              <rect x="108" y="101" width="6" height="8" rx="1.5" />
            </g>
          )}
        </g>

        {/* ---------------- BUTTON / DERP EYES ---------------- */}
        <g id="creatureEyes">
          {creature.eyes === 'mismatched-buttons' && (
            <>
              {/* Left Eye: Giant Blue Stitched Button */}
              <circle cx="75" cy="74" r="15" fill="#3b82f6" stroke="#1e3a8a" strokeWidth="2.5" />
              <circle cx="75" cy="74" r="10" fill="#60a5fa" />
              {/* Thread X Stitch */}
              <line x1="72" y1="71" x2="78" y2="77" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="78" y1="71" x2="72" y2="77" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />

              {/* Right Eye: Smaller Yellow Button */}
              <circle cx="125" cy="76" r="11" fill="#eab308" stroke="#713f12" strokeWidth="2.5" />
              <circle cx="125" cy="76" r="7" fill="#fde047" />
              <line x1="123" y1="74" x2="127" y2="78" stroke="#18181b" strokeWidth="2" strokeLinecap="round" />
              <line x1="127" y1="74" x2="123" y2="78" stroke="#18181b" strokeWidth="2" strokeLinecap="round" />
            </>
          )}

          {creature.eyes === 'cyclops-button' && (
            <>
              <circle cx="100" cy="72" r="18" fill="#ec4899" stroke="#831843" strokeWidth="3" />
              <circle cx="100" cy="72" r="12" fill="#f472b6" />
              <line x1="96" y1="68" x2="104" y2="76" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
              <line x1="104" y1="68" x2="96" y2="76" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
            </>
          )}

          {creature.eyes === 'googly-derp' && (
            <>
              {/* White Googly Plastic Eyeballs with wandering pupils */}
              <circle cx="75" cy="74" r="15" fill="#ffffff" stroke="#18181b" strokeWidth="2.5" />
              <circle cx="72" cy="72" r="6" fill="#18181b" />
              <circle cx="70" cy="70" r="2" fill="#ffffff" />

              <circle cx="125" cy="74" r="15" fill="#ffffff" stroke="#18181b" strokeWidth="2.5" />
              <circle cx="129" cy="77" r="6" fill="#18181b" />
              <circle cx="127" cy="75" r="2" fill="#ffffff" />
            </>
          )}

          {creature.eyes === 'glow-star' && (
            <>
              <circle cx="75" cy="74" r="13" fill="#1e1b4b" stroke="#818cf8" strokeWidth="2" />
              <polygon points="75,67 77,72 82,72 78,75 80,80 75,77 70,80 72,75 68,72 73,72" fill="#fbbf24" />

              <circle cx="125" cy="74" r="13" fill="#1e1b4b" stroke="#818cf8" strokeWidth="2" />
              <polygon points="125,67 127,72 132,72 128,75 130,80 125,77 120,80 122,75 118,72 123,72" fill="#fbbf24" />
            </>
          )}
        </g>

        {/* ---------------- WARDROBE LAYERS ---------------- */}

        {/* Neck Slot */}
        {equipped.neck === 'gold-chain' && (
          <g>
            <path d="M 68 132 Q 100 162 132 132" fill="none" stroke="#eab308" strokeWidth="6" strokeLinecap="round" />
            <circle cx="100" cy="154" r="10" fill="#facc15" stroke="#713f12" strokeWidth="2" />
            <text x="100" y="158" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#713f12">$</text>
          </g>
        )}
        {equipped.neck === 'spiky-choker' && (
          <g>
            <path d="M 66 128 Q 100 148 134 128" fill="none" stroke="#27272a" strokeWidth="5" strokeLinecap="round" />
            <polygon points="80,132 83,142 86,132" fill="#e4e4e7" />
            <polygon points="97,136 100,147 103,136" fill="#e4e4e7" />
            <polygon points="114,132 117,142 120,132" fill="#e4e4e7" />
          </g>
        )}
        {equipped.neck === 'dino-cape' && (
          <path d="M 60 125 L 30 165 L 60 155 L 70 170 L 80 155 Z" fill="#22c55e" stroke="#14532d" strokeWidth="2" />
        )}
        {equipped.neck === 'neon-bow-tie' && (
          <g>
            <polygon points="90,135 100,140 90,145" fill="#f43f5e" stroke="#881337" strokeWidth="1.5" />
            <polygon points="110,135 100,140 110,145" fill="#f43f5e" stroke="#881337" strokeWidth="1.5" />
            <circle cx="100" cy="140" r="3" fill="#fde047" />
          </g>
        )}

        {/* Eyes Slot */}
        {equipped.eyes === 'pixel-shades' && (
          <g fill="#000000">
            <rect x="60" y="68" width="35" height="14" />
            <rect x="105" y="68" width="35" height="14" />
            <rect x="95" y="70" width="10" height="5" />
            {/* White pixel reflection */}
            <rect x="63" y="70" width="4" height="4" fill="#ffffff" />
            <rect x="108" y="70" width="4" height="4" fill="#ffffff" />
          </g>
        )}
        {equipped.eyes === 'groucho-glasses' && (
          <g>
            <circle cx="75" cy="74" r="14" fill="none" stroke="#18181b" strokeWidth="4" />
            <circle cx="125" cy="74" r="14" fill="none" stroke="#18181b" strokeWidth="4" />
            <line x1="89" y1="74" x2="111" y2="74" stroke="#18181b" strokeWidth="4" />
            {/* Big pink nose */}
            <ellipse cx="100" cy="85" rx="10" ry="12" fill="#fda4af" stroke="#e11d48" strokeWidth="1.5" />
            {/* Thick black mustache */}
            <path d="M 85 96 C 90 92 100 95 100 97 C 100 95 110 92 115 96 C 118 102 98 104 100 99 C 102 104 82 102 85 96 Z" fill="#18181b" />
          </g>
        )}
        {equipped.eyes === 'cyber-visor' && (
          <g>
            <polygon points="56,70 144,70 138,84 62,84" fill="#06b6d4" opacity="0.85" stroke="#0891b2" strokeWidth="2" />
            <line x1="60" y1="77" x2="140" y2="77" stroke="#cffafe" strokeWidth="1.5" />
          </g>
        )}
        {equipped.eyes === 'monocle' && (
          <g>
            <circle cx="125" cy="74" r="14" fill="rgba(255,255,255,0.3)" stroke="#eab308" strokeWidth="3" />
            <line x1="135" y1="84" x2="145" y2="125" stroke="#eab308" strokeWidth="1.5" strokeDasharray="3 2" />
          </g>
        )}

        {/* Head Slot */}
        {equipped.head === 'propeller-beanie' && (
          <g>
            {/* Cap */}
            <path d="M 68 54 Q 100 28 132 54 Z" fill="#3b82f6" stroke="#1d4ed8" strokeWidth="2" />
            <line x1="100" y1="36" x2="100" y2="24" stroke="#eab308" strokeWidth="3" />
            {/* Propeller Blade */}
            <ellipse cx="88" cy="24" rx="14" ry="3" fill="#ef4444" />
            <ellipse cx="112" cy="24" rx="14" ry="3" fill="#eab308" />
            <circle cx="100" cy="24" r="3" fill="#18181b" />
          </g>
        )}
        {equipped.head === 'tinfoil-hat' && (
          <polygon points="100,15 65,55 135,55" fill="#e4e4e7" stroke="#71717a" strokeWidth="2.5" />
        )}
        {equipped.head === 'golden-crown' && (
          <g>
            <polygon points="68,54 68,30 82,42 100,24 118,42 132,30 132,54" fill="#facc15" stroke="#854d0e" strokeWidth="2" />
            <circle cx="100" cy="38" r="3" fill="#ef4444" />
          </g>
        )}
        {equipped.head === 'wizard-hat' && (
          <g>
            <ellipse cx="100" cy="54" rx="38" ry="10" fill="#4338ca" stroke="#312e81" strokeWidth="2" />
            <polygon points="100,10 75,50 125,50" fill="#4f46e5" stroke="#312e81" strokeWidth="2" />
            <polygon points="100,28 102,32 106,32 103,35 104,39 100,37 96,39 97,35 94,32 98,32" fill="#fbbf24" />
          </g>
        )}
        {equipped.head === 'ramen-bowl' && (
          <g>
            <ellipse cx="100" cy="50" rx="32" ry="12" fill="#ef4444" stroke="#991b1b" strokeWidth="2" />
            <path d="M 70 50 Q 100 70 130 50 Z" fill="#ffffff" />
            <line x1="80" y1="42" x2="120" y2="48" stroke="#b45309" strokeWidth="3" />
          </g>
        )}

        {/* Feet Slot */}
        {equipped.feet === 'bunny-slippers' && (
          <g fill="#fce7f3" stroke="#f472b6" strokeWidth="1.5">
            <ellipse cx="70" cy="176" rx="14" ry="10" />
            <ellipse cx="66" cy="166" rx="3" ry="8" fill="#fda4af" />
            <ellipse cx="74" cy="166" rx="3" ry="8" fill="#fda4af" />

            <ellipse cx="130" cy="176" rx="14" ry="10" />
            <ellipse cx="126" cy="166" rx="3" ry="8" fill="#fda4af" />
            <ellipse cx="134" cy="166" rx="3" ry="8" fill="#fda4af" />
          </g>
        )}
        {equipped.feet === 'skater-kicks' && (
          <g fill="#0284c7" stroke="#0369a1" strokeWidth="2">
            <rect x="56" y="168" width="24" height="12" rx="4" />
            <rect x="120" y="168" width="24" height="12" rx="4" />
            <line x1="56" y1="178" x2="80" y2="178" stroke="#ffffff" strokeWidth="3" />
            <line x1="120" y1="178" x2="144" y2="178" stroke="#ffffff" strokeWidth="3" />
          </g>
        )}

        {/* Sleep Blanket Overlay (Cozy grumpy condition) */}
        {isSleepy && (
          <g>
            <path d="M 40 120 Q 100 145 160 120 L 160 185 L 40 185 Z" fill="#6366f1" opacity="0.9" stroke="#4338ca" strokeWidth="3" />
            <line x1="40" y1="140" x2="160" y2="140" stroke="#a5b4fc" strokeWidth="3" strokeDasharray="6 4" />
          </g>
        )}
      </svg>
    </div>
  );
};
