'use client';

import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#020817] text-white">
      <header className="border-b border-slate-800 bg-[#020817]/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center gap-3">
          <Link href="/about" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-xs font-black">FO</div>
            <span className="font-bold text-white text-sm">Dysfunction Junction</span>
          </Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-slate-500 text-sm mb-10">Last updated: June 2026</p>
        <div className="space-y-8 text-slate-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Overview</h2>
            <p>Dysfunction Junction is a private, invite-only family household management application. It is not a public-facing product and is intended exclusively for authorized family members of a single private household.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Data We Collect</h2>
            <ul className="list-disc list-inside mt-2 space-y-2 text-slate-400">
              <li>Google account name and email (authentication only)</li>
              <li>Profile information you provide (display name, avatar, role)</li>
              <li>Tasks, events, messages, and content you create</li>
              <li>Financial data from connected bank accounts via Plaid</li>
              <li>Google Calendar events (read-only)</li>
              <li>Photos uploaded to the family gallery</li>
            </ul>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">How We Use Your Data</h2>
            <p>All data is used solely to provide Dysfunction Junction functionality. Financial data is displayed within the app only and is never shared with third parties. Calendar data is read-only — we never modify your Google Calendar.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Data Storage</h2>
            <p>Data is stored in Google Firebase with enterprise-grade encryption at rest and in transit. Financial access tokens are stored securely in Firestore and never exposed client-side.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Third-Party Services</h2>
            <ul className="list-disc list-inside space-y-2 text-slate-400">
              <li><strong className="text-slate-300">Google Firebase</strong> — authentication and database</li>
              <li><strong className="text-slate-300">Plaid</strong> — secure bank account connection</li>
              <li><strong className="text-slate-300">Google Calendar API</strong> — read-only calendar access</li>
              <li><strong className="text-slate-300">Google Gemini AI</strong> — AI assistant</li>
              <li><strong className="text-slate-300">Vercel</strong> — application hosting</li>
            </ul>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Data Sharing</h2>
            <p>We do not sell, rent, or share any personal or financial data with any third parties. Data is only shared between authorized members of the same family household.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Contact</h2>
            <p>For privacy concerns contact <span className="text-indigo-400">michael711hebert@gmail.com</span>.</p>
          </section>
        </div>
        <div className="mt-12 pt-8 border-t border-slate-800 flex gap-4 text-sm text-slate-500">
          <Link href="/about" className="hover:text-slate-300 transition-colors">← Back to Home</Link>
          <Link href="/terms" className="hover:text-slate-300 transition-colors">Terms of Service →</Link>
        </div>
      </main>
    </div>
  );
}
