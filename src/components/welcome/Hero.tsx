import { Button } from '@/components/ui/button';
import { signInWithGoogle } from '@/lib/householdAuth';
import {
  Zap,
  CalendarDays,
  Sparkles,
  PawPrint,
} from 'lucide-react';

export function Hero() {
  return (
    <section className="relative flex flex-col items-center text-center gap-6 px-4 pt-16 pb-14 max-w-4xl mx-auto">
      {/* Warm playful glow orbs */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 w-[30rem] h-[30rem] rounded-full bg-gradient-to-tr from-amber-500/15 via-pink-500/10 to-cyan-500/15 blur-3xl pointer-events-none" />

      {/* Pill badge */}
      <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-white/5 border border-amber-400/30 text-xs font-semibold text-amber-200 shadow-lg shadow-amber-500/10 backdrop-blur-md relative z-10 hover:border-amber-300/60 transition">
        <span className="text-base">🚂</span>
        <span>
          HotMessExpress <span className="text-slate-400 font-normal">· A proud product of</span>{' '}
          <span className="text-white font-bold underline decoration-pink-400/60 decoration-wavy underline-offset-4">
            Dysfunction Junction
          </span>
        </span>
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping ml-0.5" />
      </div>

      <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-400 via-pink-500 to-violet-600 flex items-center justify-center text-4xl shadow-xl shadow-pink-500/30 ring-4 ring-white/15 relative z-10">
        🚂
      </div>

      <h1 className="text-4xl sm:text-6xl font-extrabold text-white leading-[1.08] tracking-tight font-display relative z-10">
        Family life is a mess.{' '}
        <span className="bg-gradient-to-r from-amber-300 via-pink-400 to-cyan-300 bg-clip-text text-transparent">
          Running the house doesn't have to be.
        </span>
      </h1>

      <p className="text-base sm:text-lg text-slate-300 max-w-2xl relative z-10 leading-relaxed">
        An ADHD-friendly Family OS built for real households — turning chores into quick wins for parents and a{' '}
        <strong className="text-pink-300">Monster Den + 120Hz Arcade</strong> kids actually want to open.
        Need two-home coordination? Flip on{' '}
        <strong className="text-cyan-300">optional Co-Parenting Mode</strong> anytime.
      </p>

      {/* 4 Crisp Value Pillars */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full max-w-3xl relative z-10 text-left">
        <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-400/25 backdrop-blur-md">
          <div className="flex items-center gap-1.5 text-amber-300 text-xs font-extrabold">
            <Zap className="w-3.5 h-3.5 fill-current" /> ADHD Focus
          </div>
          <p className="text-[11px] text-slate-300 mt-1">Bento dashboard, AI room scanner &amp; 5-min timers</p>
        </div>
        <div className="p-3 rounded-2xl bg-pink-500/10 border border-pink-400/25 backdrop-blur-md">
          <div className="flex items-center gap-1.5 text-pink-300 text-xs font-extrabold">
            <Sparkles className="w-3.5 h-3.5" /> Kids Zone
          </div>
          <p className="text-[11px] text-slate-300 mt-1">Kids monster den &amp; voice translator + sealed journal</p>
        </div>
        <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-400/25 backdrop-blur-md">
          <div className="flex items-center gap-1.5 text-emerald-300 text-xs font-extrabold">
            <PawPrint className="w-3.5 h-3.5" /> Daily Home
          </div>
          <p className="text-[11px] text-slate-300 mt-1">“Who Fed the Dog?” pet logs, meals, meds &amp; bills</p>
        </div>
        <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-400/25 backdrop-blur-md">
          <div className="flex items-center gap-1.5 text-cyan-300 text-xs font-extrabold">
            <CalendarDays className="w-3.5 h-3.5" /> Optional Co-Parenting toggle
          </div>
          <p className="text-[11px] text-slate-300 mt-1">Off by default — turn on custody &amp; BIFF anytime</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3.5 pt-2 relative z-10">
        <Button
          size="lg"
          onClick={() => signInWithGoogle()}
          className="bg-gradient-to-r from-amber-400 via-pink-500 to-violet-600 hover:from-amber-300 hover:via-pink-400 hover:to-violet-500 text-white font-extrabold px-8 py-6 rounded-2xl shadow-xl shadow-pink-500/25 transition active:scale-[0.98]"
        >
          Sign in with Google
        </Button>
        <a href="#demo">
          <Button size="lg" variant="outline" className="border-slate-700 bg-slate-900/70 hover:bg-slate-800/90 text-white font-semibold px-7 py-6 rounded-2xl">
            🕹️ Try Interactive Demo
          </Button>
        </a>
        <a href="#pricing">
          <Button size="lg" variant="ghost" className="text-slate-300 hover:text-white font-semibold px-5 py-6 rounded-2xl">
            See pricing
          </Button>
        </a>
      </div>
      <p className="text-xs text-slate-400 relative z-10">Google sign-in · 7-day free trial (no card needed) · Pets are always free · Zero ad tracking</p>
    </section>
  );
}