import { useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';
import { Baby, CalendarDays, Compass, Heart, HeartHandshake, Home, ListChecks, Trophy, type LucideIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { DailySuggestion } from '@/lib/dailySuggestion';

const ADULT_ACTIONS = [
  { id: 'household', label: 'Chores', icon: ListChecks },
  { id: 'quality', label: 'Plans', icon: CalendarDays },
  { id: 'promises', label: 'Promises', icon: HeartHandshake },
  { id: 'emotions', label: 'Check-in', icon: Heart },
] as const;

const CHILD_ACTIONS = [
  { id: 'household', label: 'Chores', icon: ListChecks },
  { id: 'family', label: 'Family', icon: Home },
  { id: 'rewards', label: 'Rewards', icon: Trophy },
  { id: 'kids', label: 'Kids', icon: Baby },
] as const;

interface MobileActionWheelProps {
  suggestion: DailySuggestion;
  isChild: boolean;
  onNav: (module: string) => void;
}

export default function MobileActionWheel({ suggestion, isChild, onNav }: MobileActionWheelProps) {
  const actions: readonly { id: string; label: string; icon: LucideIcon }[] = isChild ? CHILD_ACTIONS : ADULT_ACTIONS;
  const recommendedIndex = Math.max(0, actions.findIndex((action) => action.id === suggestion.module));
  const [selectedIndex, setSelectedIndex] = useState(recommendedIndex);
  const [open, setOpen] = useState(false);
  const lastWheelAt = useRef(0);
  const dialRef = useRef<HTMLDivElement>(null);
  const selected = actions[selectedIndex];

  const selectFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const angle = Math.atan2(event.clientY - rect.top - rect.height / 2, event.clientX - rect.left - rect.width / 2);
    setSelectedIndex((Math.round((angle + Math.PI / 2) / (Math.PI / 2)) + 4) % 4);
  };

  const onDialKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(event.key)) {
      event.preventDefault();
      setSelectedIndex((index) => (index + (event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? 3 : 1)) % 4);
    } else if (event.key === 'Enter' || event.key === ' ') {
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      setOpen(false);
      onNav(selected.id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (nextOpen) setSelectedIndex(recommendedIndex); }}>
      <div className="fo-prediction">
        <div><span className="fo-prediction-eyebrow"><Compass className="w-4 h-4" aria-hidden="true" /> A little ahead of you</span><strong>{suggestion.title}</strong><p>{suggestion.reason}</p></div>
        <DialogTrigger asChild><button type="button" className="fo-prediction-trigger" aria-label="Open your action wheel"><Compass className="w-6 h-6" aria-hidden="true" /><span>Choose</span></button></DialogTrigger>
      </div>
      <DialogContent className="fo-action-wheel-sheet">
        <DialogTitle>What feels right next?</DialogTitle>
        <DialogDescription>Spin the wheel, swipe around it, or use arrow keys. Your suggested choice is highlighted.</DialogDescription>
        <div
          ref={dialRef}
          className="fo-wheel-dial"
          role="group"
          aria-label="Action wheel, use arrow keys to change selection and Enter to open it"
          tabIndex={0}
          onKeyDown={onDialKeyDown}
          onPointerDown={(event) => {
            if (event.target instanceof Element && event.target.closest('button')) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            selectFromPointer(event);
          }}
          onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) selectFromPointer(event); }}
          onWheel={(event) => {
            if (Date.now() - lastWheelAt.current < 130) return;
            lastWheelAt.current = Date.now();
            setSelectedIndex((index) => (index + (event.deltaY > 0 ? 1 : 3)) % 4);
          }}
        >
          <div className="fo-wheel-ring" aria-hidden="true" />
          {actions.map(({ id, label, icon: Icon }, index) => (
            <button key={id} type="button" onClick={() => setSelectedIndex(index)} className={`fo-wheel-option fo-wheel-option-${index} ${selectedIndex === index ? 'fo-wheel-option-selected' : ''}`} aria-pressed={selectedIndex === index} aria-label={`${label}${index === recommendedIndex ? ', suggested' : ''}`}>
              <Icon className="w-6 h-6" aria-hidden="true" /><span>{label}</span>
            </button>
          ))}
          <div className="fo-wheel-center" aria-hidden="true"><Compass className="w-7 h-7" /><span>{selected.label}</span></div>
        </div>
        <p className="fo-wheel-reason">{selectedIndex === recommendedIndex ? `Suggested because ${suggestion.reason.charAt(0).toLowerCase()}${suggestion.reason.slice(1)}` : `Choose ${selected.label.toLowerCase()} whenever you’re ready.`}</p>
        <button type="button" className="fo-wheel-go" onClick={() => { setOpen(false); onNav(selected.id); }}>Go to {selected.label} <span aria-hidden="true">↗</span></button>
      </DialogContent>
    </Dialog>
  );
}
