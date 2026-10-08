import React from 'react';
import { ShieldCheck, Lock, EyeOff, Database, Trash2, CheckCircle2 } from 'lucide-react';

export const BentoLegalPrivacyPreview: React.FC = () => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-indigo-300 font-semibold">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Zero-Tracker Guarantee</span>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300">
          Sep 2026
        </span>
      </div>

      <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1">
        <div className="text-xs text-slate-200 font-semibold">
          Household Data Perimeter
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Your family routines, messages, and schedules belong solely to you. Zero sale of data, zero third-party advertising tracking.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-300">
        <div className="flex items-center gap-1.5 p-1.5 rounded-xl bg-white/[0.02] border border-white/5">
          <Lock className="w-3 h-3 text-amber-400" />
          <span>Local-First Sync</span>
        </div>
        <div className="flex items-center gap-1.5 p-1.5 rounded-xl bg-white/[0.02] border border-white/5">
          <EyeOff className="w-3 h-3 text-sky-400" />
          <span>No Ad Tracking</span>
        </div>
      </div>
    </div>
  );
};

export const BentoLegalPrivacyExpanded: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-6 text-slate-200">
      <div className="border-b border-white/10 pb-5">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold mb-3">
          <ShieldCheck className="w-3.5 h-3.5" /> Official Policy
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          Privacy Policy
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Effective Date: September 16, 2026 &bull; HotMessExpress / FamilyOS &bull; Engineered by Dysfunction Junction
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="text-amber-400">1.</span> Overview &amp; Our Core Stance
        </h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          HotMessExpress (&ldquo;FamilyOS&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) is committed to safeguarding the privacy and security of your family and household data. We build tools for neurodivergent, ADHD, and chaotic households where focus and executive function are precious. We believe your private family dynamics, schedules, and purchases belong strictly to you.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="text-amber-400">2.</span> What Information We Collect
        </h2>
        <ul className="text-sm text-slate-300 space-y-2 list-disc list-inside">
          <li><strong>Household Roster &amp; Profiles:</strong> Member names, display avatars, assigned colors, and roles.</li>
          <li><strong>Tasks, Chores &amp; Commitments:</strong> Task descriptions, recurrence schedules, due dates, and completion status.</li>
          <li><strong>Family Logistics:</strong> Run of Show timelines, school calendars, meal plans, and grocery items.</li>
          <li><strong>AI Conversations:</strong> Prompts sent to Hermes are routed solely for contextual task execution and scoped strictly per household.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="text-amber-400">3.</span> Bulletproof Data Segregation &amp; Security
        </h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          All client-side cache and conversation buffers are isolated by Triad structural scope parameters (household ID and member ID). Cross-tenant queries are blocked by strict database Row Level Security (RLS) policies.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="text-amber-400">4.</span> Your Rights &amp; Zero-Friction Deletion
        </h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          You maintain full ownership of your household data. You may export or purge your household records at any time directly through the app settings or by contacting our team.
        </p>
      </section>
    </div>
  );
};
