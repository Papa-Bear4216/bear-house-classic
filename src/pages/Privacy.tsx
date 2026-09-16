import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { ShieldCheck, ArrowLeft, Lock, ExternalLink, Mail, EyeOff, Database, Trash2 } from 'lucide-react';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 relative overflow-x-hidden selection:bg-amber-500 selection:text-slate-950">
      {/* Background glow effects */}
      <div className="fixed -top-40 -right-40 w-96 h-96 rounded-full bg-amber-500/[0.08] blur-[140px] pointer-events-none" />
      <div className="fixed top-1/2 -left-40 w-96 h-96 rounded-full bg-indigo-500/[0.08] blur-[140px] pointer-events-none" />

      {/* Top Banner */}
      <header className="max-w-4xl mx-auto px-4 py-6 flex items-center justify-between border-b border-white/10 relative z-10">
        <Link to="/welcome" className="flex items-center gap-2.5 text-white font-extrabold text-lg group">
          <span className="text-xl">🚂</span>
          <span>HotMessExpress</span>
          <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 text-slate-950">
            Dysfunction Junction
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/terms" className="text-xs text-slate-400 hover:text-amber-400 transition hidden sm:inline">
            Terms of Service
          </Link>
          <Link to="/welcome">
            <Button variant="outline" size="sm" className="border-white/10 text-slate-200 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl text-xs gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to App
            </Button>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-12 relative z-10">
        <div className="p-6 sm:p-10 rounded-3xl bg-slate-900/70 border border-white/10 backdrop-blur-2xl shadow-2xl space-y-8">
          
          <div className="border-b border-white/10 pb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold mb-3">
              <ShieldCheck className="w-3.5 h-3.5" /> Official Policy
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">Privacy Policy</h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-2">
              <strong>Effective Date:</strong> September 16, 2026 &bull; <strong>Application:</strong> HotMessExpress / FamilyOS &bull; <strong>Engineered by:</strong> Dysfunction Junction
            </p>
          </div>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-amber-400">1.</span> Overview &amp; Our Core Stance
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              HotMessExpress (&ldquo;FamilyOS&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;), a digital household operating application developed by <strong>Dysfunction Junction</strong>, is committed to safeguarding the privacy and security of your family and household data.
            </p>
            <p className="text-sm text-slate-300 leading-relaxed">
              We build tools for neurodivergent, ADHD, and chaotic households where focus and executive function are precious. We believe your private family dynamics, schedules, and purchases belong strictly to you. We do not sell data, we do not run third-party advertising trackers, and we keep access restricted to your authorized household circle.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-amber-400">2.</span> Information We Collect
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              We collect only the minimum data necessary to coordinate your home:
            </p>
            <ul className="list-disc list-inside space-y-2 text-sm text-slate-300 pl-2">
              <li>
                <strong className="text-white">Account Identification:</strong> When signing in with Google OAuth or email, we receive your email address, display name, and avatar image.
              </li>
              <li>
                <strong className="text-white">Household Content:</strong> Chores, custom routines, grocery and shopping lists, pantry items, family member names/colors, and reminders you create.
              </li>
              <li>
                <strong className="text-white">Operational Telemetry:</strong> Anonymized performance timings (e.g. household load duration) and error diagnostics to keep the app reliable.
              </li>
            </ul>
          </section>

          {/* Google API Section */}
          <section className="space-y-4 p-6 rounded-2xl bg-amber-500/[0.04] border border-amber-500/20">
            <h2 className="text-xl font-bold text-amber-300 flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-400" />
              <span>3. Google API Services &amp; Restricted Scopes</span>
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              HotMessExpress offers optional Google integrations to automate household coordination. If you link your Google account, here is exactly what is accessed and why:
            </p>

            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-white/5">
                <h3 className="text-sm font-bold text-white mb-1">Google OAuth 2.0 (Identity)</h3>
                <p className="text-xs text-slate-300">
                  Used exclusively to verify your identity, maintain authenticated sessions, and associate your profile with your household.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-white/5">
                <h3 className="text-sm font-bold text-white mb-1">Google Calendar API (Appointments)</h3>
                <p className="text-xs text-slate-300">
                  Read-only access to calendar events (time, summary, location) to display family appointments in the unified dashboard. We do not modify or delete external Google calendars without explicit user action.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-white/5">
                <h3 className="text-sm font-bold text-white mb-1">Gmail API (<code className="text-amber-300">https://www.googleapis.com/auth/gmail.readonly</code>)</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  When a household member enables receipt or delivery scanning, server-side edge functions inspect read-only email metadata strictly to detect order confirmations (e.g. Amazon, Walmart, grocery deliveries), package tracking numbers, and utility bills. Raw email text is never persisted or shared.
                </p>
              </div>
            </div>

            {/* Google Limited Use Disclosure Box */}
            <div className="p-4 rounded-xl bg-slate-950 border-2 border-amber-500/40 space-y-2">
              <h4 className="text-xs uppercase tracking-wider font-extrabold text-amber-400">
                Mandatory Google API Limited Use Disclosure
              </h4>
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                HotMessExpress&rsquo;s use and transfer to any other app of information received from Google APIs will adhere to the{' '}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 font-bold underline inline-flex items-center gap-1"
                >
                  Google API Services User Data Policy <ExternalLink className="w-3 h-3" />
                </a>
                , including the <strong>Limited Use</strong> requirements.
              </p>
            </div>

            {/* Strict Protections */}
            <div className="space-y-2 text-xs text-slate-300 pt-2">
              <p className="font-bold text-white text-sm">Our Inviolable Google Data Protections:</p>
              <ul className="space-y-1.5 list-disc list-inside pl-2">
                <li><strong className="text-slate-200">No Ads:</strong> We never use or disclose Google user data to serve advertisements, personalized ads, or retargeted campaigns.</li>
                <li><strong className="text-slate-200">No Data Selling:</strong> We never sell Google user data to data brokers or third parties.</li>
                <li><strong className="text-slate-200">No AI Model Training:</strong> We do not train generalized AI/ML foundation models on your private emails, calendar items, or personal messages.</li>
                <li><strong className="text-slate-200">Human Access Prohibited:</strong> No human will read your private emails or calendar data unless explicitly approved by you for technical troubleshooting, required by law, or strictly necessary for anti-abuse security investigations.</li>
              </ul>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-400" />
              <span>4. Data Storage, Security &amp; Isolation</span>
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Household records are stored in dedicated PostgreSQL instances hosted on Supabase with <strong>Row Level Security (RLS)</strong> enforced at the database kernel. Each query is strictly isolated by your household ID. All network transmissions are protected with TLS 1.3 / HTTPS encryption. OAuth refresh tokens are encrypted and handled exclusively by restricted serverless Edge Functions.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-400" />
              <span>5. Revoking Access &amp; Data Deletion Rights</span>
            </h2>
            <div className="space-y-2 text-sm text-slate-300">
              <p>
                <strong>Revoking Google Access:</strong> You can disconnect Google services anytime in the app settings, or directly through Google&rsquo;s Security portal at{' '}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 underline inline-flex items-center gap-1"
                >
                  myaccount.google.com/permissions <ExternalLink className="w-3 h-3" />
                </a>
                .
              </p>
              <p>
                <strong>Complete Account Deletion:</strong> You have the right to permanently delete your household account and all related database records. You may initiate deletion from the settings menu or by emailing{' '}
                <a href="mailto:support@dysfunctionjunction.xyz" className="text-amber-400 underline">
                  support@dysfunctionjunction.xyz
                </a>
                . All personal data and tokens are completely purged within 30 days of request.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Mail className="w-5 h-5 text-emerald-400" />
              <span>6. Contact Us</span>
            </h2>
            <p className="text-sm text-slate-300">
              For any questions, requests, or concerns regarding your privacy:
            </p>
            <div className="p-4 rounded-xl bg-slate-950/60 border border-white/5 text-xs text-slate-300 space-y-1">
              <p className="font-bold text-white text-sm">Dysfunction Junction</p>
              <p>Attn: Privacy &amp; Data Protection</p>
              <p>Website: <a href="https://hotmessexpress.lol" className="text-amber-400 underline">https://hotmessexpress.lol</a></p>
              <p>Direct Inquiries: <a href="mailto:support@dysfunctionjunction.xyz" className="text-amber-400 underline">support@dysfunctionjunction.xyz</a></p>
            </div>
          </section>

        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-8 px-4 border-t border-white/5 text-xs text-slate-500 relative z-10 space-y-1">
        <p>&copy; 2026 Dysfunction Junction. All rights reserved. HotMessExpress &amp; FamilyOS.</p>
      </footer>
    </div>
  );
}
