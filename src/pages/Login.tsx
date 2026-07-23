import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { signInWithGoogle } from '@/lib/householdAuth';
import {
  Sparkles, PiggyBank, ReceiptText, TrendingUp, Camera, ShieldCheck,
  ListChecks, HeartHandshake, Smile, Clock, ShoppingCart, CalendarClock,
  CloudSun, MessageCircleHeart,
} from 'lucide-react';

const FEATURE_GROUPS = [
  {
    title: 'Your household, on autopilot',
    blurb: 'Hermes, your AI household assistant, keeps everyone in sync.',
    icon: Sparkles,
    items: [
      { icon: MessageCircleHeart, label: 'Hermes AI chat', desc: 'Ask it anything about your household — schedules, finances, chores — and get a real answer.' },
      { icon: Clock, label: 'Daily briefings', desc: 'A morning rundown of what matters today, so nothing slips through the cracks.' },
    ],
  },
  {
    title: 'Money, handled',
    blurb: 'Real bank data, not spreadsheets.',
    icon: PiggyBank,
    items: [
      { icon: PiggyBank, label: 'Bank sync', desc: 'Secure, read-only account sync via SimpleFIN — balances and transactions, always current.' },
      { icon: ReceiptText, label: 'Receipt scanner', desc: 'Snap a photo of a receipt and it categorizes the spend automatically.' },
      { icon: TrendingUp, label: 'Spending trends', desc: 'See where the money actually goes, month over month.' },
    ],
  },
  {
    title: 'Your home, watched over',
    blurb: 'Plugs into the smart home you already have.',
    icon: ShieldCheck,
    items: [
      { icon: Camera, label: 'Camera viewer', desc: 'Check every connected camera from one screen, no separate app.' },
      { icon: ShieldCheck, label: 'System health', desc: 'Know the moment a device or integration goes offline — and get a one-tap fix.' },
    ],
  },
  {
    title: 'Family life, tracked with care',
    blurb: 'The soft stuff matters as much as the logistics.',
    icon: HeartHandshake,
    items: [
      { icon: ListChecks, label: 'Chore scanner', desc: 'Snap a photo, chores get logged and credited automatically.' },
      { icon: HeartHandshake, label: 'Promises', desc: 'Keep track of commitments you make to each other — and actually follow through.' },
      { icon: Smile, label: 'Emotions & quality time', desc: 'A gentle pulse on how everyone\'s doing, and how much real time you\'re spending together.' },
      { icon: ShoppingCart, label: 'Grocery & Walmart sync', desc: 'Shopping lists that turn into real orders.' },
      { icon: CalendarClock, label: 'Calendar & classroom sync', desc: 'School updates and family calendars, pulled into one place automatically.' },
      { icon: CloudSun, label: 'Weather', desc: 'Always visible, so mornings start with the right jacket.' },
    ],
  },
];

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="max-w-6xl mx-auto flex items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 text-xl font-bold">
          <span>🐻</span> FamilyOS
        </div>
        <Button variant="outline" onClick={() => signInWithGoogle()}>
          Sign in
        </Button>
      </header>

      <section className="max-w-4xl mx-auto text-center px-6 pt-16 pb-20">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
          The AI command center<br className="hidden sm:block" /> for your household.
        </h1>
        <p className="mt-6 text-lg text-slate-400 max-w-2xl mx-auto">
          FamilyOS brings your finances, your smart home, and your family's day-to-day
          into one place — with an AI assistant that actually keeps up.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3">
          <Button size="lg" className="text-base px-8" onClick={() => signInWithGoogle()}>
            Sign in with Google
          </Button>
          <p className="text-xs text-slate-500">Free to try &middot; set up your household in minutes</p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid gap-6 sm:grid-cols-2">
          {FEATURE_GROUPS.map((group) => (
            <Card key={group.title} className="bg-slate-900 border-slate-800">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-1">
                  <group.icon className="h-5 w-5 text-slate-300" />
                  <h2 className="text-lg font-semibold">{group.title}</h2>
                </div>
                <p className="text-sm text-slate-500 mb-4">{group.blurb}</p>
                <ul className="space-y-3">
                  {group.items.map((item) => (
                    <li key={item.label} className="flex gap-3">
                      <item.icon className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" />
                      <div>
                        <div className="text-sm font-medium text-slate-200">{item.label}</div>
                        <div className="text-sm text-slate-500">{item.desc}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-24 text-center">
        <h2 className="text-2xl font-bold">Simple pricing</h2>
        <p className="mt-2 text-slate-400">One plan. No tiers to compare.</p>
        <Card className="mt-8 bg-slate-900 border-slate-800 text-left">
          <CardContent className="p-8">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold">$9.99</span>
              <span className="text-slate-400">/month</span>
            </div>
            <p className="mt-2 text-sm text-slate-400">Covers up to 3 household members.</p>
            <div className="mt-4 pt-4 border-t border-slate-800 text-sm text-slate-400">
              + $2.99/month for each additional member
            </div>
            <ul className="mt-6 space-y-2 text-sm text-slate-300">
              <li>&#10003; Everything in FamilyOS — finance, home, family tracking, AI assistant</li>
              <li>&#10003; Unlimited bank & smart home connections</li>
              <li>&#10003; Cancel anytime</li>
            </ul>
            <Button className="w-full mt-8" size="lg" onClick={() => signInWithGoogle()}>
              Get started
            </Button>
          </CardContent>
        </Card>
      </section>

      <footer className="max-w-6xl mx-auto px-6 py-10 text-center text-sm text-slate-600">
        FamilyOS
      </footer>
    </div>
  );
}
