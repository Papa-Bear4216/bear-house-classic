import React, { useEffect, useRef } from 'react';
import { X, CornerUpLeft } from 'lucide-react';
import { useBentoGrid } from './BentoGridContext';

export interface BentoExpandedModalProps {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  accentColor?: string;
  children: React.ReactNode;
}

export const BentoExpandedModal: React.FC<BentoExpandedModalProps> = ({
  title,
  subtitle,
  icon: Icon,
  children,
}) => {
  const { collapseModule, isExpanding } = useBentoGrid();
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap / initial focus on escape button
  const escapeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    escapeButtonRef.current?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} expanded module`}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 lg:p-8"
    >
      {/* Background Overlay Backdrop: Click anywhere to collapse */}
      <div
        onClick={collapseModule}
        className="fixed inset-0 bg-slate-950/85 backdrop-blur-xl transition-opacity duration-300 ease-out animate-in fade-in"
      />

      {/* Expanded Bento Container with Stiff Spring Spatial Transform */}
      <div
        ref={modalRef}
        className={`
          relative z-10 w-full max-w-6xl max-h-[92vh] flex flex-col
          rounded-3xl bg-slate-900/98 border-2 border-amber-400/40
          shadow-[0_25px_70px_rgba(0,0,0,0.85)]
          backdrop-blur-2xl overflow-hidden
          transition-all duration-300 bento-spring
          ${isExpanding ? 'animate-in zoom-in-95 fade-in duration-200' : ''}
        `}
      >
        {/* Modal Navigation Header */}
        <div className="flex items-center justify-between px-5 sm:px-7 py-4 border-b border-white/10 bg-slate-950/60 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {Icon && (
              <div className="p-2.5 rounded-2xl bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30 flex-shrink-0">
                <Icon className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-white font-extrabold text-lg sm:text-xl tracking-tight truncate">
                  {title}
                </h2>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[11px] font-bold border border-emerald-500/30">
                  Active Inline Frame
                </span>
              </div>
              {subtitle && (
                <p className="text-slate-400 text-xs sm:text-sm truncate mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* High-Contrast Escape Button */}
          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            <button
              ref={escapeButtonRef}
              onClick={collapseModule}
              aria-label="Collapse module and return to bento grid"
              title="Close module (ESC)"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-white/10 hover:bg-rose-500/20 text-slate-200 hover:text-rose-200 border border-white/15 hover:border-rose-500/40 text-xs font-bold transition-all shadow-sm active:scale-95 focus-ring"
            >
              <CornerUpLeft className="w-3.5 h-3.5" />
              <span>Back to Grid</span>
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded-md bg-white/10 border border-white/15 text-[10px] font-mono text-amber-300">
                ESC
              </kbd>
            </button>
            <button
              onClick={collapseModule}
              aria-label="Close"
              className="p-2 rounded-2xl bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white transition sm:hidden"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Interactive Viewport */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          {children}
        </div>
      </div>
    </div>
  );
};
