// src/components/familyos/sections/SchoolStuffModal.tsx
// School Stuff Adder Modal: Ingests teacher emails, newsletters, flyers & homework
import React, { useState, useRef } from 'react';
import {
  GraduationCap,
  Sparkles,
  BookOpen,
  Calendar,
  Upload,
  Check,
  Loader2,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import {
  parseSchoolAnnouncement,
  saveSchoolItems,
  type SchoolItem,
  type SchoolItemType,
} from '@/lib/schoolAdder';
import { callClaudeVision, callGeminiVision } from '@/lib/familyos';
import { tryOnDeviceVision } from '@/lib/onDeviceVision';
import { fileToJpegBase64 } from '@/lib/imageUtils';
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

interface SchoolStuffModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onItemsSaved?: (counts: { homeworkAdded: number; eventsAdded: number; tasksAdded: number }) => void;
}

export const SchoolStuffModal: React.FC<SchoolStuffModalProps> = ({
  open,
  onOpenChange,
  onItemsSaved,
}) => {
  const { householdMembers, currentUser } = useAppContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reqIdRef = useRef(0);

  const kids = householdMembers.filter((m) => m.role === 'child').map((m) => m.name);
  const [selectedKid, setSelectedKid] = useState<string>(kids[0] || 'Child');
  const effectiveKid = kids.includes(selectedKid) ? selectedKid : kids[0] ?? 'Child';

  const [rawText, setRawText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [parsedItems, setParsedItems] = useState<SchoolItem[]>([]);
  const [isFallbackNotice, setIsFallbackNotice] = useState(false);
  const [ocrActive, setOcrActive] = useState(false);

  const handleReset = () => {
    reqIdRef.current += 1;
    setRawText('');
    setParsedItems([]);
    setIsFallbackNotice(false);
    setParsing(false);
    setOcrLoading(false);
    setOcrActive(false);
  };

  const handleClose = () => {
    handleReset();
    onOpenChange(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) handleReset();
    onOpenChange(nextOpen);
  };

  const handleParse = async () => {
    if (!rawText.trim() || parsing) return;
    const curReqId = ++reqIdRef.current;
    setParsing(true);
    setIsFallbackNotice(false);
    try {
      const res = await parseSchoolAnnouncement(rawText, kids, effectiveKid);
      if (curReqId !== reqIdRef.current) return;

      const mapped = ocrActive
        ? res.items.map((i) => ({ ...i, source: 'ocr_scan' as const }))
        : res.items;

      setParsedItems(mapped);
      setIsFallbackNotice(res.isFallback);
      if (res.items.length > 0) {
        toast({
          title: `Found ${res.items.length} school item${res.items.length > 1 ? 's' : ''}`,
          description: 'Review and assign items before saving to Kids Hub.',
        });
      } else {
        toast({
          title: 'No actionable items found',
          description: 'Try adding more context or details from the announcement.',
        });
      }
    } catch {
      if (curReqId === reqIdRef.current) {
        toast({
          title: 'Error parsing announcement',
          description: 'Please check your text or try again.',
          variant: 'destructive',
        });
      }
    } finally {
      if (curReqId === reqIdRef.current) {
        setParsing(false);
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const curReqId = ++reqIdRef.current;
    setOcrLoading(true);
    try {
      const base64 = await fileToJpegBase64(file);
      const ocrPrompt = `Transcribe all visible text from this school flyer, newsletter, assignment, or syllabus accurately. Include all dates, subjects, names, and instructions.`;

      let transcribedText = '';
      const onDevice = await tryOnDeviceVision(base64, ocrPrompt);
      if (onDevice.ok && onDevice.text) {
        transcribedText = onDevice.text;
      } else {
        const cloud = await callClaudeVision(base64, 'image/jpeg', ocrPrompt);
        if (cloud.ok) {
          transcribedText = cloud.text;
        } else {
          const gemini = await callGeminiVision(base64, 'image/jpeg', ocrPrompt);
          if (gemini.ok) transcribedText = gemini.text;
        }
      }

      if (curReqId !== reqIdRef.current) return;

      if (transcribedText) {
        setOcrActive(true);
        setRawText((prev) => (prev ? `${prev}\n\n${transcribedText}` : transcribedText));
        toast({
          title: 'Image text extracted! 📷',
          description: 'Now click "Extract School Items" to parse tasks & dates.',
        });
      } else {
        toast({
          title: 'Could not read text from image',
          description: 'Please ensure image is clear and well lit, or type the text directly.',
          variant: 'destructive',
        });
      }
    } catch {
      if (curReqId === reqIdRef.current) {
        toast({ title: 'Error processing photo', variant: 'destructive' });
      }
    } finally {
      if (curReqId === reqIdRef.current) {
        setOcrLoading(false);
      }
    }
  };

  const toggleItemSelection = (id: string) => {
    setParsedItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, selected: !i.selected } : i))
    );
  };

  const updateItemKid = (id: string, newKid: string) => {
    setParsedItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, kid: newKid } : i))
    );
  };

  const updateItemType = (id: string, newType: SchoolItemType) => {
    setParsedItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, type: newType } : i))
    );
  };

  const removeItem = (id: string) => {
    setParsedItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleSave = () => {
    const selected = parsedItems.filter((i) => i.selected !== false);
    if (selected.length === 0) {
      toast({ title: 'No items selected to save' });
      return;
    }

    const counts = saveSchoolItems(selected, currentUser?.name || 'Parent');
    triggerConfetti(undefined, undefined, 35);
    toast({
      title: 'School Items Added! 🎒',
      description: `${counts.homeworkAdded} homework, ${counts.eventsAdded} events, and ${counts.tasksAdded} action items saved.`,
    });

    if (onItemsSaved) {
      onItemsSaved(counts);
    }
    handleClose();
  };

  const selectedCount = parsedItems.filter((i) => i.selected !== false).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl bg-slate-900 border-slate-800 text-white max-h-[90vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <GraduationCap className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                School Stuff Adder
                <span className="text-[10px] bg-sky-500/20 text-sky-300 border border-sky-500/30 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                  AI Triage
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Paste teacher emails, flyers, or newsletters to automatically extract homework, picture days, and permission slips.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 pr-1 scrollbar-thin">
          {/* Target Kid Selector & OCR Upload Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Default Student:</span>
              <select
                value={effectiveKid}
                onChange={(e) => setSelectedKid(e.target.value)}
                className="bg-slate-800 text-xs text-slate-200 border border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-500 font-semibold"
              >
                {kids.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                {kids.length === 0 && <option value="Child">Child</option>}
              </select>
            </div>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={ocrLoading}
                className="text-xs border-slate-700 hover:bg-slate-800 text-slate-200 gap-1.5"
              >
                {ocrLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
                    <span>Reading Photo...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5 text-sky-400" />
                    <span>Scan Flyer / Photo</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Text Area */}
          <div>
            <Textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste email text, school announcement, or flyer notes here...&#10;&#10;e.g. 'Science fair project outline due next Friday Oct 16. Also please return the zoo permission slip with $10 cash by Tuesday.'"
              rows={4}
              className="w-full bg-slate-950/80 border-slate-800 text-slate-200 placeholder:text-slate-500 text-xs rounded-xl focus:border-sky-500/50"
            />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleParse}
              disabled={!rawText.trim() || parsing || ocrLoading}
              className="bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-slate-950 font-bold text-xs gap-1.5 shadow-md shadow-sky-500/20"
            >
              {parsing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Analyzing School Announcement...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Extract School Items</span>
                </>
              )}
            </Button>
          </div>

          {isFallbackNotice && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5 text-xs text-amber-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>Offline parsing heuristics used. Please verify dates and details.</span>
            </div>
          )}

          {/* Extracted Items Section */}
          {parsedItems.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                <span>Extracted Actionable Items ({parsedItems.length})</span>
                <span className="text-[11px] text-slate-400 font-normal">
                  Checked items will be added to the household schedule
                </span>
              </div>

              <div className="space-y-2.5">
                {parsedItems.map((item) => (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-xl border transition-all ${
                      item.selected !== false
                        ? 'bg-slate-950/80 border-slate-700/80'
                        : 'bg-slate-950/40 border-slate-800/40 opacity-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 flex-1">
                        <input
                          type="checkbox"
                          checked={item.selected !== false}
                          onChange={() => toggleItemSelection(item.id)}
                          className="mt-1 rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-sky-500"
                        />
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-white">
                              {item.title}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                                item.type === 'homework'
                                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                                  : item.type === 'event'
                                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {item.type === 'action_item'
                                ? 'Action / Form'
                                : item.type}
                            </span>
                            {item.requiresParentSignoff && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                ✍️ Sign-off
                              </span>
                            )}
                            {item.requiresPayment && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                💵 {item.paymentAmount ? `$${item.paymentAmount}` : 'Payment'}
                              </span>
                            )}
                          </div>

                          {item.notes && (
                            <p className="text-xs text-slate-400 line-clamp-2">
                              {item.notes}
                            </p>
                          )}

                          <div className="flex items-center gap-3 text-xs text-slate-400 pt-1 flex-wrap">
                            {item.dueDate && (
                              <span className="flex items-center gap-1 text-slate-300">
                                <Calendar className="w-3.5 h-3.5 text-sky-400" />
                                {item.dueDate} {item.dueTime || ''}
                              </span>
                            )}
                            {item.subject && item.type === 'homework' && (
                              <span className="flex items-center gap-1 text-slate-400">
                                <BookOpen className="w-3.5 h-3.5" />
                                {item.subject}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <select
                          value={item.kid}
                          onChange={(e) => updateItemKid(item.id, e.target.value)}
                          className="bg-slate-800 text-[11px] text-slate-300 border border-slate-700 rounded px-2 py-1 focus:outline-none"
                        >
                          {kids.map((k) => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                        </select>
                        <select
                          value={item.type}
                          onChange={(e) =>
                            updateItemType(item.id, e.target.value as SchoolItemType)
                          }
                          className="bg-slate-800 text-[11px] text-slate-300 border border-slate-700 rounded px-2 py-1 focus:outline-none"
                        >
                          <option value="homework">Homework</option>
                          <option value="event">Event</option>
                          <option value="action_item">Action Item</option>
                        </select>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="text-slate-500 hover:text-rose-400 p-1"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-slate-800 pt-3 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {parsedItems.length > 0 && (
              <span>
                {selectedCount} of {parsedItems.length} items ready to save
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleClose}
              className="text-xs border-slate-700 hover:bg-slate-800"
            >
              Cancel
            </Button>
            {parsedItems.length > 0 && (
              <Button
                onClick={handleSave}
                disabled={selectedCount === 0}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs gap-1.5 shadow-md shadow-emerald-500/20"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save to Kids Hub ({selectedCount})</span>
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SchoolStuffModal;
