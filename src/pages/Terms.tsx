import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { FileText, ArrowLeft, ShieldAlert, Scale, CheckCircle2, HelpCircle } from 'lucide-react';

export default function Terms() {
  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 relative overflow-x-hidden selection:bg-amber-500 selection:text-slate-950">
      {/* Background glow effects */}
      <div className="fixed -top-40 -right-40 w-96 h-96 rounded-full bg-amber-500/[0.08] blur-[140px] pointer-events-none" />
      <div className="fixed top-1/2 -left-40 w-96 h-96 rounded-full bg-indigo-500/[0.08] blur-[140px] pointer-events-none" />

      {/* Top Header */}
      <header className="max-w-4xl mx-auto px-4 py-6 flex items-center justify-between border-b border-white/10 relative z-10">
        <Link to="/welcome" className="flex items-center gap-2.5 text-white font-extrabold text-lg group">
          <span className="text-xl">🚂</span>
          <span>HotMessExpress</span>
          <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 text-slate-950">
            Dysfunction Junction
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/privacy" className="text-xs text-slate-400 hover:text-amber-400 transition hidden sm:inline">
            Privacy Policy
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
              <FileText className="w-3.5 h-3.5" /> Legal Agreement
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">Terms of Service</h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-2">
              <strong>Effective Date:</strong> September 16, 2026 &bull; <strong>Application:</strong> HotMessExpress / FamilyOS &bull; <strong>Engineered by:</strong> Dysfunction Junction
            </p>
          </div>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-amber-400">1.</span> Acceptance of Terms
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              By accessing or using <strong>HotMessExpress</strong> (&ldquo;FamilyOS&rdquo; or &ldquo;the Service&rdquo;), hosted at <a href="https://hotmessexpress.lol" className="text-amber-400 underline">https://hotmessexpress.lol</a> and operated by <strong>Dysfunction Junction</strong> (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;), you agree to be bound by these Terms of Service. If you disagree with any part of these Terms, you may not access or use the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-amber-400">2.</span> Purpose &amp; Nature of the Service
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              HotMessExpress is an ADHD-friendly household coordination system that unifies calendars, routines, chores, pantry tracking, and family briefings. It is designed to assist family members in organizing their daily tasks and reducing mental friction.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-amber-400">3.</span> User Accounts &amp; Household Integrity
            </h2>
            <ul className="list-disc list-inside space-y-2 text-sm text-slate-300 pl-2">
              <li>
                <strong className="text-white">Authentication:</strong> Accounts are secured via OAuth providers (such as Google Sign-In) or email authentication. You are responsible for safeguarding access credentials.
              </li>
              <li>
                <strong className="text-white">Household Administration:</strong> Household creators and administrators have administrative control over member roles, invitations, and connected integrations.
              </li>
              <li>
                <strong className="text-white">Eligibility:</strong> Users must be at least 13 years of age, or have the express consent and supervision of a parent or legal guardian.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Scale className="w-5 h-5 text-indigo-400" />
              <span>4. Acceptable Use Policy</span>
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              You agree to use the Service solely for lawful, personal household management purposes. You agree not to:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-xs sm:text-sm text-slate-300 pl-2">
              <li>Probe, scan, or breach system vulnerabilities or Supabase Row Level Security restrictions;</li>
              <li>Deploy unauthorized scrapers, spiders, or automated bots against our API endpoints;</li>
              <li>Transmit malware, spam, or unlawful material;</li>
              <li>Reverse engineer, decompile, or create derivative works from the proprietary software.</li>
            </ul>
          </section>

          <section className="space-y-3 p-5 rounded-2xl bg-slate-950/60 border border-white/5">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-amber-400" />
              <span>5. Third-Party Services &amp; Google Integrations</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              When you choose to connect third-party platforms (such as Google Calendar, Gmail read-only receipt tracking, or Home Assistant), your use of those external platforms is subject to their respective terms and policies. Our handling of Google user data adheres strictly to the{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 underline"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements, as outlined in our <Link to="/privacy" className="text-amber-400 underline">Privacy Policy</Link>.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-400" />
              <span>6. Disclaimers &amp; Limitation of Liability</span>
            </h2>
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-200 text-xs sm:text-sm leading-relaxed">
              THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND. HOTMESSEXPRESS IS AN ORGANIZATIONAL AID AND IS NOT A SUBSTITUTE FOR PROFESSIONAL MEDICAL, PSYCHIATRIC, LEGAL, OR FINANCIAL ADVICE.
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              In no event shall Dysfunction Junction, its founders, or contributors be liable for any indirect, special, incidental, or consequential damages resulting from your use or inability to use the platform.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-amber-400">7.</span> Termination &amp; Account Purge
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              We reserve the right to suspend or terminate accounts that violate these Terms. You may stop using the Service and request immediate deletion of your household data at any time by contacting us at <a href="mailto:support@dysfunctionjunction.xyz" className="text-amber-400 underline">support@dysfunctionjunction.xyz</a>. All records will be permanently purged within 30 days.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-emerald-400" />
              <span>8. Contact Information</span>
            </h2>
            <div className="p-4 rounded-xl bg-slate-950/60 border border-white/5 text-xs text-slate-300 space-y-1">
              <p className="font-bold text-white text-sm">Dysfunction Junction</p>
              <p>HotMessExpress / FamilyOS Legal Team</p>
              <p>Web: <a href="https://hotmessexpress.lol" className="text-amber-400 underline">https://hotmessexpress.lol</a></p>
              <p>Email: <a href="mailto:support@dysfunctionjunction.xyz" className="text-amber-400 underline">support@dysfunctionjunction.xyz</a></p>
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
