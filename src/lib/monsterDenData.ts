import { uid, loadJSON, saveJSON, KEYS, loadPointsBalance, savePointsBalance, type PointsBalance } from './familyos';

export const MONSTER_DEN_KEY = 'familyos_monster_den_profiles';
export const MONSTER_DEN_INVENTORY_KEY = 'familyos_monster_den_inventories';

export type CreatureClan = 'fuggler' | 'magical';

export interface CreatureSpec {
  id: string;
  name: string;
  clan: CreatureClan;
  title: string;
  blurb: string;
  baseColor: string;
  bellyColor: string;
  texture: 'felt' | 'burlap' | 'fuzzy' | 'scales' | 'nebula';
  teeth: 'gap' | 'human-chompers' | 'crooked-fangs' | 'buck' | 'pearly';
  eyes: 'mismatched-buttons' | 'cyclops-button' | 'googly-derp' | 'glow-star';
  ears: 'goblin' | 'bunny-antlers' | 'bear' | 'mismatched-flop';
  specialTrait?: 'wings' | 'nebula-horn' | 'stitches' | 'bandaid';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

export interface WardrobeItem {
  id: string;
  name: string;
  slot: 'head' | 'eyes' | 'neck' | 'feet' | 'accessory';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  cost: number;
  description: string;
  icon: string;
}

export interface RoomItem {
  id: string;
  name: string;
  category: 'furniture' | 'poster' | 'lighting' | 'audio' | 'trinket' | 'plant';
  cost: number;
  width: number;
  height: number;
  rarity: 'common' | 'rare' | 'epic';
  icon: string;
}

export interface PlacedDecoration {
  instanceId: string;
  itemId: string;
  x: number; // percentage (0 - 90)
  y: number; // percentage (0 - 85)
  scale: number;
  rotation: number;
  zIndex: number;
}

export interface VisitorSticker {
  id: string;
  fromMemberId: string;
  fromName: string;
  sticker: string;
  note?: string;
  x: number;
  y: number;
  timestamp: number;
}

export interface ExpeditionCheckpoint {
  timeFraction: number; // 0.0 to 1.0 of total duration
  name: string;
  blurb: string;
  icon: string;
}

export interface ExpeditionZone {
  id: string;
  name: string;
  tagline: string;
  environment: string;
  durationMinutes: number;
  difficulty: 'easy' | 'medium' | 'epic';
  fuelCost: number;
  checkpoints: ExpeditionCheckpoint[];
  possibleSouvenirs: { name: string; icon: string; blurb: string }[];
  stories: string[];
}

export interface ActiveExpedition {
  zoneId: string;
  startTime: number;
  durationMs: number;
  claimed: boolean;
}

export interface PastExpeditionLog {
  id: string;
  zoneName: string;
  date: number;
  storyText: string;
  souvenirName: string;
  souvenirIcon: string;
  lootCoins: number;
}

export interface KidMonsterProfile {
  memberId: string;
  activeCreatureId: string;
  unlockedCreatureIds: string[];
  equippedWardrobe: {
    head?: string;
    eyes?: string;
    neck?: string;
    feet?: string;
    accessory?: string;
  };
  unlockedWardrobeIds: string[];
  unlockedRoomItemIds: string[];
  placedDecorations: PlacedDecoration[];
  roomTheme: string;
  wallColor: string;
  floorColor: string;
  statusText: string;
  statusMood: string;
  spotifyEmbedUrl: string;
  topFriends: string[]; // up to 4 member IDs
  visitorStickers: VisitorSticker[];
  hunger: number; // 0 - 100
  happiness: number; // 0 - 100
  adventureFuel: number; // 0 - 100
  activeExpedition: ActiveExpedition | null;
  expeditionHistory: PastExpeditionLog[];
  spinsAvailable: number;
  lastDailySpinDate?: string;
  updatedAt: number;
}

// -------------------------------------------------------------
// CREATURE CATALOG (The Fuggler Squad & The Whimsical Derps)
// -------------------------------------------------------------
export const CREATURE_ROSTER: CreatureSpec[] = [
  // Fuggler Squad
  {
    id: 'snarl-tooth',
    name: 'Snarl-Tooth',
    clan: 'fuggler',
    title: 'The Grinning Lint Gremlin',
    blurb: 'Has 24 human-like teeth and steals lost socks from the laundry room.',
    baseColor: '#7c533e',
    bellyColor: '#c49a7a',
    texture: 'burlap',
    teeth: 'human-chompers',
    eyes: 'mismatched-buttons',
    ears: 'mismatched-flop',
    specialTrait: 'stitches',
    rarity: 'common',
  },
  {
    id: 'burlap-bob',
    name: 'Burlap Bob',
    clan: 'fuggler',
    title: 'The Wide-Mouthed Cyclops',
    blurb: 'A potato-shaped bundle of felt with one giant button eye and a mischievous gap-toothed sneer.',
    baseColor: '#4f6d48',
    bellyColor: '#8ca684',
    texture: 'felt',
    teeth: 'gap',
    eyes: 'cyclops-button',
    ears: 'goblin',
    specialTrait: 'bandaid',
    rarity: 'common',
  },
  {
    id: 'bristle-bite',
    name: 'Bristle-Bite',
    clan: 'fuggler',
    title: 'The Fuzzy Snarl Fiend',
    blurb: 'Fluorescent magenta fuzzball with crooked pearly chompers and floppy bat wings.',
    baseColor: '#9333ea',
    bellyColor: '#c084fc',
    texture: 'fuzzy',
    teeth: 'pearly',
    eyes: 'googly-derp',
    ears: 'goblin',
    specialTrait: 'wings',
    rarity: 'rare',
  },
  {
    id: 'stitches-mcgee',
    name: 'Stitches McGee',
    clan: 'fuggler',
    title: 'The Franken-Teddy Terror',
    blurb: 'Mismatched felt patches, two different colored button eyes, and an endless appetite for graham crackers.',
    baseColor: '#b45309',
    bellyColor: '#fde047',
    texture: 'felt',
    teeth: 'crooked-fangs',
    eyes: 'mismatched-buttons',
    ears: 'bear',
    specialTrait: 'stitches',
    rarity: 'epic',
  },

  // Whimsical Derps (Magical Beasts)
  {
    id: 'star-jackalope',
    name: 'Star Jackalope',
    clan: 'magical',
    title: 'The Cosmic Rabbit Beast',
    blurb: 'Sneezes nebula dust and has glowing crystal antlers that hum when chores get finished.',
    baseColor: '#3b82f6',
    bellyColor: '#93c5fd',
    texture: 'nebula',
    teeth: 'buck',
    eyes: 'glow-star',
    ears: 'bunny-antlers',
    specialTrait: 'nebula-horn',
    rarity: 'common',
  },
  {
    id: 'glow-goblin',
    name: 'Glow-Moth Goblin',
    clan: 'magical',
    title: 'The Cave Shroom Sprite',
    blurb: 'Tiny enchanted goblin with glowing moth wings and a love for shiny room stickers.',
    baseColor: '#10b981',
    bellyColor: '#a7f3d0',
    texture: 'scales',
    teeth: 'gap',
    eyes: 'glow-star',
    ears: 'goblin',
    specialTrait: 'wings',
    rarity: 'rare',
  },
  {
    id: 'derp-griffin',
    name: 'Derp Griffin',
    clan: 'magical',
    title: 'The Flap-Happy Sky Puppy',
    blurb: 'Half golden eagle, half golden retriever, 100% unable to fly in a straight line.',
    baseColor: '#eab308',
    bellyColor: '#fef08a',
    texture: 'fuzzy',
    teeth: 'human-chompers',
    eyes: 'googly-derp',
    ears: 'bear',
    specialTrait: 'wings',
    rarity: 'legendary',
  },
];

// -------------------------------------------------------------
// WARDROBE CATALOG
// -------------------------------------------------------------
export const WARDROBE_CATALOG: WardrobeItem[] = [
  // Head
  { id: 'propeller-beanie', name: 'Spinning Propeller Beanie', slot: 'head', rarity: 'common', cost: 25, description: 'Spins when the monster gets excited.', icon: '🚁' },
  { id: 'tinfoil-hat', name: 'Alien-Proof Tin Foil Hat', slot: 'head', rarity: 'common', cost: 20, description: 'Blocks signals from homework aliens.', icon: '🛸' },
  { id: 'ramen-bowl', name: 'Upside-Down Ramen Bowl', slot: 'head', rarity: 'rare', cost: 45, description: 'Delicious, warm, and highly fashionable.', icon: '🍜' },
  { id: 'golden-crown', name: 'Crooked Cardboard Crown', slot: 'head', rarity: 'epic', cost: 80, description: 'Ruler of the Bed Fort Kingdom.', icon: '👑' },
  { id: 'wizard-hat', name: 'Star-Spangled Wizard Cone', slot: 'head', rarity: 'rare', cost: 50, description: 'Cast level-9 clean bedroom spells.', icon: '🧙' },

  // Eyes
  { id: 'pixel-shades', name: 'Thug-Life 8-Bit Pixel Shades', slot: 'eyes', rarity: 'common', cost: 30, description: 'Deal with it. Chore complete.', icon: '🕶️' },
  { id: 'groucho-glasses', name: 'Goofy Disguise Mustache Glasses', slot: 'eyes', rarity: 'common', cost: 25, description: 'Who is this stranger? Nobody knows.', icon: '🥸' },
  { id: 'cyber-visor', name: 'Neon Cyberpunk Goggles', slot: 'eyes', rarity: 'epic', cost: 75, description: 'Tracks dust mites in high definition.', icon: '🥽' },
  { id: 'monocle', name: 'Fancy Golden Monocle', slot: 'eyes', rarity: 'rare', cost: 40, description: 'Quite sophisticated for a fuggler.', icon: '🧐' },

  // Neck
  { id: 'gold-chain', name: 'Oversized Golden Dollar Chain', slot: 'neck', rarity: 'rare', cost: 55, description: 'Heavy monster drip.', icon: '🪙' },
  { id: 'spiky-choker', name: 'Punk Rock Spiked Collar', slot: 'neck', rarity: 'common', cost: 30, description: 'Rawr means I made my bed in dinosaur.', icon: '🎸' },
  { id: 'dino-cape', name: 'Green Spiked Dinosaur Cape', slot: 'neck', rarity: 'rare', cost: 50, description: 'Flutters in the hallway draft.', icon: '🦖' },
  { id: 'neon-bow-tie', name: 'Glow-in-the-Dark Bow Tie', slot: 'neck', rarity: 'common', cost: 25, description: 'Dressed up for bedtime.', icon: '🎀' },

  // Feet
  { id: 'bunny-slippers', name: 'Fluffy Bunny Slippers', slot: 'feet', rarity: 'common', cost: 25, description: 'Maximum sneakiness across wooden floors.', icon: '🐰' },
  { id: 'skater-kicks', name: 'High-Top Checkerboard Sneakers', slot: 'feet', rarity: 'rare', cost: 45, description: 'Fresh out of the sneaker box.', icon: '👟' },
  { id: 'dino-stompers', name: 'Green Claw Dinosaur Slippers', slot: 'feet', rarity: 'rare', cost: 50, description: 'Make thud-thud noises on rugs.', icon: '🐾' },

  // Accessory / Hand
  { id: 'laser-sword', name: 'Inflatable Glow Sword', slot: 'accessory', rarity: 'epic', cost: 85, description: 'Defends the pillow fortress.', icon: '🗡️' },
  { id: 'boba-cup', name: 'Giant Iced Boba Tea', slot: 'accessory', rarity: 'rare', cost: 40, description: 'Extra boba pearls with chew power.', icon: 'bubble' },
  { id: 'retro-gameboy', name: 'Yellow Pocket Pixel Gameboy', slot: 'accessory', rarity: 'epic', cost: 90, description: 'Plays 8-bit monster quests.', icon: '🎮' },
];

// -------------------------------------------------------------
// ROOM DECOR CATALOG (MySpace Bedroom Trinkets & Furniture)
// -------------------------------------------------------------
export const ROOM_DECOR_CATALOG: RoomItem[] = [
  { id: 'lava-lamp', name: 'Psychedelic Lava Lamp', category: 'lighting', cost: 35, width: 60, height: 110, rarity: 'common', icon: '🪔' },
  { id: 'retro-boombox', name: 'Chiptune Retro Boombox', category: 'audio', cost: 60, width: 120, height: 80, rarity: 'rare', icon: '📻' },
  { id: 'arcade-cabinet', name: 'Mini 80s Arcade Machine', category: 'furniture', cost: 120, width: 100, height: 160, rarity: 'epic', icon: '🕹️' },
  { id: 'beanbag-chair', name: 'Neon Slime Beanbag Chair', category: 'furniture', cost: 50, width: 130, height: 90, rarity: 'common', icon: '🛋️' },
  { id: 'alien-poster', name: 'I Want To Believe Poster', category: 'poster', cost: 25, width: 80, height: 110, rarity: 'common', icon: '🛸' },
  { id: 'skate-deck', name: 'Flaming Skull Skateboard Deck', category: 'poster', cost: 40, width: 50, height: 130, rarity: 'rare', icon: '🛹' },
  { id: 'neon-sign-pizza', name: 'Glowing Neon Pizza Sign', category: 'lighting', cost: 70, width: 90, height: 90, rarity: 'rare', icon: '🍕' },
  { id: 'plant-carnivorous', name: 'Biting Venus Monster Plant', category: 'plant', cost: 35, width: 70, height: 90, rarity: 'common', icon: '🪴' },
  { id: 'retro-carpet', name: '90s Laser Arcade Carpet', category: 'trinket', cost: 45, width: 180, height: 80, rarity: 'common', icon: '🟣' },
  { id: 'disco-ball', name: 'Sparkling Ceiling Disco Ball', category: 'lighting', cost: 80, width: 70, height: 90, rarity: 'epic', icon: '🪩' },
];

// -------------------------------------------------------------
// SOUNDBOARD REACTIONS (Fart, Airhorn, Cheer, Laser, Burp)
// -------------------------------------------------------------
export interface SoundReaction {
  id: string;
  name: string;
  emoji: string;
  synthKey: 'fart' | 'airhorn' | 'cheer' | 'burp' | 'laser' | 'coin' | 'squeak' | 'fanfare';
}

export const SOUNDBOARD_REACTIONS: SoundReaction[] = [
  { id: 'snd-fart', name: 'Toot Blast', emoji: '💨', synthKey: 'fart' },
  { id: 'snd-airhorn', name: 'DJ Airhorn', emoji: '📢', synthKey: 'airhorn' },
  { id: 'snd-cheer', name: 'Stadium Cheer', emoji: '🎉', synthKey: 'cheer' },
  { id: 'snd-burp', name: 'Monster Belch', emoji: '🫧', synthKey: 'burp' },
  { id: 'snd-laser', name: 'Pew Pew Laser', emoji: '⚡', synthKey: 'laser' },
  { id: 'snd-coin', name: 'Chore Coin', emoji: '🪙', synthKey: 'coin' },
  { id: 'snd-squeak', name: 'Goofy Squeak', emoji: '🦆', synthKey: 'squeak' },
  { id: 'snd-fanfare', name: 'Victory Horns', emoji: '🎺', synthKey: 'fanfare' },
];

// -------------------------------------------------------------
// EXPEDITION ZONES (The Finch-Style Habit Fuel Engine)
// -------------------------------------------------------------
export const EXPEDITION_ZONES: ExpeditionZone[] = [
  {
    id: 'couch-canyon',
    name: 'The Whispering Couch Cushions',
    tagline: 'Deep beneath the living room sofas where lost change and ancient pretzels dwell.',
    environment: 'linear-gradient(135deg, #451a03 0%, #78350f 50%, #292524 100%)',
    durationMinutes: 45,
    difficulty: 'easy',
    fuelCost: 30,
    checkpoints: [
      { timeFraction: 0.2, name: 'The Dusty Dropoff', blurb: 'Your pet squeezed between the foam cracks with a tiny flashlight.', icon: '🔦' },
      { timeFraction: 0.5, name: 'Mount Lost Penny', blurb: 'Climbed a pile of forgotten 1998 pennies and a half-eaten chip.', icon: '🪙' },
      { timeFraction: 0.8, name: 'The TV Remote Cavern', blurb: 'Discovered the remote control everyone has been looking for all week!', icon: '📺' },
    ],
    possibleSouvenirs: [
      { name: 'Ancient Lint Marble', icon: '🧶', blurb: 'A perfectly round sphere of vintage sofa fuzz.' },
      { name: '1994 Shiny Quarter', icon: '🪙', blurb: 'Still has that fresh cushion smell.' },
      { name: 'Mystery Plastic Dino Leg', icon: '🦖', blurb: 'Fits onto no known toy in the house.' },
    ],
    stories: [
      "Your monster wriggled beneath cushion #3 and immediately negotiated peace with a family of dust bunnies. In exchange for half a graham cracker crumb, they surrendered a shiny 1994 quarter!",
      "While surveying Couch Canyon, your pet accidentally sat on the mute button on the long-lost TV remote, creating world peace for 20 whole minutes.",
      "The expedition was perilous—a giant hand reached in looking for car keys, but your monster dodged into the lining like an Olympic gymnast."
    ],
  },
  {
    id: 'mount-laundry',
    name: 'Mount Laundry & The Sock Vortex',
    tagline: 'A snowy peak of freshly dried sweatshirts and rogue mismatched tube socks.',
    environment: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #60a5fa 100%)',
    durationMinutes: 90,
    difficulty: 'medium',
    fuelCost: 60,
    checkpoints: [
      { timeFraction: 0.2, name: 'Basecamp Warm Towels', blurb: 'Burrowed into a glorious pile of warm dryer towels for a 15-minute nap.', icon: '🧺' },
      { timeFraction: 0.5, name: 'The Bermuda Sock Triangle', blurb: 'Investigating why left socks vanish into alternate dimensions.', icon: '🧦' },
      { timeFraction: 0.8, name: 'The Summit of Fitted Sheets', blurb: 'Nobody knows how to fold a fitted sheet, but your monster made a fortress.', icon: '⛺' },
    ],
    possibleSouvenirs: [
      { name: 'Static Cling Dryer Sheet Cape', icon: '🧣', blurb: 'Smells like lavender breeze and crackles with electricity.' },
      { name: 'The Lonesome Polka-Dot Sock', icon: '🧦', blurb: 'Its partner has been lost since October.' },
      { name: 'Gold Safety Pin Medal', icon: '🧷', blurb: 'Awarded for supreme climbing valor.' },
    ],
    stories: [
      "Your beast reached the summit of Mount Laundry and wore a warm dryer sheet like a royal cape. The static electricity made all their fur stand straight up!",
      "A rogue sock tried to challenge your monster to a staring contest. Your monster didn't blink once because their eyes are stitched buttons. Instant victory!",
      "Hermes reports that your pet found three missing socks, but unfortunately traded them to the family dog for a squeaky rubber bone."
    ],
  },
  {
    id: 'forbidden-pantry',
    name: 'The Midnight Pantry of Curiosities',
    tagline: 'Top-shelf snacks, mysterious spice jars, and the elusive marshmallow stash.',
    environment: 'linear-gradient(135deg, #14532d 0%, #15803d 50%, #052e16 100%)',
    durationMinutes: 120,
    difficulty: 'epic',
    fuelCost: 100,
    checkpoints: [
      { timeFraction: 0.25, name: 'The Cracker Box Labyrinth', blurb: 'Navigating past towers of Saltines and Ritz with stealth.', icon: '🍘' },
      { timeFraction: 0.5, name: 'The Great Cinnamon Canyon', blurb: 'Sneezed three times near the baking spice shelf.', icon: '✨' },
      { timeFraction: 0.75, name: 'The High Marshmallow Vault', blurb: 'Scaling the cereal boxes to gaze upon the forbidden sugar puffs.', icon: '🥣' },
    ],
    possibleSouvenirs: [
      { name: 'Enchanted Cereal Marshmallow', icon: '🌈', blurb: 'A rare blue moon marshmallow with 100% pure crunch.' },
      { name: 'Golden Twist Tie Ring', icon: '💍', blurb: 'Worn like a championship belt.' },
      { name: 'Secret Cinnamon Chip', icon: '🍪', blurb: 'Rescued from the bottom of the cookie jar.' },
    ],
    stories: [
      "Your pet successfully mapped the high-altitude cereal shelf. They were spotted riding a jar of crunchy peanut butter down to basecamp like a bobsled!",
      "Hermes reports that your monster attempted to read the nutritional facts on the cocoa puffs box, but got distracted by the maze on the back. They solved it in 4 seconds.",
      "A legendary raid on the forbidden pantry concluded with zero messes, three happy squeaks, and one crumbly cookie souvenir!"
    ],
  },
];

// -------------------------------------------------------------
// PROFILE & INVENTORY STORAGE HELPERS
// -------------------------------------------------------------
export function createDefaultProfile(memberId: string): KidMonsterProfile {
  return {
    memberId,
    activeCreatureId: CREATURE_ROSTER[0].id,
    unlockedCreatureIds: [CREATURE_ROSTER[0].id],
    equippedWardrobe: {},
    unlockedWardrobeIds: ['propeller-beanie', 'pixel-shades'],
    unlockedRoomItemIds: ['lava-lamp', 'retro-boombox', 'alien-poster'],
    placedDecorations: [
      { instanceId: 'dec-1', itemId: 'retro-boombox', x: 15, y: 65, scale: 1, rotation: 0, zIndex: 2 },
      { instanceId: 'dec-2', itemId: 'lava-lamp', x: 75, y: 55, scale: 1, rotation: 0, zIndex: 2 },
      { instanceId: 'dec-3', itemId: 'alien-poster', x: 20, y: 15, scale: 1, rotation: -3, zIndex: 1 },
    ],
    roomTheme: 'den',
    wallColor: '#2b1b17',
    floorColor: '#1c120c',
    statusText: 'Chillin in my monster den! Chores get squished here.',
    statusMood: '🦖 Roaring',
    spotifyEmbedUrl: '',
    topFriends: [],
    visitorStickers: [],
    hunger: 80,
    happiness: 90,
    adventureFuel: 20,
    activeExpedition: null,
    expeditionHistory: [],
    spinsAvailable: 1, // 1 free starter spin!
    lastDailySpinDate: undefined,
    updatedAt: Date.now(),
  };
}

export function loadAllMonsterProfiles(): Record<string, KidMonsterProfile> {
  return loadJSON<Record<string, KidMonsterProfile>>(MONSTER_DEN_KEY, {});
}

export function saveAllMonsterProfiles(data: Record<string, KidMonsterProfile>): void {
  saveJSON(MONSTER_DEN_KEY, data);
}

export function getProfileForMember(memberId: string): KidMonsterProfile {
  const all = loadAllMonsterProfiles();
  const defaults = createDefaultProfile(memberId);
  if (!all[memberId]) {
    all[memberId] = defaults;
    saveAllMonsterProfiles(all);
    return defaults;
  }
  return {
    ...defaults,
    ...all[memberId],
    equippedWardrobe: { ...defaults.equippedWardrobe, ...(all[memberId].equippedWardrobe || {}) },
    unlockedCreatureIds: Array.from(new Set([...defaults.unlockedCreatureIds, ...(all[memberId].unlockedCreatureIds || [])])),
    unlockedWardrobeIds: Array.from(new Set([...defaults.unlockedWardrobeIds, ...(all[memberId].unlockedWardrobeIds || [])])),
    unlockedRoomItemIds: Array.from(new Set([...defaults.unlockedRoomItemIds, ...(all[memberId].unlockedRoomItemIds || [])])),
  };
}

export function updateMemberProfile(memberId: string, patch: Partial<KidMonsterProfile>): KidMonsterProfile {
  const all = loadAllMonsterProfiles();
  const current = getProfileForMember(memberId);
  const updated: KidMonsterProfile = {
    ...current,
    ...patch,
    memberId,
    updatedAt: Date.now(),
  };
  all[memberId] = updated;
  saveAllMonsterProfiles(all);
  return updated;
}

/**
 * Calculates the exact final rotation (in degrees) for a wheel with totalSlices,
 * such that the winning slice's center aligns with the pointer at 12 o'clock (270°).
 */
export function computeFinalRotation(
  currentRotation: number,
  winningIndex: number,
  totalSlices: number,
  minExtraSpins: number = 5
): number {
  const sliceAngle = 360 / totalSlices;
  const mid = winningIndex * sliceAngle + sliceAngle / 2;
  const want = (((270 - mid) % 360) + 360) % 360;
  const cur = ((currentRotation % 360) + 360) % 360;
  return currentRotation + minExtraSpins * 360 + ((want - cur + 360) % 360);
}

// -------------------------------------------------------------
// CHORE FUEL HOOKUP & EXPEDITION ADVANCEMENT
// -------------------------------------------------------------
export function addAdventureFuel(memberId: string, amount: number): number {
  const profile = getProfileForMember(memberId);
  const next = Math.min(100, (profile.adventureFuel || 0) + amount);
  updateMemberProfile(memberId, { adventureFuel: next, happiness: Math.min(100, (profile.happiness || 0) + 15) });
  return next;
}

export function feedMonster(memberId: string, snackName: string): { hunger: number; happiness: number } {
  const profile = getProfileForMember(memberId);
  const hunger = Math.min(100, (profile.hunger || 0) + 30);
  const happiness = Math.min(100, (profile.happiness || 0) + 20);
  updateMemberProfile(memberId, { hunger, happiness });
  return { hunger, happiness };
}

export function petMonster(memberId: string): number {
  const profile = getProfileForMember(memberId);
  const happiness = Math.min(100, (profile.happiness || 0) + 10);
  updateMemberProfile(memberId, { happiness });
  return happiness;
}
