import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Hero } from '@/components/welcome/Hero';
import { AppMockupShowcase } from '@/components/welcome/AppMockupShowcase';
import { FeatureGrid } from '@/components/welcome/FeatureGrid';
import { FamilyRoles } from '@/components/welcome/FamilyRoles';
import { signInWithGoogle } from '@/lib/householdAuth';
import { Flame } from 'lucide-react';

const STEPS = [
  {
    step: '1',
    title: 'Sign in with Google',
    body: 'Create a household or accept an invite. Inviting a child asks a guardian to confirm consent first.',
  },
  {
    step: '2',
    title: 'Use the household list',
    body: 'Chores, routines, custody, medications, school notes, and rewards work without a bank or a smart home.',
  },
  {
    step: '3',
    title: 'Connect only what you want',
    body: 'An admin can add SimpleFIN, Google Calendar, Gmail, or a Home Assistant instance. Each one stays disconnected until that happens.',
  },
  {
    step: '4',
    title: 'Start the 7-day trial',
    body: 'A new household goes to checkout after setup. The trial is 7 days, and a card is not required to start it.',
  },
];

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

      <section id="how-it-works" className="px-4 py-8 max-w-5xl mx-auto relative z-10">
        <h2 className="text-3xl font-black text-white text-center font-display mb-8">How a household starts</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map((s) => (
            <div key={s.step} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <div className="text-amber-300 text-xs font-bold mb-2">Step {s.step}</div>
              <h3 className="text-white font-bold mb-2">{s.title}</h3>
              <p className="text-sm text-slate-300 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <AppMockupShowcase />
      <FeatureGrid />
      <FamilyRoles />

      <section id="pricing" className="px-4 py-8 max-w-xl mx-auto relative z-10">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">
          <h2 className="text-2xl font-bold text-white font-display mb-2">Pricing</h2>
          <p className="text-sm text-slate-300 mb-6">One plan. A new household starts with a 7-day trial.</p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-white">$9.99</span>
            <span className="text-slate-400">/month after the trial</span>
          </div>
          <p className="text-sm text-slate-300 mt-3">Includes up to 3 household members.</p>
          <p className="text-sm text-slate-300 mt-1">Each additional member is $2.99/month. Pets are not billed as seats.</p>
          <ul className="mt-6 space-y-2 text-sm text-slate-300">
            <li>Chores, routines, custody, health log, school notes, and Hermes chat</li>
            <li>Read-only SimpleFIN, and one Home Assistant connection if you add it</li>
            <li>Cancel from the billing portal</li>
          </ul>
          <Button
            onClick={() => signInWithGoogle()}
            className="mt-6 w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
          >
            Sign in with Google
          </Button>
        </div>
      </section>

      <section className="text-center px-4 py-20 relative z-10">
        <div className="max-w-xl mx-auto p-8 rounded-3xl bg-gradient-to-b from-white/[0.04] to-transparent border border-white/10 backdrop-blur-xl shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto mb-4">
            <Flame className="w-6 h-6 animate-pulse" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white font-display mb-2">Sign in and set up the household</h2>
          <p className="text-sm text-slate-300 mb-6 max-w-sm mx-auto">
            Google sign-in, then a household name. New households start a 7-day trial.
          </p>
          <Button
            size="lg"
            onClick={() => signInWithGoogle()}
            className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold px-8 py-6 rounded-2xl shadow-xl shadow-amber-500/25 transition active:scale-[0.98]"
          >
            Sign in with Google
          </Button>
        </div>
      </section>

      {/* Clever Footer */}
      <footer className="text-center py-12 px-4 border-t border-white/5 text-xs text-slate-500 relative z-10 space-y-3">
        <p className="flex items-center justify-center gap-2 font-semibold text-slate-300">
          <span>🚂</span>
          <span>HotMessExpress is a <strong className="text-amber-400">Dysfunction Junction</strong> venture.</span>
        </p>
        <p className="text-[11px] text-slate-500 max-w-md mx-auto leading-relaxed">
          FamilyOS for one household or two. You confirm scans, messages, and device actions before they happen.
        </p>
        <div className="flex items-center justify-center gap-4 text-[11px] text-slate-400 pt-2">
          <Link to="/privacy" className="hover:text-amber-400 transition underline underline-offset-2">
            Privacy Policy
          </Link>
          <span>&bull;</span>
          <Link to="/terms" className="hover:text-amber-400 transition underline underline-offset-2">
            Terms of Service
          </Link>
          <span>&bull;</span>
          <a href="mailto:support@dysfunctionjunction.xyz" className="hover:text-amber-400 transition">
            Contact Support
          </a>
        </div>
      </footer>
    </div>
  );
}