import { signInWithGoogle } from '@/lib/householdAuth';
import LandingDemoCard from '@/components/familyos/LandingDemoCard';
import LandingPhoneMockup from '@/components/familyos/LandingPhoneMockup';
import logo from '@/assets/familyos-logo.svg';
import '@/styles/landing.css';
import {
  Sparkles, MessageCircleHeart, PiggyBank, Camera, ListChecks,
  HeartHandshake, CloudSun, ArrowUpRight, ArrowRight, Check,
} from 'lucide-react';

const HOW_IT_WORKS = [
  {
    icon: Sparkles,
    tile: 'var(--sage-100)',
    tint: 'var(--sage-600)',
    step: '01',
    title: 'Connect your household',
    body: 'Link your bank, your smart home, and your family’s calendar — takes a few minutes, once.',
  },
  {
    icon: MessageCircleHeart,
    tile: 'rgba(0,112,192,0.12)',
    tint: 'var(--sky-500)',
    step: '02',
    title: 'Hermes organizes it',
    body: 'Your AI assistant turns raw data — transactions, chores, camera events — into things you can act on.',
  },
  {
    icon: ListChecks,
    tile: 'var(--honey-100)',
    tint: 'var(--honey-600)',
    step: '03',
    title: 'One focused view',
    body: 'A single daily briefing instead of six apps. See what matters today, not everything at once.',
  },
  {
    icon: HeartHandshake,
    tile: 'rgba(192,32,160,0.12)',
    tint: 'var(--berry-600)',
    step: '04',
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
  className = '',
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={() => signInWithGoogle()} className={`bh-button bh-button-primary ${className}`}>
      {children}
    </button>
  );
}

export default function LoginPage() {
  return (
    <div className="bh-landing min-h-screen overflow-x-hidden">
      {/* NAV */}
      <header className="bh-nav sticky top-0 z-50">
        <a href="#top" aria-label="FamilyOS, back to top" className="bh-nav-logo"><img src={logo} alt="FamilyOS" /></a>
        <nav aria-label="Main navigation" className="bh-nav-links">
          <a href="#how-it-works" className="hidden sm:inline text-sm font-semibold">
            How it works
          </a>
          <a href="#features" className="hidden sm:inline text-sm font-semibold">
            Features
          </a>
          <a href="#pricing" className="hidden sm:inline text-sm font-semibold">
            Pricing
          </a>
          <button
            type="button"
            onClick={() => signInWithGoogle()}
            className="bh-nav-cta"
          >
            Get started <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </nav>
      </header>

      {/* HERO */}
      <section id="top" className="bh-hero">
        <div className="bh-hero-inner">
          <div className="bh-hero-copy bh-fade-up">
            <div className="bh-eyebrow bh-eyebrow-light"><Sparkles className="w-4 h-4" aria-hidden="true" /> The calmer way to run a household</div>
            <h1 className="bh-font-display">Less chaos.<br /><span>More living.</span></h1>
            <p>Chores, schedules, spending, and all the little things in one friendly home base. FamilyOS helps your whole household stay on the same page, without keeping it all in your head.</p>
            <div className="bh-hero-actions">
              <GetStartedButton>Get started <ArrowUpRight className="w-5 h-5" aria-hidden="true" /></GetStartedButton>
              <a href="#demo" className="bh-button bh-button-ghost">See it in action <ArrowRight className="w-4 h-4" aria-hidden="true" /></a>
            </div>
            <div className="bh-hero-footnote"><span className="bh-footnote-line" /> Built for real homes and beautifully imperfect days.</div>
          </div>
          <div className="bh-hero-art bh-fade-up-delay">
            <div className="bh-hero-orbit" aria-hidden="true" />
            <div className="bh-hero-spark bh-hero-spark-one" aria-hidden="true">✳</div>
            <div className="bh-hero-spark bh-hero-spark-two" aria-hidden="true">✦</div>
            <div className="bh-phone-wrap"><LandingPhoneMockup /></div>
            <div className="bh-hero-note" aria-hidden="true"><span className="bh-note-icon"><Check className="w-4 h-4" /></span><span>One thing at a time.<small>You've got this.</small></span></div>
          </div>
        </div>
      </section>

      {/* STATS STRIP */}
      <section className="bh-promise" aria-label="What FamilyOS helps you do">
        <div className="bh-promise-inner">
          <p className="bh-promise-heading">Room to breathe, <em>every day.</em></p>
          <div className="bh-promise-items">
            <span><Check className="w-4 h-4" aria-hidden="true" /> Know what matters today</span>
            <span><Check className="w-4 h-4" aria-hidden="true" /> Share the mental load</span>
            <span><Check className="w-4 h-4" aria-hidden="true" /> Celebrate small wins</span>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="bh-section bh-how">
        <div className="bh-container">
          <div className="bh-section-heading">
            <div className="bh-eyebrow">01 / A simpler way</div>
            <h2 className="bh-font-display">The house stuff, <span>handled together.</span></h2>
            <p>From the little daily wins to the big-picture plans, everything has a place.</p>
          </div>
          <div className="bh-steps">
            {HOW_IT_WORKS.map((s) => (
              <article key={s.step} className="bh-step">
                <div className="bh-step-top"><span>{s.step}</span><span className="bh-step-line" /></div>
                <div className="bh-step-icon" style={{ background: s.tile, color: s.tint }}>
                  <s.icon className="w-[22px] h-[22px]" />
                </div>
                <h3 className="bh-font-display">{s.title}</h3>
                <p>{s.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="bh-section bh-features">
        <div className="bh-container">
          <div className="bh-section-heading">
            <div className="bh-eyebrow">02 / Made for your real life</div>
            <h2 className="bh-font-display">Less switching tabs. <span>More showing up.</span></h2>
            <p>All the moving parts of home, finally moving in the same direction.</p>
          </div>
          <div className="bh-feature-grid">
            {FEATURES.map((feature, index) => (
              <article key={feature.title} className="bh-feature">
                <div className="bh-feature-top"><span className="bh-feature-icon"><feature.icon className="w-6 h-6" aria-hidden="true" /></span><span className="bh-feature-index">0{index + 1}</span></div>
                <div><h3 className="bh-font-display">{feature.title}</h3><p>{feature.body}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ANIMATED DEMO */}
      <section id="demo" className="bh-section bh-demo">
        <div className="bh-container bh-demo-inner">
          <div className="bh-section-heading">
            <div className="bh-eyebrow">03 / Small wins add up</div>
            <h2 className="bh-font-display">A little momentum <span>looks good on you.</span></h2>
            <p>See how a daunting chore becomes a few doable steps and a well-earned win.</p>
          </div>
          <div className="bh-demo-card"><LandingDemoCard /></div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="bh-section bh-pricing">
        <div className="bh-container bh-pricing-inner">
          <div className="bh-pricing-copy">
            <div className="bh-eyebrow">04 / Simple from the start</div>
            <h2 className="bh-font-display">Good things are <span>better shared.</span></h2>
            <p>One plan for the whole household. Everything you need to bring a little more ease to every day.</p>
            <div className="bh-pricing-aside"><span>✳</span> Less juggling. More living.</div>
          </div>
          <div className="bh-price-card">
            <div className="bh-price-label">The household plan <span>All in, together</span></div>
            <div className="bh-price-amount"><strong className="bh-font-display">$9.99</strong><span>/ month</span></div>
            <p>Covers up to 3 household members.</p>
            <div className="bh-price-additional">+ $2.99/month for each additional member</div>
            <ul>
              <li><Check className="w-4 h-4" aria-hidden="true" /> Everything in FamilyOS — finance, home, family tracking, AI assistant</li>
              <li><Check className="w-4 h-4" aria-hidden="true" /> Unlimited bank & smart home connections</li>
              <li><Check className="w-4 h-4" aria-hidden="true" /> Cancel anytime</li>
            </ul>
            <GetStartedButton className="w-full justify-center">Get started <ArrowUpRight className="w-5 h-5" aria-hidden="true" /></GetStartedButton>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section id="get-started" className="bh-final">
        <div className="bh-final-inner">
          <span className="bh-final-mark" aria-hidden="true">✳</span>
          <div className="bh-eyebrow bh-eyebrow-light">It's nice to be home</div>
          <h2 className="bh-font-display">Ready for a <span>lighter load?</span></h2>
          <p>A little help for the household goes a long way. Let's start with today.</p>
          <GetStartedButton>Get started <ArrowUpRight className="w-5 h-5" aria-hidden="true" /></GetStartedButton>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bh-footer">
        <div className="bh-footer-brand">
          <span className="bh-font-display">FamilyOS</span>
          <span>A calmer home for every household.</span>
          <small>&copy; 2026 HotMessExpress</small>
        </div>
        <nav aria-label="Footer navigation" className="bh-footer-links">
          <a href="#how-it-works">How it works</a>
          <a href="#features">Features</a>
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms of Service</a>
        </nav>
      </footer>
    </div>
  );
}
