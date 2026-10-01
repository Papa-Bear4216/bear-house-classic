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
    title: 'Sign in with Google',
    body: 'Create a household or accept an invite. Bank, calendar, Gmail, and Home Assistant stay off until an admin connects them.',
  },
  {
    icon: MessageCircleHeart,
    tile: 'rgba(0,112,192,0.12)',
    tint: 'var(--sky-500)',
    step: 'STEP 2',
    title: 'Hermes can suggest',
    body: 'Chat about chores, the calendar, and spending. Hermes does not pay bills, send messages, or give medical or legal advice.',
  },
  {
    icon: ListChecks,
    tile: 'var(--honey-100)',
    tint: 'var(--honey-600)',
    step: 'STEP 3',
    title: 'One next chore',
    body: 'The dashboard can show one next task and a short timer. A daily briefing exists, and it only includes data you have already added.',
  },
  {
    icon: HeartHandshake,
    tile: 'rgba(192,32,160,0.12)',
    tint: 'var(--berry-600)',
    step: 'STEP 4',
    title: 'The household shares one record',
    body: 'Tasks, promises, and notes sync for members of the household. Offline edits wait and replay when you are back online.',
  },
];

const FEATURES = [
  { icon: MessageCircleHeart, title: 'Hermes chat', body: 'Ask about chores, the calendar, and spending. You confirm before a device action runs.' },
  { icon: PiggyBank, title: 'Read-only bank sync', body: 'SimpleFIN lists accounts and transactions. Uncertain categories stay in a review inbox until you confirm them.' },
  { icon: Camera, title: 'Your Home Assistant', body: 'If you connect your own instance, authorized members can open its cameras and run allowlisted devices.' },
  { icon: ListChecks, title: 'Scans you confirm', body: 'A room photo can suggest chores. A receipt can suggest pantry items. Nothing is saved until you confirm it.' },
  { icon: HeartHandshake, title: 'Custody, promises, and routines', body: 'Schedules, swap requests, promises, quality time, and shared routines for the people in the household.' },
  { icon: CloudSun, title: 'Weather and a daily briefing', body: 'A briefing can include the calendar, weather, and bills you already track. It does not pay those bills.' },
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
            Sign in with Google
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
              Your household,<br />on one list.
            </h1>
            <p className="text-lg leading-relaxed max-w-[460px] mb-8" style={{ color: 'rgba(255,248,238,0.72)' }}>
              FamilyOS keeps chores, custody, medications, school notes, and read-only
              bank sync in one household. You confirm scans and device actions before they happen.
            </p>
            <div className="flex gap-3.5 flex-wrap">
              <GetStartedButton variant="primary">Sign in with Google</GetStartedButton>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 rounded-[var(--radius-full)] font-bold text-[15px] px-7 py-3.5"
                style={{ background: 'transparent', color: '#fff', border: '1.5px solid rgba(255,255,255,0.3)' }}
              >
                See how it works
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
              7-day
            </div>
            <div className="text-sm font-semibold mt-1.5" style={{ color: 'var(--fg-muted)' }}>
              trial for a new household, then $9.99/month
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
              read-only
            </div>
            <div className="text-sm font-semibold mt-1.5" style={{ color: 'var(--fg-muted)' }}>
              bank sync — the app does not move money
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
              Sign in, name the household, then connect only what you use.
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
              What the app actually does.
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
            <p style={{ color: 'var(--fg-muted)' }}>One plan. A new household starts a 7-day trial.</p>

          <div
            className="mt-8 rounded-[var(--radius-xl)] p-8 text-left bg-white"
            style={{ border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-lg)' }}
          >
            <div className="flex items-baseline gap-2">
              <span className="bh-font-display text-4xl font-extrabold" style={{ color: 'var(--bark-700)' }}>
                $9.99
              </span>
              <span style={{ color: 'var(--fg-muted)' }}>/month after the trial</span>
            </div>
            <p className="mt-2 text-sm" style={{ color: 'var(--fg-muted)' }}>
              Covers up to 3 household members. Pets are not billed as seats.
            </p>
            <div className="mt-4 pt-4 text-sm" style={{ borderTop: '1px solid var(--border-light)', color: 'var(--fg-muted)' }}>
              + $2.99/month for each additional member
            </div>
            <ul className="mt-6 space-y-2 text-sm" style={{ color: 'var(--fg-secondary)' }}>
              <li>&#10003; Chores, routines, custody, health log, school notes, and Hermes chat</li>
              <li>&#10003; Read-only SimpleFIN, and one Home Assistant connection if you add it</li>
              <li>&#10003; Cancel from the billing portal</li>
            </ul>
            <button
              onClick={() => signInWithGoogle()}
              className="w-full mt-8 rounded-[var(--radius-full)] font-bold text-[15px] py-3.5"
              style={{ background: 'var(--brand-primary)', color: '#fff', boxShadow: 'var(--shadow-brand)' }}
            >
              Sign in with Google
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
            Sign in with Google. A new household starts a 7-day trial, and a card is not required to start it.
          </p>
          <div className="flex gap-3.5 justify-center flex-wrap">
            <GetStartedButton variant="primary">Sign in with Google</GetStartedButton>
          </div>
          <div className="text-[13px] mt-4" style={{ color: 'rgba(255,248,238,0.5)' }}>
            $9.99/month after the trial, for up to 3 members.
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
        <div className="flex gap-5 flex-wrap">
          <a href="#how-it-works" className="text-[13px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
            How it works
          </a>
          <a href="#features" className="text-[13px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Features
          </a>
          <a href="/privacy" className="text-[13px] hover:underline" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Privacy Policy
          </a>
          <a href="/terms" className="text-[13px] hover:underline" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Terms of Service
          </a>
        </div>
      </div>
    </div>
  );
}
