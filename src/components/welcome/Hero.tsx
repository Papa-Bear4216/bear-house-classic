import { Button } from '@/components/ui/button';
import { signInWithGoogle } from '@/lib/householdAuth';
import {
  Zap,
  HeartHandshake,
  CalendarDays,
  Pill,
  GraduationCap,
  Camera,
  DoorOpen,
  Sparkles,
  PawPrint,
  LayoutDashboard,
  Pin,
  ShieldCheck,
} from 'lucide-react';

export function Hero() {
  return (
    <section className="relative flex flex-col items-center text-center gap-6 px-4 pt-20 pb-16 max-w-3xl mx-auto">
      {/* Glow orb */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

      {/* Pill badge */}
      <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-white/5 border border-cyan-500/30 text-xs font-semibold text-cyan-300 shadow-lg shadow-cyan-500/10 backdrop-blur-md relative z-10 hover:border-cyan-400/50 transition">
        <span className="text-base">🚂</span>
        <span>
          HotMessExpress <span className="text-slate-400 font-normal">· A proud product of</span>{' '}
          <span className="text-white font-bold underline decoration-cyan-400/50 decoration-wavy underline-offset-4">
            Dysfunction Junction
          </span>
        </span>
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping ml-0.5" />
      </div>

      <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-4xl shadow-xl shadow-cyan-500/25 ring-4 ring-white/10 relative z-10">
        🚂
      </div>

      <h1 className="text-4xl sm:text-6xl font-extrabold text-white leading-[1.1] tracking-tight font-display relative z-10">
        Divorce is a mess.{' '}
        <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-400 bg-clip-text text-transparent">
          The logistics don't have to be.
        </span>
      </h1>

      <p className="text-base sm:text-lg text-slate-300 max-w-xl relative z-10 leading-relaxed">
        One kid, two houses, one life. HotMessExpress brings calm to everyday chaos: a 6-card Bento Grid ADHD dashboard, an AI room chore scanner that turns disaster zones into quick wins, custom split-routine custody schedules (bedtime & wake-up vs after-school handoffs with ROFR rules), floating popup Bulletin Board, safe medication handoffs, Kids World monster companions with voice translators, real-time pet feeding logs, customizable kid rooms with sealed private journals, and read-only bank sync. All guarded by a built-in BIFF tone check and Triad Fusion isolation so nobody sends a text they'll regret.
      </p>

      {/* Micro-feature highlights */}
      <div className="flex flex-wrap items-center justify-center gap-2.5 relative z-10 text-xs text-slate-300">
        <span className="px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 flex items-center gap-1.5">
          <LayoutDashboard className="w-3.5 h-3.5 text-cyan-400" /> Bento ADHD focus dashboard
        </span>
        <span className="px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 flex items-center gap-1.5">
          <Camera className="w-3.5 h-3.5 text-cyan-400" /> AI room chore scanner
        </span>
        <span className="px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-cyan-300" /> Kids monster den & voice translator
        </span>
        <span className="px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 flex items-center gap-1.5">
          <PawPrint className="w-3.5 h-3.5 text-emerald-400" /> “Who Fed the Dog?” pet logs
        </span>
        <span className="px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 flex items-center gap-1.5">
          <DoorOpen className="w-3.5 h-3.5 text-purple-400" /> Kid rooms & sealed journal
        </span>
        <span className="px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-cyan-400 fill-current" /> One next chore (ADHD focus)
        </span>
        <span className="px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 flex items-center gap-1.5">
          <HeartHandshake className="w-3.5 h-3.5 text-rose-400" /> BIFF tone check
        </span>
        <span className="px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5 text-cyan-400" /> Custody & calm swaps
        </span>
        <span className="px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 flex items-center gap-1.5">
          <Pin className="w-3.5 h-3.5 text-amber-400" /> Popup bulletin board
        </span>
        <span className="px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 flex items-center gap-1.5">
          <Pill className="w-3.5 h-3.5 text-sky-400" /> Medication dose safety
        </span>
        <span className="px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 flex items-center gap-1.5">
          <GraduationCap className="w-3.5 h-3.5 text-teal-400" /> School flyer triage
        </span>
        <span className="px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" /> Triad Fusion quarantine
        </span>
      </div>

      <div className="flex flex-wrap gap-3.5 pt-2 relative z-10">
        <Button
          size="lg"
          onClick={() => signInWithGoogle()}
          className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold px-8 py-6 rounded-2xl shadow-xl shadow-cyan-500/25 transition active:scale-[0.98]"
        >
          Sign in with Google
        </Button>
        <a href="#pricing">
          <Button size="lg" variant="outline" className="border-slate-800 bg-slate-900/60 hover:bg-slate-800/80 text-white font-semibold px-8 py-6 rounded-2xl">
            See pricing
          </Button>
        </a>
      </div>
      <p className="text-xs text-slate-500 relative z-10">Google sign-in. 7-day trial with no card required. Zero ad tracking.</p>
    </section>
  );
}