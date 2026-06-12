'use client';

import { Sparkles, CheckSquare, ShoppingCart, UtensilsCrossed, Wallet, Cpu, MapPin, CalendarDays, Image, Video, Package, Camera, Gift, Gamepad2, MessageCircle, Home } from 'lucide-react';
import Link from 'next/link';

const features = [
  {
    icon: CheckSquare,
    color: 'bg-orange-500',
    title: 'Tasks & Missions',
    desc: 'Assign chores and tasks to family members. Kids earn points for completing missions. Track progress in real time across everyone in the household.',
  },
  {
    icon: Wallet,
    color: 'bg-emerald-600',
    title: 'Budget & Banking',
    desc: 'Connect bank accounts via Plaid to see real spending. View transaction history, breakdowns by category, and automatically detect recurring subscriptions.',
  },
  {
    icon: Cpu,
    color: 'bg-violet-600',
    title: 'Hermes AI Assistant',
    desc: 'A family-aware AI assistant that knows your schedule, tasks, meals, and budget. Ask it anything about your household and get smart, contextual answers.',
  },
  {
    icon: CalendarDays,
    color: 'bg-blue-600',
    title: 'Family Calendar',
    desc: 'Sync with Google Calendar to see every family member\'s events in one place. Add shared events, track appointments, and never miss anything.',
  },
  {
    icon: UtensilsCrossed,
    color: 'bg-rose-600',
    title: 'Meal Planning',
    desc: 'Plan dinners for the whole week, browse a recipe library, and automatically generate a shopping list from your meal plan.',
  },
  {
    icon: ShoppingCart,
    color: 'bg-yellow-500',
    title: 'Shopping Lists',
    desc: 'Shared grocery and shopping lists that sync instantly across all family members. Check items off from any device.',
  },
  {
    icon: MapPin,
    color: 'bg-rose-500',
    title: 'Home Map',
    desc: 'Upload your house floorplan and pin tasks to specific rooms. Visualize what needs to be done where across your entire home.',
  },
  {
    icon: Package,
    color: 'bg-amber-600',
    title: 'Pantry & Inventory',
    desc: 'Track what\'s in your pantry and household inventory. Scan barcodes to add items quickly and know what you\'re running low on.',
  },
  {
    icon: MessageCircle,
    color: 'bg-indigo-500',
    title: 'Family Messaging',
    desc: 'An internal chat just for your household. No social media noise — just direct communication between family members.',
  },
  {
    icon: Image,
    color: 'bg-pink-500',
    title: 'Photo Gallery',
    desc: 'A private shared photo gallery for the family. Keep your memories in one place, accessible to everyone in the household.',
  },
  {
    icon: Video,
    color: 'bg-cyan-600',
    title: 'Video Calls',
    desc: 'Built-in video calling so family members can connect face to face from anywhere, without needing a third-party app.',
  },
  {
    icon: Gift,
    color: 'bg-purple-500',
    title: 'Rewards System',
    desc: 'Kids earn points for completing tasks and missions. Redeem points for rewards set by parents. Makes household responsibilities engaging.',
  },
  {
    icon: Camera,
    color: 'bg-slate-500',
    title: 'Barcode Scanner',
    desc: 'Scan any product barcode to instantly add it to your shopping list or pantry inventory. AI identifies items automatically.',
  },
  {
    icon: Gamepad2,
    color: 'bg-teal-600',
    title: 'Family Games',
    desc: 'Fun mini-games the whole family can play together. A break from the productivity — built right into the household OS.',
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#020817] text-white">

      {/* Header */}
      <header className="border-b border-slate-800 bg-[#020817]/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-xs font-black">FO</div>
            <span className="font-bold text-white">Dysfunction Junction</span>
          </div>
          <Link href="/login" className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors">
            Sign In
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 py-24 text-center">
        <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Home className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-5xl font-bold text-white mb-4 leading-tight">
          Your Family, <span className="text-indigo-400">Organized.</span>
        </h1>
        <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Dysfunction Junction is a private family operating system. Manage tasks, budget, meals, shopping, calendars, and communication — all in one place, just for your household.
        </p>
        <div className="flex items-center justify-center gap-2 mt-6 text-slate-500 text-sm">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <span>Private &amp; invite-only — for family members only</span>
        </div>
      </section>

      {/* Features grid */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <h2 className="text-2xl font-bold text-white text-center mb-12">Everything your household needs</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col gap-3">
                <div className={`w-10 h-10 ${f.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">{f.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8 text-center text-slate-600 text-sm">
        <p>Dysfunction Junction — Private family household OS. Not available to the public.</p>
        <p className="mt-1">Access is by invitation only for authorized family members.</p>
        <div className="flex items-center justify-center gap-4 mt-4">
          <Link href="/privacy" className="hover:text-slate-400 transition-colors">Privacy Policy</Link>
          <span>·</span>
          <Link href="/terms" className="hover:text-slate-400 transition-colors">Terms of Service</Link>
        </div>
      </footer>

    </div>
  );
}
