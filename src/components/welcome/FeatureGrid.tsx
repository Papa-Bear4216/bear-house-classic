import { MessageCircle, Camera, Landmark, Video, Brain, Zap } from 'lucide-react';

const FEATURES = [
  {
    icon: Zap,
    title: 'ADHD Anti-Paralysis Focus Mode',
    description:
      "When you're overwhelmed by 20 chores, Focus Mode picks ONE bite-sized win with a visual countdown timer and instant celebratory dopamine.",
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
  },
  {
    icon: MessageCircle,
    title: 'Hermes, your AI Copilot',
    description:
      "Ask it anything by voice or chat. Hermes tracks chores, auto-sorts groceries, pays bills, and manages smart devices without mental strain.",
    color: 'text-sky-400',
    bg: 'bg-sky-500/10 border-sky-500/20',
  },
  {
    icon: Camera,
    title: 'Chore Vision Scanner',
    description:
      "Can't figure out where to start cleaning? Point your camera at a messy counter or room and let Gemini Nano create the task checklist for you.",
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
  },
  {
    icon: Landmark,
    title: 'Zero-Spreadsheet Finances',
    description:
      'Bank sync via SimpleFIN, automated bill tracking, and recurring cost alerts so nothing catches you off guard.',
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10 border-indigo-500/20',
  },
  {
    icon: Video,
    title: 'Home Cameras & Sensor Hub',
    description: 'Check in on the nursery, living room, and front porch in one tap, seamlessly connected via Home Assistant.',
    color: 'text-pink-400',
    bg: 'bg-pink-500/10 border-pink-500/20',
  },
  {
    icon: Brain,
    title: 'Household Brain Memory',
    description:
      'The app learns your family’s routines, preferences, and quirks, so everyone stays aligned without repetitive nagging.',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10 border-orange-500/20',
  },
];

export function FeatureGrid() {
  return (
    <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 px-4 py-12 max-w-5xl mx-auto">
      {FEATURES.map((f) => (
        <div
          key={f.title}
          className="bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/10 hover:border-white/20 rounded-3xl p-6 flex flex-col gap-3.5 backdrop-blur-xl shadow-xl hover:scale-[1.02] transition-all duration-300"
        >
          <div className={`w-12 h-12 rounded-2xl ${f.bg} border flex items-center justify-center flex-shrink-0`}>
            <f.icon className={`w-6 h-6 ${f.color}`} />
          </div>
          <h3 className="text-white font-bold text-lg font-display">{f.title}</h3>
          <p className="text-sm text-slate-300 leading-relaxed">{f.description}</p>
        </div>
      ))}
    </section>
  );
}