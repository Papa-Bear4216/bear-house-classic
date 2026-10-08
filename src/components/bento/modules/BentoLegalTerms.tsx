import React from 'react';
import { FileText, Scale, ShieldAlert, CheckCircle2 } from 'lucide-react';

export const BentoLegalTermsPreview: React.FC = () => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-sky-300 font-semibold">
          <Scale className="w-4 h-4 text-sky-400" />
          <span>Terms of Service</span>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-300">
          Standard License
        </span>
      </div>

      <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1">
        <div className="text-xs text-slate-200 font-semibold">
          ADHD &amp; Neurodivergent Safe
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Clear plain-English agreements with no predatory terms or dark patterns. Designed for peaceful household collaboration.
        </p>
      </div>

      <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
        <span>License: Single Household</span>
        <span className="text-emerald-400 font-medium flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> Up to date
        </span>
      </div>
    </div>
  );
};

export const BentoLegalTermsExpanded: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-6 text-slate-200">
      <div className="border-b border-white/10 pb-5">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-semibold mb-3">
          <FileText className="w-3.5 h-3.5" /> Legal Agreement
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          Terms of Service
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Effective Date: September 16, 2026 &bull; HotMessExpress / FamilyOS &bull; Engineered by Dysfunction Junction
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="text-amber-400">1.</span> Acceptance of Terms
        </h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          By accessing or using HotMessExpress (&ldquo;FamilyOS&rdquo; or &ldquo;the Service&rdquo;), hosted at https://hotmessexpress.lol and operated by Dysfunction Junction, you agree to be bound by these Terms of Service. If you disagree with any part of these Terms, you may not access or use the Service.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="text-amber-400">2.</span> Purpose &amp; Nature of the Service
        </h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          FamilyOS is designed specifically for neurodivergent and chaotic households to organize tasks, balance domestic workload, and manage family routines without cognitive overload. It is provided &ldquo;as is&rdquo; to support everyday family harmony.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="text-amber-400">3.</span> Permitted Use &amp; Household Boundaries
        </h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          Each subscription covers an individual family or household group. Sharing access tokens or administrative credentials outside of your authorized household circle is strictly prohibited.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="text-amber-400">4.</span> Termination &amp; Account Controls
        </h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          You may cancel your subscription or delete your household profile at any time. Upon termination, data is purged in accordance with our Privacy Policy.
        </p>
      </section>
    </div>
  );
};
