import React, { useRef } from 'react';
import { Maximize2, ShieldAlert } from 'lucide-react';
import { type BentoModuleId, validateTriadScopeAccess } from '@/lib/triadFusion';
import { useBentoGrid } from './BentoGridContext';

export interface BentoCardProps {
  id: BentoModuleId;
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor?: 'amber' | 'emerald' | 'sky' | 'violet' | 'rose' | 'indigo' | 'cyan';
  colSpan?: 3 | 4 | 5 | 6 | 7 | 8 | 12;
  rowSpan?: 1 | 2;
  children: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

const ACCENT_STYLES = {
  amber: {
    border: 'border-amber-500/30 hover:border-amber-400',
    glow: 'hover:shadow-amber-500/10',
    iconBg: 'bg-amber-500/15 text-amber-300',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  },
  emerald: {
    border: 'border-emerald-500/30 hover:border-emerald-400',
    glow: 'hover:shadow-emerald-500/10',
    iconBg: 'bg-emerald-500/15 text-emerald-300',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  },
  sky: {
    border: 'border-sky-500/30 hover:border-sky-400',
    glow: 'hover:shadow-sky-500/10',
    iconBg: 'bg-sky-500/15 text-sky-300',
    badge: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  },
  violet: {
    border: 'border-violet-500/30 hover:border-violet-400',
    glow: 'hover:shadow-violet-500/10',
    iconBg: 'bg-violet-500/15 text-violet-300',
    badge: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
  },
  rose: {
    border: 'border-rose-500/30 hover:border-rose-400',
    glow: 'hover:shadow-rose-500/10',
    iconBg: 'bg-rose-500/15 text-rose-300',
    badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  },
  indigo: {
    border: 'border-indigo-500/30 hover:border-indigo-400',
    glow: 'hover:shadow-indigo-500/10',
    iconBg: 'bg-indigo-500/15 text-indigo-300',
    badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
  },
  cyan: {
    border: 'border-cyan-500/30 hover:border-cyan-400',
    glow: 'hover:shadow-cyan-500/10',
    iconBg: 'bg-cyan-500/15 text-cyan-300',
    badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
  },
};

const COL_SPANS: Record<number, string> = {
  3: 'col-span-12 md:col-span-6 lg:col-span-3',
  4: 'col-span-12 md:col-span-6 lg:col-span-4',
  5: 'col-span-12 lg:col-span-5',
  6: 'col-span-12 md:col-span-6 lg:col-span-6',
  7: 'col-span-12 lg:col-span-7',
  8: 'col-span-12 lg:col-span-8',
  12: 'col-span-12',
};

export const BentoCard: React.FC<BentoCardProps> = ({
  id,
  title,
  subtitle,
  icon: Icon,
  accentColor = 'amber',
  colSpan = 4,
  rowSpan = 1,
  children,
  badge,
  className = '',
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const { expandModule, scope, expandedModule } = useBentoGrid();

  const access = validateTriadScopeAccess(scope, id);
  const isBlocked = !access.allowed;

  const style = ACCENT_STYLES[accentColor];
  const spanClass = COL_SPANS[colSpan] || 'col-span-12';
  const isCurrentExpanded = expandedModule === id;

  const handleClick = (e: React.MouseEvent) => {
    // Prevent triggering if clicked an interactive child button
    const target = e.target as HTMLElement;
    if (target.closest('button:not([data-bento-card-trigger]), input, a, select')) {
      return;
    }

    if (isBlocked) return;
    expandModule(id, cardRef.current);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!isBlocked) expandModule(id, cardRef.current);
    }
  };

  if (isBlocked) {
    return null; // Strict Triad role separation: do not render unauthorized cards
  }

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      data-bento-card-trigger
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`Open ${title} module`}
      aria-expanded={isCurrentExpanded}
      className={`
        @container bento-card relative group flex flex-col justify-between
        rounded-3xl p-5 sm:p-6
        bg-slate-900/80 hover:bg-slate-900/95
        border-2 ${style.border} ${style.glow}
        shadow-xl hover:shadow-2xl
        backdrop-blur-xl
        transition-all duration-300 bento-spring
        cursor-pointer select-none
        hover:scale-[1.015] active:scale-[0.99]
        outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950
        ${rowSpan === 2 ? 'min-h-[380px]' : 'min-h-[220px]'}
        ${spanClass}
        ${className}
      `}
    >
      {/* High-contrast ambient corner accent */}
      <div className="absolute top-0 right-0 w-32 h-32 rounded-tr-3xl bg-white/[0.02] group-hover:bg-white/[0.04] transition-colors pointer-events-none" />

      {/* Card Header: Icon, Titles, Badges, Expand Affordance */}
      <div className="flex items-start justify-between gap-3 mb-3 relative z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2.5 rounded-2xl ${style.iconBg} ring-1 ring-white/10 flex-shrink-0 group-hover:scale-105 transition-transform`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-white font-bold text-base tracking-tight truncate flex items-center gap-2">
              {title}
            </h3>
            {subtitle && (
              <p className="text-slate-400 text-xs truncate mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {badge}
          <div
            title="Expand inline (ESC to close)"
            className="opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity p-1.5 rounded-xl bg-white/10 text-slate-300 hover:text-white hover:bg-white/20"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* Card Body: Dynamic High-Level Glanceable Stream */}
      <div className="flex-1 my-2 relative z-10 text-slate-200">
        {children}
      </div>

      {/* Card Footer: Glanceable Action Cue */}
      <div className="pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400 relative z-10">
        <span className="flex items-center gap-1.5 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live stream
        </span>
        <span className="group-hover:text-amber-300 font-semibold transition-colors flex items-center gap-1">
          Click to morph <span className="opacity-60 text-[10px]">(or ESC)</span> &rarr;
        </span>
      </div>
    </div>
  );
};
