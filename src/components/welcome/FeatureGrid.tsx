import {
  Camera,
  Zap,
  DoorOpen,
  HeartHandshake,
  CalendarDays,
  Pill,
  GraduationCap,
  Utensils,
  Landmark,
  Home,
  ShieldCheck,
  Sparkles,
  PawPrint,
  Moon,
  Gamepad2,
  LayoutDashboard,
  Pin,
  Lock,
} from 'lucide-react';

const FEATURES = [
  {
    icon: LayoutDashboard,
    title: 'Bento Grid ADHD Dashboard',
    description:
      'Executive-function-first layout. The 6-tile Bento Grid highlights only what matters right now—Brain Battery, Next Up Timeline, One Focus Chore, Hermes Copilot AI, Kitchen Dinner, and Bills—with deep modal expansions for everything else.',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10 border-cyan-500/20',
  },
  {
    icon: Camera,
    title: 'AI Room Chore Scanner',
    description:
      'Point your camera at any disaster zone—the living room floor, kitchen counter, or kids’ playroom. AI computer vision spots scattered toys, unwashed dishes, laundry piles, and unmade beds in real time, converting the mess into bite-sized actionable chores with time estimates. Nothing is saved until you confirm.',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10 border-cyan-500/20',
  },
  {
    icon: Zap,
    title: 'One next chore (ADHD focus)',
    description:
      'When executive dysfunction sets in and the household to-do list feels suffocating, Focus Mode wipes away the clutter to show exactly ONE micro-task. Paired with a 5-minute beat-the-clock timer, dopamine-boosting confetti, and instant points to build momentum.',
    color: 'text-cyan-300',
    bg: 'bg-cyan-400/10 border-cyan-400/20',
  },
  {
    icon: Sparkles,
    title: 'Kids World Monster Den & Voice Translator',
    description:
      'Turn chores and routines into creature care. Kids hatch and raise virtual monster companions (Grumble, Pip, Barnaby) unlocked with chore points. Includes the Voice Hermes Pocket Translator—a COPPA-safe, mic-powered companion for homework questions, big feelings, and pet mood decoding.',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10 border-cyan-500/20',
  },
  {
    icon: DoorOpen,
    title: 'Kid Rooms & Sealed Private Journal',
    description:
      'Give every child their own digital space. Kids spend earned chore points to unlock themed room aesthetics (Glitter Pop, Night Market, Orbit, Moss Fort), pick avatars, and broadcast their mood. Includes a sealed personal journal stored strictly on their device—never synced to the family database, never visible to parents.',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
  },
  {
    icon: PawPrint,
    title: '“Who Fed the Dog?” Pet Feeding Station',
    description:
      'Stop morning double-feeding and forgotten dinners across Mom’s and Dad’s houses. Real-time family pet feeding and walk station with 2-hour duplicate warnings, feeding history, and multi-pet tracking. Pets never count toward your subscription seat limits.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
  },
  {
    icon: HeartHandshake,
    title: 'Hermes BIFF tone check',
    description:
      'Communication with a co-parent or ex is fraught with landmines. Type what you feel; Hermes analyzes it for snark, sarcasm, passive-aggressive jabs, or blame before you send, transforming it into Brief, Informative, Friendly, and Firm communication. Protects your peace and your legal record.',
    color: 'text-rose-400',
    bg: 'bg-rose-500/10 border-rose-500/20',
  },
  {
    icon: CalendarDays,
    title: 'Custody & calm swaps',
    description:
      'Visual 2-2-3, 2-2-5, alternating schedules, or custom split routines (where the primary parent covers bedtime and wake-ups while the co-parent takes after-school blocks, with configurable Right of First Refusal rules). Request day swaps without triggering arguments or phone tag traps, and export a clean weekly logistics digest via SMS or email with one tap.',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10 border-cyan-500/20',
  },
  {
    icon: Pin,
    title: 'Popup Family Bulletin Board',
    description:
      'A non-intrusive floating corkboard modal for quick notes, sticky memos, bus route updates, and urgent family announcements. Always available from the header without cluttering your core ADHD dashboard.',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
  },
  {
    icon: Pill,
    title: 'Medication & dosing safety',
    description:
      'Did they take their morning ADHD med or antibiotic at Mom’s or Dad’s? Real-time dose logging with exact timestamps, dose counts, caregiver handoffs, and cross-home allergy warnings ensure nobody double-doses or skips.',
    color: 'text-sky-400',
    bg: 'bg-sky-500/10 border-sky-500/20',
  },
  {
    icon: GraduationCap,
    title: 'Backpack & school stuff adder',
    description:
      'Never miss Pajama Day, an early dismissal, or a field trip slip again. Take a photo of crumpled backpack handouts or forward teacher emails. Hermes automatically extracts homework deadlines, required supplies, and sign-offs for your review with School Adder triage.',
    color: 'text-teal-400',
    bg: 'bg-teal-500/10 border-teal-500/20',
  },
  {
    icon: Lock,
    title: 'Triad Fusion Architecture',
    description:
      'Zero-leak tenant isolation designed for complex family dynamics. Child accounts are isolated from financial and legal modules, offline records are encrypted on-device, and telemetry bridges enforce boundaries across households.',
    color: 'text-cyan-300',
    bg: 'bg-cyan-500/10 border-cyan-500/20',
  },
  {
    icon: Utensils,
    title: 'Receipts & pantry vision',
    description:
      'Snap a photo of the paper grocery receipt or an open fridge shelf. FamilyOS updates kitchen stock and syncs shopping lists across households so neither parent buys a duplicate carton of milk or a fourth jar of mayo.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
  },
  {
    icon: Landmark,
    title: 'Read-only bank sync',
    description:
      'Connect your accounts with secure, read-only SimpleFIN sync—the app can never move money or pay bills. Shared child expenses wait in a 1-tap review inbox, and your categorization decisions train the system permanently.',
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10 border-indigo-500/20',
  },
  {
    icon: Gamepad2,
    title: 'Routines, streaks & 120Hz retro arcade',
    description:
      'Morning wake-up checklists and bedtime routines keep kids moving without nagging parents. Finished routines build team streaks and earn arcade tokens for built-in 120Hz canvas games—Sock Python, Pantry Chomper, and Cosmic Clutter—with family leaderboards.',
    color: 'text-pink-400',
    bg: 'bg-pink-500/10 border-pink-500/20',
  },
  {
    icon: Moon,
    title: 'Bedtime wind-down & calming soundscapes',
    description:
      'Transform bedtime friction into peaceful sleep. Kids tuck in their monster companion and drift off to ambient generative soundscapes, gentle sleep chimes, and calming frequencies. Zero ads, zero algorithmic video rabbit holes.',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
  },
  {
    icon: Home,
    title: 'Smart home & allowlist controls',
    description:
      'Optionally link your Home Assistant instance for allowlisted morning wake-up lights, routine-triggered scenes, or fresh security camera snapshot checks. Keeps sensitive smart home controls behind an admin-approved allowlist.',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10 border-orange-500/20',
  },
  {
    icon: ShieldCheck,
    title: 'COPPA verified child privacy',
    description:
      'Engineered from day one for child safety. Adding under-13 family members requires verified parental consent with strict audit logs. Private family boundaries, zero ad tracking, zero data brokering, and sealed context protect your household.',
    color: 'text-teal-300',
    bg: 'bg-teal-500/10 border-teal-500/20',
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="px-4 py-16 max-w-5xl mx-auto">
      <div className="text-center max-w-2xl mx-auto mb-10">
        <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight font-display">
          Everything shipped in FamilyOS
        </h2>
        <p className="text-sm sm:text-base text-slate-300 mt-3 leading-relaxed">
          Real tools built for the real chaos of shared family life. Bank, calendar, Gmail, and Home Assistant stay completely disconnected until an admin turns them on.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="bg-slate-900/60 border border-slate-800 hover:border-cyan-500/30 rounded-3xl p-6 flex flex-col gap-3.5 backdrop-blur-xl shadow-xl transition-all duration-300"
          >
            <div className={`w-12 h-12 rounded-2xl ${f.bg} border flex items-center justify-center flex-shrink-0`}>
              <f.icon className={`w-6 h-6 ${f.color}`} />
            </div>
            <h3 className="text-white font-bold text-lg font-display">{f.title}</h3>
            <p className="text-sm text-slate-300 leading-relaxed">{f.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
