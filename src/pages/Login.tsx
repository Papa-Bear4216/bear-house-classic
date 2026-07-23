import { signInWithGoogle } from '@/lib/householdAuth';
import LandingDemoCard from '@/components/familyos/LandingDemoCard';
import LandingPhoneMockup from '@/components/familyos/LandingPhoneMockup';
import logo from '@/assets/familyos-logo.svg';
import '@/styles/landing.css';
import {
  Sparkles, MessageCircleHeart, PiggyBank, Camera, ListChecks,
  HeartHandshake, CloudSun,
} from 'lucide-react';

const HOW_IT_WORKS = [
  {
    icon: Sparkles,
    tile: 'var(--sage-100)',
    tint: 'var(--sage-600)',
    step: 'STEP 1',
    title: 'Connect your household',
    body: 'Link your bank, your smart home, and your family’s calendar — takes a few minutes, once.',
  },
  {
    icon: MessageCircleHeart,
    tile: 'rgba(0,112,192,0.12)',
    tint: 'var(--sky-500)',
    step: 'STEP 2',
    title: 'Hermes organizes it',
    body: 'Your AI assistant turns raw data — transactions, chores, camera events — into things you can act on.',
  },
  {
    icon: ListChecks,
    tile: 'var(--honey-100)',
    tint: 'var(--honey-600)',
    step: 'STEP 3',
    title: 'One focused view',
    body: 'A single daily briefing instead of six apps. See what matters today, not everything at once.',
  },
  {
    icon: HeartHandshake,
    tile: 'rgba(192,32,160,0.12)',
    tint: 'var(--berry-600)',
    step: 'STEP 4',
    title: 'The whole house stays in sync',
    body: 'Chores, promises, and plans update in real time for everyone — no group texts required.',
  },
];

const FEATURES = [
  { icon: MessageCircleHeart, title: 'Hermes AI chat', body: 'Ask it anything about your household — schedules, spending, chores — and get a real answer.' },
  { icon: PiggyBank, title: 'Bank sync', body: 'Secure, read-only account sync — balances, transactions, and spending trends, always current.' },
  { icon: Camera, title: 'Smart home cameras', body: 'Check every connected camera and system health from one screen, no separate app.' },
  { icon: ListChecks, title: 'Chore & receipt scanning', body: 'Snap a photo — chores get logged and credited, receipts get categorized automatically.' },
  { icon: HeartHandshake, title: 'Promises & quality time', body: 'A gentle pulse on commitments kept and time spent together, not just tasks done.' },
  { icon: CloudSun, title: 'Weather & daily briefings', body: 'A morning rundown of what matters today, so nothing slips through the cracks.' },
];

function GetStartedButton({
  variant = 'primary',
  className = '',
  children,
}: {
  variant?: 'primary' | 'ghost';
  className?: string;
  children: React.ReactNode;
}) {
  const base =
    'inline-flex items-center gap-2 rounded-[var(--radius-full)] font-bold text-[15px] px-7 py-3.5 transition-transform hover:-translate-y-0.5';
  const style =
    variant === 'primary'
      ? { background: 'var(--brand-primary)', color: '#fff', boxShadow: 'var(--shadow-brand)' }
      : { background: 'transparent', color: '#fff', border: '1.5px solid rgba(255,255,255,0.3)' };
  return (
    <button onClick={() => signInWithGoogle()} className={`${base} ${className}`} style={style}>
      {children}
    </button>
  );
}

export default function LoginPage() {
  return (
    <div className="bh-landing min-h-screen overflow-x-hidden">
      {/* NAV */}
      <div
        className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 backdrop-blur"
        style={{ background: 'rgba(255,253,249,0.9)', borderBottom: '1px solid var(--border-light)' }}
      >
        <img src={logo} alt="FamilyOS" className="h-[30px]" />
        <div className="flex items-center gap-7">
          <a href="#how-it-works" className="hidden sm:inline text-sm font-semibold" style={{ color: 'var(--fg-secondary)' }}>
            How it works
          </a>
          <a href="#features" className="hidden sm:inline text-sm font-semibold" style={{ color: 'var(--fg-secondary)' }}>
            Features
          </a>
          <a href="#pricing" className="hidden sm:inline text-sm font-semibold" style={{ color: 'var(--fg-secondary)' }}>
            Pricing
          </a>
          <button
            onClick={() => signInWithGoogle()}
            className="inline-flex items-center rounded-[var(--radius-full)] font-bold text-sm px-5 py-2.5"
            style={{ background: 'var(--brand-primary)', color: '#fff', boxShadow: 'var(--shadow-brand)' }}
          >
            Get started
          </button>
        </div>
      </div>

      {/* HERO */}
      <div className="relative px-8 pt-[88px] pb-24" style={{ background: 'var(--bark-700)' }}>
        <div
          className="bh-glow absolute -top-[140px] left-1/2 -translate-x-[42%] w-[720px] h-[720px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(224,140,0,0.35), transparent 70%)' }}
        />
        <div className="relative max-w-[1180px] mx-auto flex items-center gap-16 flex-wrap">
          <div className="bh-fade-up flex-1 min-w-[320px] basis-[460px]">
            <div
              className="inline-flex items-center gap-2 rounded-[var(--radius-full)] text-[13px] font-semibold px-3.5 py-1.5 mb-6"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: 'var(--honey-200)' }}
            >
              <Sparkles className="w-[15px] h-[15px]" />
              Built ADHD-first
            </div>
            <h1
              className="bh-font-display font-extrabold text-white mb-5"
              style={{ fontSize: 'clamp(36px, 4.6vw, 56px)', lineHeight: 1.08, letterSpacing: '-0.02em' }}
            >
              Your household,<br />actually running itself.
            </h1>
            <p className="text-lg leading-relaxed max-w-[460px] mb-8" style={{ color: 'rgba(255,248,238,0.72)' }}>
              FamilyOS brings your finances, your smart home, and your family's day-to-day
              into one place — with an AI assistant that keeps up so you don't have to.
            </p>
            <div className="flex gap-3.5 flex-wrap">
              <GetStartedButton variant="primary">Get started free</GetStartedButton>
              <a href="#demo">
                <GetStartedButton variant="ghost">See how it works</GetStartedButton>
              </a>
            </div>
          </div>
          <div className="bh-fade-up-delay flex-none flex justify-center scale-[0.82] origin-top">
            <LandingPhoneMockup />
          </div>
        </div>
      </div>

      {/* STATS STRIP */}
      <div className="px-8 py-14" style={{ background: 'var(--cream-50)', borderBottom: '1px solid var(--border-light)' }}>
        <div className="max-w-[1000px] mx-auto flex justify-between gap-8 flex-wrap text-center">
          <div className="flex-1 basis-[200px]">
            <div className="bh-font-display text-[40px] font-extrabold" style={{ color: 'var(--brand-primary)' }}>
              6-in-1
            </div>
            <div className="text-sm font-semibold mt-1.5" style={{ color: 'var(--fg-muted)' }}>
              finance, home, chores, and more — one app instead of six
            </div>
          </div>
          <div className="flex-1 basis-[200px]">
            <div className="bh-font-display text-[40px] font-extrabold" style={{ color: 'var(--brand-secondary)' }}>
              1 briefing
            </div>
            <div className="text-sm font-semibold mt-1.5" style={{ color: 'var(--fg-muted)' }}>
              a day — what matters, not everything that happened
            </div>
          </div>
          <div className="flex-1 basis-[200px]">
            <div className="bh-font-display text-[40px] font-extrabold" style={{ color: 'var(--brand-accent)' }}>
              instant
            </div>
            <div className="text-sm font-semibold mt-1.5" style={{ color: 'var(--fg-muted)' }}>
              answers from Hermes, and points the moment a chore's done
            </div>
          </div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div id="how-it-works" className="px-8 py-24" style={{ background: 'var(--cream-200)' }}>
        <div className="max-w-[1180px] mx-auto">
          <div className="text-center mb-14">
            <div className="text-[13px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--brand-primary)' }}>
              How it works
            </div>
            <h2
              className="bh-font-display font-extrabold max-w-[640px] mx-auto"
              style={{ fontSize: 'clamp(28px, 3vw, 38px)', color: 'var(--bark-700)' }}
            >
              From six scattered apps to one calm view.
            </h2>
          </div>
          <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {HOW_IT_WORKS.map((s) => (
              <div
                key={s.step}
                className="bg-white rounded-[var(--radius-lg)] p-7"
                style={{ border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-sm)' }}
              >
                <div
                  className="w-11 h-11 rounded-[var(--radius-md)] flex items-center justify-center mb-4"
                  style={{ background: s.tile, color: s.tint }}
                >
                  <s.icon className="w-[22px] h-[22px]" />
                </div>
                <div className="text-[13px] font-bold mb-1.5" style={{ color: 'var(--fg-muted)' }}>
                  {s.step}
                </div>
                <div className="bh-font-display font-bold text-lg mb-2" style={{ color: 'var(--bark-700)' }}>
                  {s.title}
                </div>
                <div className="text-sm leading-relaxed" style={{ color: 'var(--fg-secondary)' }}>
                  {s.body}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FEATURES */}
      <div id="features" className="px-8 py-24" style={{ background: 'var(--cream-50)' }}>
        <div className="max-w-[1180px] mx-auto">
          <div className="text-center mb-14">
            <div className="text-[13px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--brand-primary)' }}>
              Features
            </div>
            <h2
              className="bh-font-display font-extrabold max-w-[640px] mx-auto"
              style={{ fontSize: 'clamp(28px, 3vw, 38px)', color: 'var(--bark-700)' }}
            >
              Every part of home life, in one place.
            </h2>
          </div>
          <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-[var(--radius-lg)] p-6"
                style={{ border: '1px solid var(--border-light)', background: 'var(--cream-100)' }}
              >
                <f.icon className="w-[22px] h-[22px] mb-3.5" style={{ color: 'var(--honey-600)' }} />
                <div className="bh-font-display font-bold text-base mb-1.5" style={{ color: 'var(--bark-700)' }}>
                  {f.title}
                </div>
                <div className="text-sm leading-relaxed" style={{ color: 'var(--fg-secondary)' }}>
                  {f.body}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ANIMATED DEMO */}
      <div id="demo" className="px-8 py-24" style={{ background: 'var(--cream-200)' }}>
        <div className="max-w-[920px] mx-auto">
          <div className="text-center mb-12">
            <div className="text-[13px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--brand-primary)' }}>
              See it in action
            </div>
            <h2
              className="bh-font-display font-extrabold"
              style={{ fontSize: 'clamp(28px, 3vw, 38px)', color: 'var(--bark-700)' }}
            >
              Watch a chore go from steps to streak.
            </h2>
          </div>
          <LandingDemoCard />
        </div>
      </div>

      {/* PRICING */}
      <div id="pricing" className="px-8 py-24" style={{ background: 'var(--cream-50)' }}>
        <div className="max-w-[560px] mx-auto text-center">
          <div className="text-[13px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--brand-primary)' }}>
            Pricing
          </div>
          <h2 className="bh-font-display font-extrabold mb-2" style={{ fontSize: 'clamp(28px, 3vw, 38px)', color: 'var(--bark-700)' }}>
            Simple pricing
          </h2>
          <p style={{ color: 'var(--fg-muted)' }}>One plan. No tiers to compare.</p>

          <div
            className="mt-8 rounded-[var(--radius-xl)] p-8 text-left bg-white"
            style={{ border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-lg)' }}
          >
            <div className="flex items-baseline gap-2">
              <span className="bh-font-display text-4xl font-extrabold" style={{ color: 'var(--bark-700)' }}>
                $9.99
              </span>
              <span style={{ color: 'var(--fg-muted)' }}>/month</span>
            </div>
            <p className="mt-2 text-sm" style={{ color: 'var(--fg-muted)' }}>
              Covers up to 3 household members.
            </p>
            <div className="mt-4 pt-4 text-sm" style={{ borderTop: '1px solid var(--border-light)', color: 'var(--fg-muted)' }}>
              + $2.99/month for each additional member
            </div>
            <ul className="mt-6 space-y-2 text-sm" style={{ color: 'var(--fg-secondary)' }}>
              <li>&#10003; Everything in FamilyOS — finance, home, family tracking, AI assistant</li>
              <li>&#10003; Unlimited bank & smart home connections</li>
              <li>&#10003; Cancel anytime</li>
            </ul>
            <button
              onClick={() => signInWithGoogle()}
              className="w-full mt-8 rounded-[var(--radius-full)] font-bold text-[15px] py-3.5"
              style={{ background: 'var(--brand-primary)', color: '#fff', boxShadow: 'var(--shadow-brand)' }}
            >
              Get started
            </button>
          </div>
        </div>
      </div>

      {/* FINAL CTA */}
      <div id="get-started" className="relative px-8 py-24 text-center overflow-hidden" style={{ background: 'var(--bark-700)' }}>
        <div
          className="absolute -bottom-40 left-1/2 -translate-x-1/2 w-[640px] h-[640px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(224,140,0,0.3), transparent 70%)' }}
        />
        <div className="relative max-w-[560px] mx-auto">
          <h2 className="bh-font-display font-extrabold text-white mb-4" style={{ fontSize: 'clamp(28px, 3.4vw, 42px)' }}>
            Ready for a calmer house?
          </h2>
          <p className="text-base mb-8" style={{ color: 'rgba(255,248,238,0.7)' }}>
            Connect your first account in under a minute. Free to try for your household.
          </p>
          <div className="flex gap-3.5 justify-center flex-wrap">
            <GetStartedButton variant="primary">Get started free</GetStartedButton>
          </div>
          <div className="text-[13px] mt-4" style={{ color: 'rgba(255,248,238,0.5)' }}>
            No credit card required.
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div className="px-8 py-10 flex items-center justify-between flex-wrap gap-4" style={{ background: 'var(--bark-800)' }}>
        <div className="flex items-center gap-2.5 text-[13px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
          <span className="bh-font-display font-bold" style={{ color: 'rgba(255,255,255,0.85)' }}>
            FamilyOS
          </span>
          <span>&copy; 2026. A calmer home for every household.</span>
        </div>
        <div className="flex gap-5">
          <a href="#how-it-works" className="text-[13px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
            How it works
          </a>
          <a href="#features" className="text-[13px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Features
          </a>
        </div>
      </div>
    </div>
  );
}
