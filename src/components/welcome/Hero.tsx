import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Sparkles, Zap, Flame, Camera, Bot, Trophy } from 'lucide-react';

export function Hero() {
  return (
    <section className="relative flex flex-col items-center text-center gap-6 px-4 pt-20 pb-16 max-w-3xl mx-auto">
      {/* Glow orb */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

      {/* Pill badge */}
      <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-white/5 border border-amber-500/30 text-xs font-semibold text-amber-300 shadow-lg shadow-amber-500/10 backdrop-blur-md relative z-10 hover:border-amber-400/50 transition">
        <span className="text-base">🚂</span>
        <span>
          HotMessExpress <span className="text-slate-400 font-normal">· A proud product of</span>{' '}
          <span className="text-white font-bold underline decoration-amber-400/50 decoration-wavy underline-offset-4">
            Dysfunction Junction
          </span>
        </span>
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping ml-0.5" />
      </div>

      <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-4xl shadow-xl shadow-amber-500/25 ring-4 ring-white/10 relative z-10">
        🐻
      </div>

      <h1 className="text-4xl sm:text-6xl font-extrabold text-white leading-[1.1] tracking-tight font-display relative z-10">
        Household Chaos, <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 bg-clip-text text-transparent">Tamed</span>.
        <br />
        Dopamine, <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">Unlocked</span>.
      </h1>

      <p className="text-base sm:text-lg text-slate-300 max-w-xl relative z-10 leading-relaxed">
        FamilyOS remembers what your brain won't — chores, bills, promises, and who's supposed to walk the dog. Built from the ground up to be ADHD-friendly, fun, and impossible to forget.
      </p>

      {/* Micro-feature highlights */}
      <div className="flex flex-wrap items-center justify-center gap-2.5 relative z-10 text-xs text-slate-300">
        <span className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-amber-400 fill-current" /> 1-Thing Focus Mode
        </span>
        <span className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 flex items-center gap-1.5">
          <Bot className="w-3.5 h-3.5 text-sky-400" /> Hermes AI Copilot
        </span>
        <span className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 flex items-center gap-1.5">
          <Camera className="w-3.5 h-3.5 text-emerald-400" /> AI Chore Scanner
        </span>
        <span className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5 text-pink-400" /> Arcade & Rewards
        </span>
      </div>

      <div className="flex flex-wrap gap-3.5 pt-2 relative z-10">
        <Link to="/login">
          <Button size="lg" className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold px-8 py-6 rounded-2xl shadow-xl shadow-amber-500/25 transition active:scale-[0.98]">
            <Sparkles className="w-5 h-5 mr-2" /> Get Started
          </Button>
        </Link>
        <Link to="/login">
          <Button size="lg" variant="outline" className="border-white/15 bg-white/5 hover:bg-white/10 text-white font-semibold px-8 py-6 rounded-2xl">
            Log In
          </Button>
        </Link>
      </div>
    </section>
  );
}