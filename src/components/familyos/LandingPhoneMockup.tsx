export default function LandingPhoneMockup() {
  return (
    <div
      className="w-[320px] rounded-[36px] p-2.5 shadow-2xl"
      style={{ background: 'var(--bark-800)', border: '6px solid var(--bark-800)' }}
    >
      <div className="rounded-[26px] overflow-hidden" style={{ background: 'var(--cream-200)' }}>
        <div style={{ background: 'var(--bark-700)' }} className="px-[18px] pt-[18px] pb-[18px] text-white">
          <div className="flex items-center justify-between mb-3.5">
            <div>
              <div className="bh-font-display font-bold text-xl">Hey Maya</div>
              <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
                The Hebert House
              </div>
            </div>
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white"
              style={{ background: 'var(--honey-500)' }}
            >
              M
            </div>
          </div>
          <div className="rounded-[14px] px-3.5 py-3" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div className="flex justify-between mb-2 text-xs">
              <span style={{ color: 'rgba(255,255,255,0.7)' }} className="font-medium">
                Today's progress
              </span>
              <span style={{ color: 'var(--honey-200)' }} className="font-bold">
                2/3 done
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.15)' }}>
              <div className="h-full rounded-full" style={{ width: '67%', background: 'var(--honey-500)' }} />
            </div>
          </div>
        </div>
        <div className="p-4 flex flex-col gap-2.5">
          <div className="flex gap-2">
            <div
              className="flex-1 rounded-xl p-3 bg-white"
              style={{ border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-sm)' }}
            >
              <div className="bh-font-display text-[22px] font-extrabold" style={{ color: 'var(--sage-500)' }}>
                240
              </div>
              <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--fg-muted)' }}>
                Points
              </div>
            </div>
            <div
              className="flex-1 rounded-xl p-3 bg-white"
              style={{ border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-sm)' }}
            >
              <div className="bh-font-display text-[22px] font-extrabold" style={{ color: 'var(--honey-600)' }}>
                7
              </div>
              <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--fg-muted)' }}>
                Day streak
              </div>
            </div>
          </div>
          <div className="bh-font-display font-bold text-sm mt-1" style={{ color: 'var(--fg-primary)' }}>
            Your day at a glance
          </div>
          <div
            className="bg-white rounded-xl px-3 py-2.5 flex items-center gap-2.5 opacity-60"
            style={{ border: '1px solid var(--sage-200)' }}
          >
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[11px] shrink-0"
              style={{ background: 'var(--sage-500)' }}
            >
              ✓
            </div>
            <div
              className="flex-1 text-[13px] font-semibold line-through"
              style={{ color: 'var(--fg-muted)' }}
            >
              Bank synced this morning
            </div>
            <div
              className="text-[11px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'var(--sage-100)', color: 'var(--sage-600)' }}
            >
              done
            </div>
          </div>
          <div
            className="bg-white rounded-xl px-3 py-2.5 flex items-center gap-2.5"
            style={{ border: '1.5px solid var(--honey-400)', boxShadow: 'var(--shadow-sm)' }}
          >
            <div className="w-5 h-5 rounded-full shrink-0" style={{ border: '2px solid var(--stone-300)' }} />
            <div className="flex-1 text-[13px] font-semibold" style={{ color: 'var(--fg-primary)' }}>
              Take out recycling
            </div>
            <div
              className="text-[11px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'var(--honey-100)', color: 'var(--honey-700)' }}
            >
              +30
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
