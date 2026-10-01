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
    body: 'Create your household or join via invite link. Inviting a kid under 13 asks a guardian to confirm consent first so their privacy stays locked down.',
  },
  {
    step: '2',
    title: 'Get the basics rolling',
    body: 'Chores, morning routines, custody calendar, medication safety logs, and school notes work right away with zero complex setup.',
  },
  {
    step: '3',
    title: 'Connect only what you want',
    body: 'Optional: Link read-only bank sync with SimpleFIN, your Google Calendar, or Home Assistant scenes. Everything stays off until you turn it on.',
  },
  {
    step: '4',
    title: 'Take 7 days on us',
    body: 'Every new household starts with a full 7-day trial. No credit card required upfront, no sneaky auto-charges, and cancel anytime in two clicks.',
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
        <h2 className="text-3xl font-black text-white text-center font-display mb-8">How your household gets started</h2>
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
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl backdrop-blur-xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs font-semibold text-amber-300 mb-4">
            <span>✨</span> Honest Family Pricing
          </div>
          <h2 className="text-2xl font-bold text-white font-display mb-2">One simple plan</h2>
          <p className="text-sm text-slate-300 mb-6">
            Free covers the basics. Premium keeps the lights on and the kids' space growing without ad trackers or data brokers.
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-white">$9.99</span>
            <span className="text-slate-400 font-medium">/month after your 7-day trial</span>
          </div>
          <p className="text-sm text-slate-300 mt-3 font-semibold">Includes up to 3 household members across both homes.</p>
          <p className="text-sm text-slate-400 mt-1">Each additional member is $2.99/month. Pets are always 100% free.</p>
          <div className="my-6 border-t border-white/10 pt-6">
            <ul className="space-y-2.5 text-sm text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">✓</span> Two-household custody calendar, calm swaps & weekly digests
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">✓</span> Cross-home medication dosing log & allergy alerts
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">✓</span> Hermes BIFF tone check to stop tense texts before they send
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">✓</span> School Stuff Adder for backpack flyers & teacher emails
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">✓</span> ADHD-friendly One Next Chore, routines, streaks & retro arcade
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">✓</span> Read-only SimpleFIN bank sync with compounding review queue
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">✓</span> Home Assistant allowlist & COPPA verifiable child privacy
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">✓</span> No contracts, no card needed for trial, cancel in two clicks
              </li>
            </ul>
          </div>
          <Button
            onClick={() => signInWithGoogle()}
            className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold py-6 rounded-2xl shadow-xl shadow-amber-500/25 transition active:scale-[0.98]"
          >
            Start 7-Day Free Trial
          </Button>
          <p className="text-xs text-center text-slate-500 mt-3">No credit card required to start your trial.</p>
        </div>
      </section>

      <section className="text-center px-4 py-20 relative z-10">
        <div className="max-w-xl mx-auto p-8 rounded-3xl bg-gradient-to-b from-white/[0.04] to-transparent border border-white/10 backdrop-blur-xl shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto mb-4">
            <Flame className="w-6 h-6 animate-pulse" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white font-display mb-2">Ready to bring calm to the chaos?</h2>
          <p className="text-sm text-slate-300 mb-6 max-w-sm mx-auto">
            Sign in with Google, name your household, and invite your crew. 7-day free trial, no card needed.
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
          FamilyOS for one household or two. One kid, two houses, one life. You confirm all scans, drafts, and device actions before they happen.
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