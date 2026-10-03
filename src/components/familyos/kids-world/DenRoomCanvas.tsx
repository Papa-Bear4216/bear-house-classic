import React, { useState, useRef } from 'react';
import {
  Sparkles,
  Music,
  Smile,
  Volume2,
  VolumeX,
  Plus,
  Trash2,
  Send,
  Radio,
  ExternalLink,
  Users,
} from 'lucide-react';
import {
  CREATURE_ROSTER,
  ROOM_DECOR_CATALOG,
  SOUNDBOARD_REACTIONS,
  updateMemberProfile,
  petMonster,
  type KidMonsterProfile,
  type PlacedDecoration,
  type VisitorSticker,
} from '@/lib/monsterDenData';
import { CreatureRenderer } from './CreatureRenderer';
import { monsterAudio } from '@/lib/monsterDenAudio';
import { useAppContext } from '@/contexts/AppContext';

interface DenRoomCanvasProps {
  profile: KidMonsterProfile;
  onProfileUpdated: (p: KidMonsterProfile) => void;
  isOwner: boolean;
  visitorMemberId?: string;
  visitorName?: string;
  onOpenGacha: () => void;
  onOpenWardrobe: () => void;
  onOpenExpeditions: () => void;
  spendablePoints: number;
}

export const DenRoomCanvas: React.FC<DenRoomCanvasProps> = ({
  profile,
  onProfileUpdated,
  isOwner,
  visitorMemberId,
  visitorName = 'Visitor',
  onOpenGacha,
  onOpenWardrobe,
  onOpenExpeditions,
  spendablePoints,
}) => {
  const { householdMembers } = useAppContext();
  const roomRef = useRef<HTMLDivElement>(null);

  const [localDecorations, setLocalDecorations] = useState<PlacedDecoration[]>(profile.placedDecorations);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [decorCatalogOpen, setDecorCatalogOpen] = useState(false);
  const [soundboardOpen, setSoundboardOpen] = useState(false);
  const [spotifyInputOpen, setSpotifyInputOpen] = useState(false);
  const [spotifyUrlInput, setSpotifyUrlInput] = useState(profile.spotifyEmbedUrl || '');
  const [statusEditOpen, setStatusEditOpen] = useState(false);
  const [statusDraft, setStatusDraft] = useState(profile.statusText);
  const [moodDraft, setMoodDraft] = useState(profile.statusMood);
  const [isMusicPlaying, setIsMusicPlaying] = useState(monsterAudio.getIsMusicPlaying());
  const [isMuted, setIsMuted] = useState(monsterAudio.getIsMuted());
  const [stickerNoteDraft, setStickerNoteDraft] = useState('');
  const [selectedStickerEmoji, setSelectedStickerEmoji] = useState('⭐');

  // Stop music on unmount
  React.useEffect(() => {
    return () => {
      monsterAudio.stopMusic();
    };
  }, []);

  // Sync localDecorations when profile changes and not dragging
  React.useEffect(() => {
    if (!activeDragId) {
      setLocalDecorations(profile.placedDecorations);
    }
  }, [profile.placedDecorations, activeDragId]);

  const currentCreature =
    CREATURE_ROSTER.find((c) => c.id === profile.activeCreatureId) || CREATURE_ROSTER[0];

  const safeSpotifyUrl = React.useMemo(() => {
    if (!profile.spotifyEmbedUrl) return null;
    try {
      const u = new URL(profile.spotifyEmbedUrl);
      if (u.protocol === 'https:' && (u.hostname === 'open.spotify.com' || u.hostname.endsWith('.spotify.com'))) {
        return u.href;
      }
    } catch {}
    return null;
  }, [profile.spotifyEmbedUrl]);

  // -------------------------------------------------------------
  // Drag and Drop Furniture Logic (Local State during Drag, Commit on Up)
  // -------------------------------------------------------------
  const handlePointerDown = (instanceId: string, e: React.PointerEvent) => {
    if (!isOwner) return;
    setActiveDragId(instanceId);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeDragId || !roomRef.current || !isOwner) return;
    const rect = roomRef.current.getBoundingClientRect();
    const x = Math.min(88, Math.max(2, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(85, Math.max(5, ((e.clientY - rect.top) / rect.height) * 100));

    setLocalDecorations((prev) =>
      prev.map((d) => (d.instanceId === activeDragId ? { ...d, x, y } : d))
    );
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeDragId) {
      const targetId = activeDragId;
      setActiveDragId(null);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}

      // Commit final position to storage once
      const updated = updateMemberProfile(profile.memberId, { placedDecorations: localDecorations });
      onProfileUpdated(updated);
    }
  };

  const handlePointerCancel = () => {
    if (activeDragId) {
      setActiveDragId(null);
      setLocalDecorations(profile.placedDecorations);
    }
  };

  const handleRemoveDecoration = (instanceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOwner) return;
    const nextDecorations = localDecorations.filter((d) => d.instanceId !== instanceId);
    setLocalDecorations(nextDecorations);
    const updated = updateMemberProfile(profile.memberId, { placedDecorations: nextDecorations });
    onProfileUpdated(updated);
    monsterAudio.playSound('squeak');
  };

  const handleAddDecoration = (itemId: string) => {
    const newItem: PlacedDecoration = {
      instanceId: `dec-${Date.now()}`,
      itemId,
      x: 35 + Math.random() * 20,
      y: 40 + Math.random() * 20,
      scale: 1,
      rotation: 0,
      zIndex: localDecorations.length + 1,
    };
    const nextDecorations = [...localDecorations, newItem];
    setLocalDecorations(nextDecorations);
    const updated = updateMemberProfile(profile.memberId, { placedDecorations: nextDecorations });
    onProfileUpdated(updated);
    monsterAudio.playSound('coin');
    setDecorCatalogOpen(false);
  };

  // -------------------------------------------------------------
  // Visitor Sticker Slapping ("Knock & Visit")
  // -------------------------------------------------------------
  const handleSlapSticker = () => {
    if (!visitorMemberId) return;
    const newSticker: VisitorSticker = {
      id: `stk-${Date.now()}`,
      fromMemberId: visitorMemberId,
      fromName: visitorName,
      sticker: selectedStickerEmoji,
      note: stickerNoteDraft.trim() || undefined,
      x: 10 + Math.random() * 70,
      y: 10 + Math.random() * 40,
      timestamp: Date.now(),
    };
    const nextStickers = [newSticker, ...(profile.visitorStickers || []).slice(0, 15)];
    const updated = updateMemberProfile(profile.memberId, { visitorStickers: nextStickers });
    onProfileUpdated(updated);
    monsterAudio.playSound('fanfare');
    setStickerNoteDraft('');
  };

  // -------------------------------------------------------------
  // Audio Toggles & Soundboard
  // -------------------------------------------------------------
  const toggleRadio = () => {
    const playing = monsterAudio.toggleMusic();
    setIsMusicPlaying(playing);
  };

  const toggleMute = () => {
    const next = !isMuted;
    monsterAudio.setMuted(next);
    setIsMuted(next);
    if (next) setIsMusicPlaying(false);
  };

  const playSoundEffect = (key: any) => {
    monsterAudio.playSound(key);
  };

  const saveStatus = () => {
    const updated = updateMemberProfile(profile.memberId, {
      statusText: statusDraft,
      statusMood: moodDraft,
    });
    onProfileUpdated(updated);
    setStatusEditOpen(false);
    monsterAudio.playSound('squeak');
  };

  const saveSpotify = () => {
    const updated = updateMemberProfile(profile.memberId, { spotifyEmbedUrl: spotifyUrlInput });
    onProfileUpdated(updated);
    setSpotifyInputOpen(false);
    monsterAudio.playSound('squeak');
  };

  // Friends for MySpace Top 4
  const familyKids = householdMembers.filter((m) => m.id !== profile.memberId);

  return (
    <div
      ref={roomRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="relative w-full h-[75vh] min-h-[520px] rounded-3xl overflow-hidden border-4 border-amber-950 shadow-2xl flex flex-col justify-between select-none"
      style={{
        background: `radial-gradient(ellipse at 50% 30%, ${profile.wallColor} 0%, #0f0a08 100%)`,
      }}
    >
      {/* ---------------- 1. MYSPACE MARQUEE BANNER ---------------- */}
      <div className="z-30 bg-stone-950/85 backdrop-blur-md border-b-2 border-amber-600/40 px-3 py-1.5 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 overflow-hidden flex-1">
          <span className="px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-400 font-extrabold uppercase text-[10px] whitespace-nowrap animate-pulse">
            {profile.statusMood || '🦖 Roaring'}
          </span>
          <div className="overflow-hidden whitespace-nowrap">
            <span className="inline-block text-amber-200 font-bold tracking-wide animate-marquee">
              ✨ {profile.statusText || 'Welcome to my Monster Den!'} ✨
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-2">
          {isOwner && (
            <button
              onClick={() => setStatusEditOpen(true)}
              className="p-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 text-[10px] font-bold"
              title="Edit Marquee Status"
            >
              ✏️ Status
            </button>
          )}

          {/* Audio Controls */}
          <button
            onClick={toggleRadio}
            className={`p-1.5 rounded-lg border transition ${
              isMusicPlaying
                ? 'bg-amber-500 text-stone-950 border-amber-400 animate-pulse'
                : 'bg-stone-850 text-stone-400 border-stone-700'
            }`}
            title="Toggle 8-bit Chiptune Radio"
          >
            <Radio className="w-4 h-4" />
          </button>

          <button
            onClick={toggleMute}
            className="p-1.5 rounded-lg bg-stone-850 hover:bg-stone-750 text-stone-400 border border-stone-700"
            title={isMuted ? 'Unmute SFX' : 'Mute SFX'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-green-400" />}
          </button>
        </div>
      </div>

      {/* ---------------- 2. ROOM INTERIOR CANVAS (Draggable Layer) ---------------- */}
      <div className="relative flex-1 w-full overflow-hidden">
        {/* Floor Horizon Line (Skeuomorphic 2.5D Room Perspective) */}
        <div
          className="absolute bottom-0 left-0 right-0 h-[38%] border-t-4 border-amber-900/60 shadow-inner"
          style={{
            background: `linear-gradient(180deg, ${profile.floorColor} 0%, #080504 100%)`,
          }}
        />

        {/* Visitor Wall Stickers (Slapped onto the wall) */}
        {profile.visitorStickers?.map((stk) => (
          <div
            key={stk.id}
            className="absolute z-10 pointer-events-auto transform hover:scale-125 transition-transform cursor-help"
            style={{ left: `${stk.x}%`, top: `${stk.y}%` }}
            title={`From ${stk.fromName}: ${stk.note || 'Slapped a sticker!'}`}
          >
            <span className="text-3xl filter drop-shadow">{stk.sticker}</span>
            {stk.note && (
              <div className="bg-yellow-100 text-stone-900 font-bold text-[9px] px-1.5 py-0.5 rounded shadow -mt-1 transform -rotate-3">
                "{stk.note}" -{stk.fromName}
              </div>
            )}
          </div>
        ))}

        {/* Draggable Placed Decorations */}
        {profile.placedDecorations.map((d) => {
          const itemDef = ROOM_DECOR_CATALOG.find((r) => r.id === d.itemId);
          if (!itemDef) return null;
          const isSelected = activeDragId === d.instanceId;

          return (
            <div
              key={d.instanceId}
              onPointerDown={(e) => handlePointerDown(d.instanceId, e)}
              className={`absolute group cursor-grab active:cursor-grabbing transition-transform ${
                isSelected ? 'scale-110 z-40' : 'hover:scale-105'
              }`}
              style={{
                left: `${d.x}%`,
                top: `${d.y}%`,
                zIndex: d.zIndex,
                transform: `rotate(${d.rotation}deg)`,
              }}
            >
              <div className="relative flex flex-col items-center">
                <span className="text-4xl filter drop-shadow-lg select-none">{itemDef.icon}</span>

                {/* Remove Trash Can on Hover (Owner Only) */}
                {isOwner && (
                  <button
                    onClick={(e) => handleRemoveDecoration(d.instanceId, e)}
                    className="absolute -top-2 -right-2 p-1 bg-red-600 hover:bg-red-500 rounded-full text-white opacity-0 group-hover:opacity-100 transition shadow"
                    title="Remove item"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* ---------------- 3. THE CENTERPIECE CREATURE ---------------- */}
        <div
          className="absolute z-20 transition-all duration-300 flex flex-col items-center"
          style={{ left: '50%', bottom: '12%', transform: 'translateX(-50%)' }}
        >
          <CreatureRenderer
            creature={currentCreature}
            profile={profile}
            size={230}
            interactive={true}
            onPet={() => {
              const happy = petMonster(profile.memberId);
              onProfileUpdated({ ...profile, happiness: happy });
            }}
          />
          <div className="mt-1 px-3 py-1 bg-stone-950/80 backdrop-blur border border-amber-500/40 rounded-full flex items-center gap-2 shadow">
            <span className="text-xs font-black text-amber-300">{currentCreature.name}</span>
            <span className="text-[10px] text-stone-400 capitalize">({currentCreature.clan})</span>
          </div>
        </div>

        {/* ---------------- 4. MYSPACE TOP 4 BESTIES WIDGET (Corner) ---------------- */}
        <div className="absolute top-3 left-3 z-20 bg-stone-950/80 border border-stone-800 rounded-2xl p-2.5 backdrop-blur hidden sm:flex flex-col gap-1.5 max-w-[130px] shadow-lg">
          <div className="flex items-center gap-1 text-[10px] font-extrabold text-purple-400 uppercase">
            <Users className="w-3 h-3" /> My Top Besties
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {familyKids.slice(0, 4).map((kid) => (
              <div
                key={kid.id}
                className="bg-stone-900 border border-stone-700/80 rounded-lg p-1 text-center"
              >
                <div className="text-base">{(kid as { avatar?: string }).avatar || '🐻'}</div>
                <div className="text-[9px] font-bold text-stone-300 truncate">{kid.name}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ---------------- 5. SPOTIFY BOOMBOX LINK ---------------- */}
        {safeSpotifyUrl && (
          <div className="absolute top-3 right-3 z-20 bg-stone-950/85 border border-green-500/60 rounded-2xl p-2 backdrop-blur max-w-[200px] shadow-lg">
            <div className="flex items-center justify-between text-[10px] font-black text-green-400 uppercase">
              <span className="flex items-center gap-1">
                <Music className="w-3 h-3" /> Spotify Track
              </span>
              <a
                href={safeSpotifyUrl}
                target="_blank"
                rel="noreferrer"
                className="hover:text-white"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="text-[9px] text-stone-300 mt-1 truncate">
              {safeSpotifyUrl}
            </div>
          </div>
        )}
      </div>

      {/* ---------------- 6. BOTTOM ACTION DOCK ---------------- */}
      <div className="z-30 bg-stone-950/90 border-t-2 border-amber-900/60 p-2.5 flex items-center justify-between gap-2">
        {/* Left: Hub Launchers */}
        <div className="flex items-center gap-2">
          {isOwner ? (
            <>
              <button
                onClick={onOpenGacha}
                className="px-3.5 py-2 bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-stone-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow active:scale-95 transition"
              >
                <Sparkles className="w-4 h-4" /> PRIZE WHEEL
              </button>
              <button
                onClick={onOpenWardrobe}
                className="px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white font-black rounded-xl text-xs flex items-center gap-1.5 shadow active:scale-95 transition"
              >
                👕 WARDROBE
              </button>
              <button
                onClick={onOpenExpeditions}
                className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white font-black rounded-xl text-xs flex items-center gap-1.5 shadow active:scale-95 transition"
              >
                🧭 EXPEDITION
              </button>
              <button
                onClick={() => setDecorCatalogOpen(true)}
                className="p-2 bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold rounded-xl text-xs"
                title="Add Room Furniture"
              >
                <Plus className="w-4 h-4" />
              </button>
            </>
          ) : (
            /* Visitor Mode ("Knock & Visit") */
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-300 font-bold">
                Visiting {profile.memberId}'s Den!
              </span>
              <input
                type="text"
                placeholder="Slap a note on wall..."
                value={stickerNoteDraft}
                onChange={(e) => setStickerNoteDraft(e.target.value)}
                className="bg-stone-900 border border-stone-700 rounded-lg px-2 py-1 text-xs text-white max-w-[160px]"
              />
              <button
                onClick={handleSlapSticker}
                className="px-3 py-1.5 bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold rounded-lg flex items-center gap-1"
              >
                <Send className="w-3 h-3" /> Slap ⭐
              </button>
            </div>
          )}
        </div>

        {/* Right: Soundboard & Spotify Drawer Toggles */}
        <div className="flex items-center gap-2">
          {isOwner && (
            <button
              onClick={() => setSpotifyInputOpen(true)}
              className="p-2 rounded-xl bg-green-600/30 hover:bg-green-600/50 text-green-400 border border-green-500/40 text-xs font-bold"
              title="Set Spotify Track"
            >
              <Music className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => setSoundboardOpen(!soundboardOpen)}
            className="px-3 py-1.5 rounded-xl bg-pink-600/30 hover:bg-pink-600/50 text-pink-300 border border-pink-500/40 text-xs font-extrabold flex items-center gap-1"
          >
            <Smile className="w-4 h-4" /> SOUNDS
          </button>
        </div>
      </div>

      {/* ---------------- SOUNDBOARD DRAWER ---------------- */}
      {soundboardOpen && (
        <div className="absolute bottom-16 right-3 z-40 bg-stone-900/95 border-2 border-pink-500 rounded-2xl p-3 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-2">
          <div className="text-[11px] font-black text-pink-400 mb-2 uppercase">
            Funny Noise Soundboard
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {SOUNDBOARD_REACTIONS.map((snd) => (
              <button
                key={snd.id}
                onClick={() => playSoundEffect(snd.synthKey)}
                className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 active:scale-90 transition flex flex-col items-center gap-1"
                title={snd.name}
              >
                <span className="text-xl">{snd.emoji}</span>
                <span className="text-[9px] font-bold text-stone-300 truncate max-w-[45px]">
                  {snd.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---------------- DECOR CATALOG MODAL ---------------- */}
      {decorCatalogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-stone-900 border-4 border-amber-500 rounded-3xl p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <h3 className="text-base font-black text-amber-400">ADD DEN DECORATION</h3>
              <button
                onClick={() => setDecorCatalogOpen(false)}
                className="text-stone-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4 max-h-[300px] overflow-y-auto">
              {ROOM_DECOR_CATALOG.map((item) => {
                const isUnlocked = profile.unlockedRoomItemIds?.includes(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => isUnlocked && handleAddDecoration(item.id)}
                    className={`p-3 border rounded-2xl flex flex-col items-center text-center transition ${
                      isUnlocked
                        ? 'bg-stone-850 hover:bg-stone-800 border-stone-700 cursor-pointer'
                        : 'bg-stone-900/60 border-stone-800 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <span className="text-3xl">{item.icon}</span>
                    <span className="text-xs font-bold text-white mt-1">{item.name}</span>
                    <span className="text-[10px] text-stone-400 capitalize">
                      {isUnlocked ? item.category : '🔒 Locked (Prize Wheel)'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- STATUS / MOOD MODAL ---------------- */}
      {statusEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-stone-900 border-4 border-pink-500 rounded-3xl p-5 shadow-2xl">
            <h3 className="text-base font-black text-pink-400 mb-3">MYSPACE STATUS MARQUEE</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-stone-400 block mb-1">Current Mood Emoji & Word</label>
                <input
                  type="text"
                  value={moodDraft}
                  onChange={(e) => setMoodDraft(e.target.value)}
                  className="w-full bg-stone-800 border border-stone-700 rounded-xl px-3 py-2 text-sm text-white"
                  placeholder="🦖 Roaring"
                />
              </div>
              <div>
                <label className="text-xs text-stone-400 block mb-1">Marquee Scrolling Text</label>
                <textarea
                  value={statusDraft}
                  onChange={(e) => setStatusDraft(e.target.value)}
                  className="w-full bg-stone-800 border border-stone-700 rounded-xl px-3 py-2 text-sm text-white h-20"
                  placeholder="What's happening in your clubhouse?"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setStatusEditOpen(false)}
                  className="px-4 py-2 rounded-xl text-stone-400 hover:text-white text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  onClick={saveStatus}
                  className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-black"
                >
                  Save Status
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- SPOTIFY TRACK MODAL ---------------- */}
      {spotifyInputOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-stone-900 border-4 border-green-500 rounded-3xl p-5 shadow-2xl">
            <h3 className="text-base font-black text-green-400 mb-2 flex items-center gap-1.5">
              <Music className="w-5 h-5" /> SPOTIFY PROFILE JAM
            </h3>
            <p className="text-xs text-stone-400 mb-3">
              Paste your favorite Spotify track or playlist link to feature it on your MySpace Den Boombox!
            </p>
            <input
              type="text"
              value={spotifyUrlInput}
              onChange={(e) => setSpotifyUrlInput(e.target.value)}
              className="w-full bg-stone-800 border border-stone-700 rounded-xl px-3 py-2 text-sm text-white mb-4"
              placeholder="https://open.spotify.com/track/..."
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setSpotifyInputOpen(false)}
                className="px-4 py-2 rounded-xl text-stone-400 hover:text-white text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={saveSpotify}
                className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-xs font-black"
              >
                Save Track
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
