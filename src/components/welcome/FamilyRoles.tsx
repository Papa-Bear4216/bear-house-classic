const ROLES = [
  { label: 'Superadmin', emoji: '👑', color: 'bg-indigo-500' },
  { label: 'Admin', emoji: '🛠️', color: 'bg-pink-500' },
  { label: 'Kid', emoji: '🎨', color: 'bg-blue-500' },
  { label: 'Pet', emoji: '🐾', color: 'bg-amber-500' },
];

export function FamilyRoles() {
  return (
    <section className="text-center px-4 py-16 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-white mb-2">Built for the whole family</h2>
      <p className="text-slate-400 mb-8">Every member gets a role that fits — yes, even the dog.</p>
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