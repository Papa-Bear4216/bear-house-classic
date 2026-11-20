const ROLES = [
  {
    label: 'Superadmin',
    emoji: '👑',
    color: 'from-amber-400 to-orange-500',
    border: 'border-amber-500/30',
    blurb: 'Household setup, billing, integrations & Feature Switchboard toggles.',
  },
  {
    label: 'Admin',
    emoji: '🛠️',
    color: 'from-pink-500 to-rose-500',
    border: 'border-pink-500/30',
    blurb: 'Partners, parents, or optional co-parents managing chores, schedules & routines.',
  },
  {
    label: 'Child',
    emoji: '🎨',
    color: 'from-violet-500 to-fuchsia-500',
    border: 'border-violet-500/30',
    blurb: 'Kids World Monster Den, Voice Hermes, 120Hz arcade, themed rooms & sealed private journal.',
  },
  {
    label: 'Pet',
    emoji: '🐾',
    color: 'from-emerald-400 to-teal-500',
    border: 'border-emerald-500/30',
    blurb: 'Real-time “Who Fed the Dog?” meal & walk tracker. Always 100% free — pets don’t pay rent.',
  },
];

export function FamilyRoles() {
  return (
    <section className="px-4 py-16 max-w-5xl mx-auto relative z-10">
      <div className="text-center max-w-2xl mx-auto mb-10">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/15 border border-violet-400/30 text-xs font-bold text-violet-300 mb-3">
          <span>👨‍👩‍👧‍👦</span> Built for Everyone Under One Roof (or Two)
        </div>
        <h2 className="text-3xl font-black text-white font-display mb-2">Four clear roles</h2>
        <p className="text-sm sm:text-base text-slate-300">
          Superadmin handles setup and billing. Admins (partners, parents, or optional co-parents) manage schedules and household settings. Kids get the Kids World Monster Den, themed rooms, and a device-only sealed journal with guardian consent. Pets track feeding in “Who Fed the Dog?” and never count against your subscription seats.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {ROLES.map((r) => (
          <div
            key={r.label}
            className={`rounded-3xl bg-slate-900/70 border ${r.border} p-5 flex flex-col items-center text-center gap-3 backdrop-blur-xl shadow-lg hover:-translate-y-1 transition-all duration-200`}
          >
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-tr ${r.color} flex items-center justify-center text-3xl shadow-lg ring-2 ring-white/15`}>
              {r.emoji}
            </div>
            <h3 className="text-base font-extrabold text-white">{r.label}</h3>
            <p className="text-xs text-slate-300 leading-relaxed">{r.blurb}</p>
          </div>
        ))}
      </div>
    </section>
  );
}