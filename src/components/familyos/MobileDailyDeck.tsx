import { useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, HeartHandshake, Sparkles } from 'lucide-react';

const MOMENTS = ['Right now', 'Coming up', 'Stay close'] as const;

interface MobileDailyDeckProps {
  focusCard: ReactNode;
  upcoming?: { name: string; person?: string; scheduledAt: number };
  openPromises: number;
  isChild: boolean;
  onNav: (module: string) => void;
  onQuickAdd: (module: string) => void;
}

export default function MobileDailyDeck({ focusCard, upcoming, openPromises, isChild, onNav, onQuickAdd }: MobileDailyDeckProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeMoment, setActiveMoment] = useState(0);

  const goToMoment = (index: number) => {
    const next = Math.max(0, Math.min(MOMENTS.length - 1, index));
    const track = trackRef.current;
    const panel = track?.children[next] as HTMLElement | undefined;
    if (!track || !panel) return;
    track.scrollTo({ left: panel.offsetLeft, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    setActiveMoment(next);
  };

  const onScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    setActiveMoment(Math.min(MOMENTS.length - 1, Math.round(track.scrollLeft / (track.clientWidth + 12))));
  };

  const nextDate = upcoming && Number.isFinite(upcoming.scheduledAt)
    ? new Date(upcoming.scheduledAt).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
    : null;

  return (
    <section className="fo-daily-deck" aria-label="Your day in three moments">
      <div className="fo-deck-heading">
        <div><span className="fo-dashboard-eyebrow">Make today yours</span><h3>Your day, your way.</h3><p>Swipe through what matters. Start anywhere.</p></div>
        <span className="fo-deck-count" aria-live="polite">0{activeMoment + 1} / 0{MOMENTS.length}</span>
      </div>

      <div id="familyos-daily-deck" ref={trackRef} onScroll={onScroll} className="fo-deck-track">
        <div className="fo-deck-panel" aria-label="Right now: one focused step">{focusCard}</div>

        <div className="fo-deck-panel fo-deck-story fo-deck-plan" aria-label="Coming up: your plans">
          <div className="fo-deck-story-top"><span>02 / LOOK AHEAD</span><CalendarDays className="w-6 h-6" aria-hidden="true" /></div>
          <div className="fo-deck-story-body"><span className="fo-deck-orb"><CalendarDays className="w-8 h-8" aria-hidden="true" /></span>
            <p className="fo-deck-kicker">A little anticipation goes a long way</p>
            <h4>{upcoming?.name || 'Leave room for something good.'}</h4>
            <p>{nextDate ? `${nextDate}${upcoming?.person ? ` · with ${upcoming.person}` : ''}` : 'Nothing on the calendar? Make a little time together.'}</p>
          </div>
          <button type="button" className="fo-deck-cta" onClick={() => isChild ? onNav('family') : onQuickAdd('quality')}>{isChild ? 'See your family' : 'Plan time together'} <ArrowUpRight className="w-5 h-5" aria-hidden="true" /></button>
        </div>

        <div className="fo-deck-panel fo-deck-story fo-deck-connect" aria-label="Stay close: your promises">
          <div className="fo-deck-story-top"><span>03 / STAY CLOSE</span><HeartHandshake className="w-6 h-6" aria-hidden="true" /></div>
          <div className="fo-deck-story-body"><span className="fo-deck-orb"><Sparkles className="w-8 h-8" aria-hidden="true" /></span>
            <p className="fo-deck-kicker">The little things count</p>
            <h4>{isChild ? 'Every little win counts.' : openPromises ? `${openPromises} ${openPromises === 1 ? 'promise' : 'promises'} to keep close.` : 'Make a moment matter.'}</h4>
            <p>{isChild ? 'See what you’ve earned and keep your momentum going.' : openPromises ? 'A gentle nudge to follow through for someone you love.' : 'A thoughtful promise can make someone’s whole day.'}</p>
          </div>
          <div className="fo-deck-connect-actions">
            <button type="button" className="fo-deck-cta" onClick={() => isChild ? onNav('rewards') : onQuickAdd('promises')}>{isChild ? 'See your rewards' : 'Make a promise'} <ArrowUpRight className="w-5 h-5" aria-hidden="true" /></button>
            {!isChild && openPromises > 0 && <button type="button" className="fo-deck-secondary" onClick={() => onNav('promises')}>See promises</button>}
          </div>
        </div>
      </div>

      <div className="fo-deck-controls">
        <button type="button" className="fo-deck-arrow" onClick={() => goToMoment(activeMoment - 1)} disabled={activeMoment === 0} aria-label="Previous moment" aria-controls="familyos-daily-deck"><ChevronLeft className="w-5 h-5" /></button>
        <div className="fo-deck-dots" aria-label="Choose a moment">{MOMENTS.map((moment, index) => (
          <button key={moment} type="button" className={activeMoment === index ? 'fo-deck-dot fo-deck-dot-active' : 'fo-deck-dot'} onClick={() => goToMoment(index)} aria-label={`Show ${moment}`} aria-current={activeMoment === index ? 'step' : undefined} aria-controls="familyos-daily-deck" />
        ))}</div>
        <button type="button" className="fo-deck-arrow" onClick={() => goToMoment(activeMoment + 1)} disabled={activeMoment === MOMENTS.length - 1} aria-label="Next moment" aria-controls="familyos-daily-deck"><ChevronRight className="w-5 h-5" /></button>
      </div>
    </section>
  );
}
