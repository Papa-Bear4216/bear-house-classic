const ROLES = [
  { label: 'Superadmin', emoji: '👑', color: 'bg-indigo-500' },
  { label: 'Admin', emoji: '🛠️', color: 'bg-pink-500' },
  { label: 'Child', emoji: '🎨', color: 'bg-blue-500' },
  { label: 'Pet', emoji: '🐾', color: 'bg-amber-500' },
];

export function FamilyRoles() {
  return (
    <section className="text-center px-4 py-16 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-white mb-2">Four clear roles</h2>
      <p className="text-slate-400 mb-8 max-w-lg mx-auto">
        Superadmin handles setup and billing. Admins (like a co-parent or partner) manage schedules and calm swaps. Kids get chores, routines, customizable themed rooms unlocked with chore points, and a device-only sealed private journal parents can’t peek into—with guardian consent required. Pets track feeding and walks, and they never count against your subscription seats (pets don’t pay rent either).
      </p>
      <div className="flex flex-wrap justify-center gap-4">
        {ROLES.map((r) => (
          <div key={r.label} className="flex flex-col items-center gap-2">
            <div className={`w-16 h-16 rounded-full ${r.color} flex items-center justify-center text-2xl`}>
              {r.emoji}
            </div>
            <span className="text-sm text-slate-300">{r.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}