import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  Copy,
  Check,
  ArrowRight,
  RefreshCw,
  MessageSquare,
  X,
} from 'lucide-react';
import {
  analyzeCoParentTone,
  deescalateWithHermes,
  type ToneAnalysis,
  type DeescalationResult,
} from '@/lib/hermesNeutral';
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
import { Textarea } from '@/components/ui/textarea';

interface BiffToneCheckModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialText?: string;
  onApplyText?: (text: string) => void;
}

export const BiffToneCheckModal: React.FC<BiffToneCheckModalProps> = ({
  open,
  onOpenChange,
  initialText = '',
  onApplyText,
}) => {
  const [draft, setDraft] = useState(initialText);
  const [analysis, setAnalysis] = useState<ToneAnalysis>(() => analyzeCoParentTone(initialText));
  const [deescalation, setDeescalation] = useState<DeescalationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    requestIdRef.current++;
    if (open) {
      setDraft(initialText);
      setAnalysis(analyzeCoParentTone(initialText));
      setDeescalation(null);
      setCopied(false);
      setLoading(false);
    }
  }, [open, initialText]);

  const handleDraftChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    requestIdRef.current++;
    const val = e.target.value;
    setDraft(val);
    setAnalysis(analyzeCoParentTone(val));
    setDeescalation(null);
  };

  const handleDeescalate = async () => {
    if (!draft.trim() || loading) return;
    const currentId = ++requestIdRef.current;
    setLoading(true);
    try {
      const res = await deescalateWithHermes(draft);
      if (currentId !== requestIdRef.current) return;
      setDeescalation(res);
      if (res.toneAfter === 'calm') {
        triggerConfetti(window.innerWidth / 2, window.innerHeight * 0.45, 30);
      }
    } catch {
      if (currentId !== requestIdRef.current) return;
      toast({
        title: 'Error de-escalating',
        description: 'Could not process tone de-escalation.',
        variant: 'destructive',
      });
    } finally {
      if (currentId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const handleCopyDeescalated = async () => {
    const textToCopy = deescalation?.deescalated || draft;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      toast({
        title: 'Copied to Clipboard! 📋',
        description: 'Neutralized message ready to paste.',
      });
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast({ title: 'Could not copy', variant: 'destructive' });
    }
  };

  const handleApply = () => {
    if (onApplyText && deescalation?.deescalated) {
      onApplyText(deescalation.deescalated);
      onOpenChange(false);
      toast({ title: 'Neutral text applied!' });
    }
  };

  const getScoreBadge = () => {
    if (!draft.trim()) {
      return (
        <span className="text-xs text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full">
          Ready for draft
        </span>
      );
    }
    if (analysis.score === 'calm') {
      return (
        <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" /> Calm & Constructive
        </span>
      );
    }
    if (analysis.score === 'tense') {
      return (
        <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> Tense Tone Detected
        </span>
      );
    }
    return (
      <span className="text-xs font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-full flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5" /> High Conflict Warning
      </span>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl bg-slate-900 border-slate-800 text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-bold tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Hermes Neutral Mode
            </span>
            {getScoreBadge()}
          </div>
          <DialogTitle className="text-xl font-black text-white mt-1">
            BIFF Co-Parent Tone Assistant
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            Check your co-parent message draft against BIFF standards (Brief, Informative, Friendly, Firm) to eliminate conflict and keep the focus on the kids.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-semibold text-slate-300 mb-1.5 block">
              Your Message Draft
            </label>
            <Textarea
              placeholder="Paste or write your message here (e.g. swap request, schedule note, school question)..."
              value={draft}
              onChange={handleDraftChange}
              rows={4}
              className="bg-slate-950 border-slate-800 text-white text-sm focus:border-amber-400"
            />
          </div>

          {/* Tone Feedback */}
          {analysis.detectedFlags.length > 0 && (
            <div className="bg-slate-950/80 border border-amber-500/20 rounded-2xl p-3.5 space-y-2">
              <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Potential Conflict Triggers
              </div>
              <ul className="text-xs text-slate-300 space-y-1 list-disc pl-4">
                {analysis.detectedFlags.map((flag, idx) => (
                  <li key={idx}>
                    <strong>{flag}</strong>
                  </li>
                ))}
              </ul>

              {analysis.biffTips.length > 0 && (
                <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
                  <strong className="text-slate-300">BIFF Tip:</strong> {analysis.biffTips[0]}
                </div>
              )}
            </div>
          )}

          {/* Action button to de-escalate */}
          <div className="flex justify-end">
            <Button
              onClick={handleDeescalate}
              disabled={!draft.trim() || loading}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs gap-1.5 shadow-md shadow-emerald-500/20"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Neutralizing Tone...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" /> De-escalate with Hermes
                </>
              )}
            </Button>
          </div>

          {/* De-escalated Result */}
          {deescalation && (
            <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-400">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" /> Neutralized BIFF Message
                </span>
                <span className={`text-[11px] px-2 py-0.5 rounded-md border ${
                  deescalation.toneAfter === 'calm'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : deescalation.toneAfter === 'tense'
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                }`}>
                  {deescalation.toneAfter === 'calm' ? 'Calm & De-escalated' : deescalation.toneAfter === 'tense' ? 'Partially Softened' : 'Review Carefully'}
                  {deescalation.isFallback ? ' (Offline Heuristic)' : ''}
                </span>
              </div>

              <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 font-medium whitespace-pre-wrap">
                {deescalation.deescalated}
              </div>

              {deescalation.changesMade.length > 0 && (
                <div className="space-y-1 text-xs text-slate-400">
                  <div className="font-semibold text-slate-300">Changes made:</div>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                    {deescalation.changesMade.map((c, idx) => (
                      <li key={idx}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopyDeescalated}
                  className="text-xs border-slate-700 hover:bg-slate-800 gap-1.5"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copy Neutral Text
                    </>
                  )}
                </Button>

                {onApplyText && (
                  <Button
                    size="sm"
                    onClick={handleApply}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" /> Apply to Message
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-slate-800 pt-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="text-xs border-slate-700 hover:bg-slate-800"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BiffToneCheckModal;
