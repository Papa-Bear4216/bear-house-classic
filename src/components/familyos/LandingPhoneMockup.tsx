export default function LandingPhoneMockup() {
  return (
    <div className="w-[320px] rounded-[44px] p-3 shadow-2xl bg-[#090D16] border-4 border-slate-800 ring-1 ring-white/20">
      <div className="rounded-[32px] overflow-hidden bg-[#070a12] border border-white/10 text-slate-100">
        <div className="bg-slate-900/80 backdrop-blur-md px-[18px] pt-[18px] pb-[16px] border-b border-white/5">
          <div className="flex items-center justify-between mb-3.5">
            <div>
              <div className="font-display font-bold text-xl text-white">Hey Maya</div>
              <div className="text-xs text-slate-400 mt-0.5">
                The Hebert House
              </div>
            </div>
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-slate-950 bg-gradient-to-tr from-amber-400 to-orange-500 shadow-md">
              M
            </div>
          </div>
          <div className="rounded-2xl px-3.5 py-3 bg-slate-800/60 border border-white/5">
            <div className="flex justify-between mb-2 text-xs">
              <span className="text-slate-300 font-semibold">Today's chaos tamed</span>
              <span className="text-emerald-400 font-bold">2/3 done</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden bg-slate-950 p-0.5">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-500" style={{ width: '67%' }} />
            </div>
          </div>
        </div>
        <div className="p-4 flex flex-col gap-2.5">
          <div className="flex gap-2">
            <div className="flex-1 rounded-2xl p-3 bg-slate-900/70 border border-white/10 shadow-sm">
              <div className="font-display text-[22px] font-extrabold text-emerald-400 tabular-nums">
                240
              </div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Points
              </div>
            </div>
            <div className="flex-1 rounded-2xl p-3 bg-slate-900/70 border border-white/10 shadow-sm">
              <div className="font-display text-[22px] font-extrabold text-amber-400 tabular-nums">
                7d
              </div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Streak 🔥
              </div>
            </div>
          </div>
          <div className="font-display font-bold text-xs uppercase tracking-wider text-slate-400 mt-1">
            Focus Spotlight
          </div>
          <div className="bg-slate-900/40 rounded-2xl px-3.5 py-2.5 flex items-center gap-2.5 opacity-60 border border-emerald-500/20">
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-slate-950 font-bold text-[10px] shrink-0 bg-emerald-400">
              ✓
            </div>
            <div className="flex-1 text-[13px] font-medium line-through text-slate-400">
              Bank synced this morning
            </div>
            <div className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              done
            </div>
          </div>
          <div className="bg-slate-900/80 rounded-2xl px-3.5 py-3 flex items-center gap-2.5 border border-amber-500/40 shadow-lg shadow-amber-500/10">
            <div className="w-5 h-5 rounded-full shrink-0 border-2 border-amber-400/80 bg-amber-400/10" />
            <div className="flex-1 text-[13px] font-bold text-white">
              Take out recycling
            </div>
            <div className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
              +30 pts
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
