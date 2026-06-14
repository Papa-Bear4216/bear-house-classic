'use client';

import Link from 'next/link';

export default function TermsPage() {
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
        <h1 className="text-4xl font-bold text-white mb-2">Terms of Service</h1>
        <p className="text-slate-500 text-sm mb-10">Last updated: June 2026</p>
        <div className="space-y-8 text-slate-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Access</h2>
            <p>Dysfunction Junction is a private, invite-only application restricted to authorized members of a single private family household. Unauthorized access is prohibited. The household administrator controls who may access the application.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Acceptable Use</h2>
            <p>This application is for personal household management use only. You agree not to misuse the app, attempt to access other users data without permission, or use the app for any commercial or unlawful purpose.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Financial Data</h2>
            <p>Bank account connections are established through Plaid, a secure financial data service. By connecting a bank account, you authorize Plaid to retrieve your financial data on your behalf. We never store card numbers, passwords, or credentials.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">User Content</h2>
            <p>Content you create (tasks, messages, photos, notes) remains yours. By adding content to the app, you grant other authorized family members the ability to view it. The household administrator may remove any content at any time.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Disclaimer</h2>
            <p>This application is provided as-is for personal family use. It is not a commercial product and carries no warranty. The app administrator is not liable for data loss, inaccurate financial data, or any issues arising from use of the application.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Contact</h2>
            <p>For any questions contact <span className="text-indigo-400">michael711hebert@gmail.com</span>.</p>
          </section>
        </div>
        <div className="mt-12 pt-8 border-t border-slate-800 flex gap-4 text-sm text-slate-500">
          <Link href="/privacy" className="hover:text-slate-300 transition-colors">← Privacy Policy</Link>
          <Link href="/about" className="hover:text-slate-300 transition-colors">Back to Home →</Link>
        </div>
      </main>
    </div>
  );
}
