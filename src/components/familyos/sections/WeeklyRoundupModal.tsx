import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Share2,
  Copy,
  Check,
  Flame,
  Pill,
  Sparkles,
  Trophy,
  ArrowRight,
  Clock,
  Home,
  CheckCircle2,
} from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import {
  generateWeeklyRoundup,
  formatWeeklyRoundupText,
  type WeeklyRoundupData,
} from '@/lib/weeklyRoundup';
import { triggerConfetti } from '@/lib/confetti';
import { toast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface WeeklyRoundupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const WeeklyRoundupModal: React.FC<WeeklyRoundupModalProps> = ({
  open,
  onOpenChange,
}) => {
  const { householdMembers } = useAppContext();
  const [copied, setCopied] = useState(false);

  const roundupData: WeeklyRoundupData = useMemo(() => {
    return generateWeeklyRoundup(householdMembers);
  }, [householdMembers, open]);

  const handleCopy = async () => {
    const text = formatWeeklyRoundupText(roundupData);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      triggerConfetti(window.innerWidth / 2, window.innerHeight * 0.4, 40);
      toast({
        title: 'Copied to Clipboard! 📋',
        description: 'Clean, child-centered digest ready to send via SMS or email.',
      });
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast({
        title: 'Could not copy',
        description: 'Please select the text manually.',
        variant: 'destructive',
      });
    }
  };

  const handleShare = async () => {
    const text = formatWeeklyRoundupText(roundupData);
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Weekly Family Digest (${roundupData.startDate} - ${roundupData.endDate})`,
          text,
        });
      } catch {
        // User cancelled share
      }
    } else {
      handleCopy();
    }
  };

  const totalOvernights =
    roundupData.custody.primaryOvernights + roundupData.custody.secondaryOvernights;
  const primaryPct =
    totalOvernights > 0
      ? Math.round((roundupData.custody.primaryOvernights / totalOvernights) * 100)
      : 50;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-slate-900 border-slate-800 text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase font-bold tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Weekly Family Digest
            </span>
          </div>
          <DialogTitle className="text-2xl font-black text-white">
            Weekly Logistics & Momentum Roundup
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            Past 7 days accomplishments and next 7 days co-parent logistics ({roundupData.startDate} to {roundupData.endDate}).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Custody Overnights Card */}
          {(roundupData.custody.primaryOvernights > 0 ||
            roundupData.custody.secondaryOvernights > 0) && (
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                <span className="flex items-center gap-1.5 text-amber-400">
                  <Home className="w-4 h-4" /> Custody Overnights (Coming Week)
                </span>
                <span className="text-slate-400 font-mono text-[11px]">7 Days Total</span>
              </div>

              {/* Progress bar split */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium">
                    {roundupData.custody.primaryHouseName}:{' '}
                    <strong className="text-white">{roundupData.custody.primaryOvernights} nights</strong>
                  </span>
                  <span className="text-slate-300 font-medium">
                    {roundupData.custody.secondaryHouseName}:{' '}
                    <strong className="text-white">{roundupData.custody.secondaryOvernights} nights</strong>
                  </span>
                </div>
                <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden flex">
                  <div
                    className="bg-amber-500 h-full transition-all duration-500"
                    style={{ width: `${primaryPct}%` }}
                    title={`${roundupData.custody.primaryHouseName}: ${primaryPct}%`}
                  />
                  <div
                    className="bg-sky-500 h-full transition-all duration-500"
                    style={{ width: `${100 - primaryPct}%` }}
                    title={`${roundupData.custody.secondaryHouseName}: ${100 - primaryPct}%`}
                  />
                </div>
              </div>

              {/* Transitions */}
              {roundupData.custody.transitions.length > 0 && (
                <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-400">
                    Transitions this week:
                  </div>
                  {roundupData.custody.transitions.map((t, idx) => (
                    <div
                      key={idx}
                      className="text-xs bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl flex items-center justify-between text-slate-300"
                    >
                      <span>
                        <strong>{t.dayOfWeek}</strong> ({t.date})
                      </span>
                      <span className="flex items-center gap-1 text-sky-400 text-[11px] font-semibold">
                        <ArrowRight className="w-3 h-3" /> Hand-off to {t.toHousehold}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Kid Momentum Card */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <Trophy className="w-4 h-4" /> Chores Tamed & Kid Streaks
              </span>
              <span className="text-slate-400 font-mono text-[11px]">
                {roundupData.choresAndStreaks.totalChoresCompleted} total tasks done
              </span>
            </div>

            {roundupData.choresAndStreaks.activeKids.length === 0 ? (
              <div className="text-xs text-slate-500">No child activities recorded this week.</div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2.5">
                {roundupData.choresAndStreaks.activeKids.map((kid) => (
                  <div
                    key={kid.name}
                    className="bg-slate-900 border border-slate-800/90 rounded-xl p-3 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-sm font-bold text-white">{kid.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {kid.choresDone} chores completed
                      </div>
                    </div>

                    <div className="text-right space-y-1">
                      <div className="text-xs font-mono font-bold text-amber-400">
                        {kid.xpBalance} XP
                      </div>
                      {kid.streakDays > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                          <Flame className="w-3 h-3" /> {kid.streakDays}d
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Health & Medications Card */}
          {roundupData.health.activeMedications.length > 0 && (
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-2.5">
              <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5 text-rose-400">
                <Pill className="w-4 h-4" /> Active Medications & Dosing Log
              </div>

              <div className="space-y-1.5">
                {roundupData.health.activeMedications.map((m, idx) => (
                  <div
                    key={idx}
                    className="text-xs bg-slate-900 border border-slate-800 px-3 py-2 rounded-xl flex items-center justify-between text-slate-300"
                  >
                    <div>
                      <span className="font-bold text-white">{m.kidName}:</span>{' '}
                      <span>{m.medName}</span>
                      {m.dosage && <span className="text-slate-400"> ({m.dosage})</span>}
                    </div>
                    <span className="text-[11px] font-mono text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                      {m.dosesLoggedLast7Days} doses logged
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Events Card */}
          {roundupData.upcomingEvents.length > 0 && (
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-2.5">
              <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5 text-sky-400">
                <Clock className="w-4 h-4" /> Upcoming Events (Next 7 Days)
              </div>

              <div className="space-y-1.5">
                {roundupData.upcomingEvents.map((e, idx) => (
                  <div
                    key={idx}
                    className="text-xs bg-slate-900 border border-slate-800 px-3 py-2 rounded-xl flex items-center justify-between text-slate-300"
                  >
                    <span className="font-medium text-white">{e.title}</span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {e.date} {e.time ? `@ ${e.time}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-800">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="text-xs border-slate-700 hover:bg-slate-800"
          >
            Close
          </Button>

          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <Button
              variant="outline"
              onClick={handleShare}
              className="text-xs border-slate-700 hover:bg-slate-800 gap-1.5 text-sky-300"
            >
              <Share2 className="w-3.5 h-3.5" /> Share Digest
            </Button>
          )}

          <Button
            onClick={handleCopy}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs gap-1.5 shadow-md shadow-amber-500/20"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" /> Copied!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" /> Copy Co-Parent Digest
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WeeklyRoundupModal;
