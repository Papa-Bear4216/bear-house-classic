import {
  Zap, Bot, Camera, Landmark, Users, GraduationCap, Trophy, Home, Brain,
} from 'lucide-react';

const FEATURES = [
  {
    icon: Zap,
    title: 'One next chore',
    description:
      'When the list is long, the dashboard offers one next task, a short timer, and points when you mark it done.',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
  },
  {
    icon: Bot,
    title: 'Hermes, in the app',
    description:
      'Chat about tasks, the calendar, and spending. Hermes can suggest a Home Assistant action from an allowlist. It does not pay bills, send messages, or give medical or legal advice.',
    color: 'text-sky-400',
    bg: 'bg-sky-500/10 border-sky-500/20',
  },
  {
    icon: Camera,
    title: 'Photos you confirm',
    description:
      'A room photo can suggest chores. A receipt or pantry shelf can suggest items. Nothing is added until you save it.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
  },
  {
    icon: Landmark,
    title: 'Read-only bank sync',
    description:
      'SimpleFIN shows accounts and transactions. Uncertain categories wait in a review inbox. The app does not move money.',
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10 border-indigo-500/20',
  },
  {
    icon: Users,
    title: 'Two households',
    description:
      'Custody schedules, swap requests, a medication dose log, and a weekly digest for co-parents. A tone check can rewrite a draft before you send it yourself.',
    color: 'text-rose-400',
    bg: 'bg-rose-500/10 border-rose-500/20',
  },
  {
    icon: GraduationCap,
    title: 'School and routines',
    description:
      'Paste or photograph a school note, then confirm the dates before they land on the family list. Shared routines and streaks sit next to homework.',
    color: 'text-teal-400',
    bg: 'bg-teal-500/10 border-teal-500/20',
  },
  {
    icon: Trophy,
    title: 'Points and a leaderboard',
    description:
      'Completed chores keep a streak and add points. There is a family leaderboard and a small arcade. Points are not awarded for a scan you have not saved.',
    color: 'text-pink-400',
    bg: 'bg-pink-500/10 border-pink-500/20',
  },
  {
    icon: Home,
    title: 'Your Home Assistant',
    description:
      'An admin can connect the household’s own instance. Authorized members can run allowlisted devices and open connected cameras. A daily check shows whether that snapshot is still fresh.',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10 border-orange-500/20',
  },
  {
    icon: Brain,
    title: 'Shared household notes',
    description:
      'Tasks, promises, emotion check-ins, and notes you ask Hermes to remember are visible to the household. They are not a private journal.',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10 border-violet-500/20',
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="px-4 py-16 max-w-5xl mx-auto">
      <div className="text-center max-w-2xl mx-auto mb-10">
        <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight font-display">What is in the app</h2>
        <p className="text-sm sm:text-base text-slate-300 mt-3 leading-relaxed">
          These are the tools in FamilyOS today. Bank, calendar, Gmail, and Home Assistant stay off until an admin connects them.
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
