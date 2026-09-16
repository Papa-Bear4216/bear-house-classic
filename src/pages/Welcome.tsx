import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Hero } from '@/components/welcome/Hero';
import { AppMockupShowcase } from '@/components/welcome/AppMockupShowcase';
import { FeatureGrid } from '@/components/welcome/FeatureGrid';
import { FamilyRoles } from '@/components/welcome/FamilyRoles';
import { Sparkles, Flame } from 'lucide-react';

export default function Welcome() {
  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 relative overflow-x-hidden selection:bg-amber-500 selection:text-slate-950">
      {/* Ambient background glows */}
      <div className="fixed -top-40 -right-40 w-96 h-96 rounded-full bg-amber-500/[0.08] blur-[140px] pointer-events-none" />
      <div className="fixed top-1/2 -left-40 w-96 h-96 rounded-full bg-indigo-500/[0.08] blur-[140px] pointer-events-none" />
      <div className="fixed -bottom-40 right-1/4 w-96 h-96 rounded-full bg-rose-500/[0.06] blur-[140px] pointer-events-none" />

      {/* Top Banner: HotMessExpress — A Product of Dysfunction Junction */}
      <aside aria-label="Product attribution" className="w-full bg-gradient-to-r from-amber-500/10 via-purple-500/15 to-rose-500/10 border-b border-amber-500/20 backdrop-blur-xl px-4 py-2.5 text-center relative z-20">
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-2 flex-wrap text-xs">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-extrabold text-[10px] tracking-wider uppercase shadow-sm">
            🚂 Junction Dispatch
          </span>
          <span className="text-slate-200 font-medium">
            <strong className="text-white font-black">HotMessExpress</strong> — Proudly engineered at{' '}
            <span className="bg-gradient-to-r from-amber-300 via-orange-300 to-rose-300 bg-clip-text text-transparent font-black tracking-tight">
              Dysfunction Junction
            </span>
            .
          </span>
          <span className="text-slate-400 hidden md:inline font-normal">
            Keeping high-speed chaotic households mostly on the rails.
          </span>
        </div>
      </aside>

      <Hero />
      <AppMockupShowcase />
      <FeatureGrid />
      <FamilyRoles />

      <section className="text-center px-4 py-20 relative z-10">
        <div className="max-w-xl mx-auto p-8 rounded-3xl bg-gradient-to-b from-white/[0.04] to-transparent border border-white/10 backdrop-blur-xl shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto mb-4">
            <Flame className="w-6 h-6 animate-pulse" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white font-display mb-2">Ready to tame the Hot Mess Express?</h2>
          <p className="text-sm text-slate-300 mb-6 max-w-sm mx-auto">
            Stop letting executive dysfunction run the house. Sync your household today.
          </p>
          <Link to="/login">
            <Button size="lg" className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold px-8 py-6 rounded-2xl shadow-xl shadow-amber-500/25 transition active:scale-[0.98]">
              <Sparkles className="w-5 h-5 mr-2" /> Hop on the Hot Mess Express
            </Button>
          </Link>
        </div>
      </section>

      {/* Clever Footer */}
      <footer className="text-center py-12 px-4 border-t border-white/5 text-xs text-slate-500 relative z-10 space-y-2">
        <p className="flex items-center justify-center gap-2 font-semibold text-slate-300">
          <span>🚂</span>
          <span>HotMessExpress is a <strong className="text-amber-400">Dysfunction Junction</strong> venture.</span>
        </p>
        <p className="text-[11px] text-slate-500 max-w-md mx-auto leading-relaxed">
          Crafted with caffeine, neurodivergence, and zero spreadsheets. Because normal brains are boring.
        </p>
      </footer>
    </div>
  );
}