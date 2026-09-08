import { MessageCircle, Camera, Landmark, Video, Brain } from 'lucide-react';

const FEATURES = [
  {
    icon: MessageCircle,
    title: 'Hermes, your AI assistant',
    description:
      "Ask it anything. Hermes handles tasks, bills, and shopping lists so you don't have to hold it all in your head.",
    color: 'text-indigo-400',
  },
  {
    icon: Camera,
    title: 'Chore Scanner',
    description:
      "Stare at a messy room, or point your camera at it and let AI find what needs doing — no more not knowing where to start.",
    color: 'text-emerald-400',
  },
  {
    icon: Landmark,
    title: 'Finance Hub',
    description:
      'Bank sync via SimpleFIN, auto-categorized spending, and recurring bill detection — without spreadsheets.',
    color: 'text-blue-400',
  },
  {
    icon: Video,
    title: 'Home cameras, built in',
    description: 'Check in on the house right from your dashboard, powered by Home Assistant.',
    color: 'text-pink-400',
  },
  {
    icon: Brain,
    title: 'Household Memory',
    description:
      'The app remembers preferences, routines, and context, so every family member (and Hermes) stays on the same page.',
    color: 'text-amber-400',
  },
];

export function FeatureGrid() {
  return (
    <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 px-4 py-16 max-w-5xl mx-auto">
      {FEATURES.map((f) => (
        <div key={f.title} className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col gap-3">
          <f.icon className={`w-8 h-8 ${f.color}`} />
          <h3 className="text-white font-semibold">{f.title}</h3>
          <p className="text-sm text-slate-400">{f.description}</p>
        </div>
      ))}
    </section>
  );
}