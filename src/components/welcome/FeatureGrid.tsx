import {
  HeartHandshake,
  CalendarDays,
  Pill,
  GraduationCap,
  Camera,
  Landmark,
  Zap,
  Trophy,
  Home,
} from 'lucide-react';

const FEATURES = [
  {
    icon: HeartHandshake,
    title: 'Hermes BIFF tone check',
    description:
      'Drafting a message to your co-parent? Hermes checks it for blame, sarcasm, or accusations, suggesting Brief, Informative, Friendly, and Firm edits before you hit send.',
    color: 'text-rose-400',
    bg: 'bg-rose-500/10 border-rose-500/20',
  },
  {
    icon: CalendarDays,
    title: 'Custody & calm swaps',
    description:
      'Visual schedules both parents can rely on. Request day swaps without triggering arguments, and export a clean weekly logistics digest via SMS or email with one tap.',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
  },
  {
    icon: Pill,
    title: 'Medication & dosing safety',
    description:
      'Did they take their antibiotic before school or at the other house? Cross-home dose timing checks and allergy alerts ensure nobody double-doses or skips.',
    color: 'text-sky-400',
    bg: 'bg-sky-500/10 border-sky-500/20',
  },
  {
    icon: GraduationCap,
    title: 'School Stuff Adder',
    description:
      'Snap a photo of a crumpled backpack flyer or forward a teacher email. Hermes pulls out homework deadlines, field trip slips, and dress-up days for your approval.',
    color: 'text-teal-400',
    bg: 'bg-teal-500/10 border-teal-500/20',
  },
  {
    icon: Camera,
    title: 'Receipts & pantry vision',
    description:
      'Take a picture of the grocery receipt or open fridge door. FamilyOS drafts items and checks current pantry stock so neither house buys a fourth jar of mayo.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
  },
  {
    icon: Landmark,
    title: 'Read-only bank sync',
    description:
      'SimpleFIN displays balances and split expenses. Uncertain transactions wait in a 1-tap review inbox—your decisions teach the system permanently. Never moves money.',
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10 border-indigo-500/20',
  },
  {
    icon: Zap,
    title: 'One next chore (ADHD focus)',
    description:
      'When the house is a disaster and your brain is fried, the app serves up exactly one micro-task with a 5-minute timer, calming sounds, and instant points.',
    color: 'text-amber-300',
    bg: 'bg-amber-400/10 border-amber-400/20',
  },
  {
    icon: Trophy,
    title: 'Routines, streaks & arcade',
    description:
      'Morning and bedtime checklists keep kids moving without nagging. Done chores keep streaks alive and earn game tokens for the 120Hz retro canvas arcade.',
    color: 'text-pink-400',
    bg: 'bg-pink-500/10 border-pink-500/20',
  },
  {
    icon: Home,
    title: 'Smart home & COPPA privacy',
    description:
      'Optional Home Assistant allowlist controls morning lights or camera snapshots. Built with verified parental consent for under-13 kids and strict zero-ad data boundaries.',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10 border-orange-500/20',
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
            className="bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/10 hover:border-white/20 rounded-3xl p-6 flex flex-col gap-3.5 backdrop-blur-xl shadow-xl transition-colors duration-300"
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
