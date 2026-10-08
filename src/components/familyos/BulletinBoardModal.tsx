import React, { useState, useEffect, useMemo } from 'react';
import {
  X, Pin, Plus, Trash2, AlertCircle, Sparkles, Filter, Check, Clock, User
} from 'lucide-react';
import {
  loadBulletinNotes,
  saveBulletinNotes,
  addBulletinNote,
  deleteBulletinNote,
  togglePinBulletinNote,
  BULLETIN_COLORS,
  BULLETIN_CATEGORIES,
  type BulletinNote,
  type BulletinColor,
  type BulletinCategory,
} from '@/lib/bulletinBoard';
import { useAppContext } from '@/contexts/AppContext';

interface BulletinBoardModalProps {
  open: boolean;
  onClose: () => void;
}

export const BulletinBoardModal: React.FC<BulletinBoardModalProps> = ({ open, onClose }) => {
  const { currentUser, householdMembers } = useAppContext();
  const [notes, setNotes] = useState<BulletinNote[]>(() => loadBulletinNotes());
  const [activeFilter, setActiveFilter] = useState<'all' | BulletinCategory>('all');
  const [isAdding, setIsAdding] = useState(false);

  // Form state for new sticky note
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [color, setColor] = useState<BulletinColor>('amber');
  const [category, setCategory] = useState<BulletinCategory>('general');
  const [targetName, setTargetName] = useState('Everyone');
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNotes(loadBulletinNotes());

    const handleUpdate = () => {
      setNotes(loadBulletinNotes());
    };

    window.addEventListener('familyos:bulletin-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('familyos:bulletin-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [open]);

  // Global ESC listener
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const filteredNotes = useMemo(() => {
    let result = notes;
    if (activeFilter !== 'all') {
      result = result.filter((n) => n.category === activeFilter);
    }
    // Sort pinned to the very front, then newest first
    return [...result].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.createdAt - a.createdAt;
    });
  }, [notes, activeFilter]);

  const handleCreateNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && !title.trim()) return;

    addBulletinNote({
      title: title.trim() || 'Quick Note',
      content: content.trim(),
      color,
      category,
      authorName: currentUser?.name || 'Dad',
      authorRole: currentUser?.role,
      targetName,
      pinned,
    });

    // Reset form
    setTitle('');
    setContent('');
    setColor('amber');
    setCategory('general');
    setTargetName('Everyone');
    setPinned(false);
    setIsAdding(false);
    setNotes(loadBulletinNotes());
  };

  const handleDelete = (id: string) => {
    deleteBulletinNote(id);
    setNotes(loadBulletinNotes());
  };

  const handleTogglePin = (id: string) => {
    togglePinBulletinNote(id);
    setNotes(loadBulletinNotes());
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-[#111625] border-2 border-amber-500/30 rounded-3xl shadow-2xl shadow-black/80 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Board Frame Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 bg-slate-900/90 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center font-bold text-lg shadow-sm">
              📌
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">Family Bulletin Board</h2>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  {notes.length} Active Notes
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Quick sticky notes, urgent school alerts & household memos for the family.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAdding((prev) => !prev)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-md shadow-amber-500/20 transition active:scale-95"
            >
              {isAdding ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              <span>{isAdding ? 'Cancel' : 'Post Note'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition"
              title="Close (ESC)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Pills Bar */}
        <div className="px-4 py-2.5 bg-slate-950/60 border-b border-white/5 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              activeFilter === 'all'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'bg-white/5 text-slate-400 hover:text-white'
            }`}
          >
            All Notes ({notes.length})
          </button>
          {BULLETIN_CATEGORIES.map((cat) => {
            const count = notes.filter((n) => n.category === cat.id).length;
            const isActive = activeFilter === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveFilter(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'bg-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <span>{cat.iconEmoji}</span>
                <span>{cat.label}</span>
                {count > 0 && <span className="opacity-75 text-[10px]">({count})</span>}
              </button>
            );
          })}
        </div>

        {/* Main Board Content (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-[#0a0e19]">
          {/* Slide-down New Note Composer */}
          {isAdding && (
            <form
              onSubmit={handleCreateNote}
              className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-amber-500/40 shadow-xl space-y-4 animate-in slide-in-from-top-4 duration-200"
            >
              <div className="flex items-center justify-between text-xs font-bold text-amber-400">
                <span className="flex items-center gap-1.5">
                  <Pin className="w-3.5 h-3.5" /> New Family Sticky Note
                </span>
                <span className="text-slate-400 text-[11px]">Instant live sync to all devices</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Note Title / Headline (optional)..."
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-400 outline-none"
                />

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 whitespace-nowrap">For:</span>
                  <select
                    value={targetName}
                    onChange={(e) => setTargetName(e.target.value)}
                    className="flex-1 bg-slate-950/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-400"
                  >
                    <option value="Everyone">Everyone</option>
                    {householdMembers.map((m) => (
                      <option key={m.id} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="What does the family need to know? (e.g. Early dismissal Friday, lunchbox on counter, gear packed...)"
                rows={3}
                required
                className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:border-amber-400 outline-none resize-none"
              />

              {/* Tag and Color pickers */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                {/* Category select */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-slate-400 mr-1">Tag:</span>
                  {BULLETIN_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${
                        category === cat.id
                          ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                          : 'bg-white/5 text-slate-400 hover:text-white'
                      }`}
                    >
                      <span>{cat.iconEmoji}</span>
                      <span>{cat.label}</span>
                    </button>
                  ))}
                </div>

                {/* Color swatches */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400 mr-1">Paper:</span>
                  {BULLETIN_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setColor(c.id)}
                      className={`w-6 h-6 rounded-full border-2 transition active:scale-95 flex items-center justify-center ${
                        color === c.id ? 'border-white scale-110 shadow-sm' : 'border-transparent opacity-75'
                      }`}
                      style={{ backgroundColor: c.pinColor }}
                      title={c.label}
                    >
                      {color === c.id && <Check className="w-3 h-3 text-slate-950 stroke-[3]" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pin to Top toggle & Submit button */}
              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={pinned}
                    onChange={(e) => setPinned(e.target.checked)}
                    className="rounded bg-slate-950 border-white/20 text-amber-500 focus:ring-0"
                  />
                  <span>📌 Pin to top of board</span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 transition active:scale-95"
                  >
                    Stick Note 📌
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Sticky Notes Grid */}
          {filteredNotes.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredNotes.map((note) => {
                const colorConfig =
                  BULLETIN_COLORS.find((c) => c.id === note.color) || BULLETIN_COLORS[0];
                const catConfig =
                  BULLETIN_CATEGORIES.find((c) => c.id === note.category) || BULLETIN_CATEGORIES[4];

                return (
                  <div
                    key={note.id}
                    className={`relative p-4 rounded-2xl border ${colorConfig.borderClass} ${colorConfig.bgClass} shadow-lg backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 flex flex-col justify-between min-h-[160px]`}
                  >
                    {/* Top Pin Graphic */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm"
                          style={{ backgroundColor: colorConfig.pinColor }}
                          title="Pushpin"
                        />
                        <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md border ${colorConfig.badgeClass} flex items-center gap-1`}>
                          <span>{catConfig.iconEmoji}</span>
                          <span>{catConfig.label}</span>
                        </span>
                        {note.pinned && (
                          <span className="text-[10px] text-amber-300 font-bold flex items-center gap-0.5 bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.5 rounded">
                            <Pin className="w-2.5 h-2.5" /> Pinned
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleTogglePin(note.id)}
                          className={`p-1 rounded-lg text-xs transition ${
                            note.pinned
                              ? 'text-amber-400 bg-amber-500/10'
                              : 'text-slate-400 hover:text-white hover:bg-white/10'
                          }`}
                          title={note.pinned ? 'Unpin note' : 'Pin note to top'}
                        >
                          <Pin className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(note.id)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                          title="Remove note"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Note Title & Content */}
                    <div className="space-y-1.5 flex-1">
                      {note.title && (
                        <h4 className="text-sm font-bold text-white tracking-tight">{note.title}</h4>
                      )}
                      <p className={`text-xs ${colorConfig.textClass} leading-relaxed whitespace-pre-wrap font-normal`}>
                        {note.content}
                      </p>
                    </div>

                    {/* Note Footer: Author & Target */}
                    <div className="mt-4 pt-2.5 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-white">{note.authorName}</span>
                        {note.targetName && note.targetName !== 'Everyone' && (
                          <span className="text-amber-300 font-medium"> &rarr; {note.targetName}</span>
                        )}
                      </div>
                      <span className="text-[10px] opacity-75">
                        {new Date(note.createdAt).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-12 text-center rounded-2xl border border-white/5 bg-white/[0.02] space-y-3">
              <div className="text-3xl">📌</div>
              <h3 className="text-sm font-bold text-white">No sticky notes in this category</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Stick a quick memo or announcement to keep everyone on the same page.
              </p>
              <button
                onClick={() => setIsAdding(true)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 transition"
              >
                Post First Note 📌
              </button>
            </div>
          )}
        </div>

        {/* Board Footer Esc hint */}
        <div className="px-4 py-2.5 bg-slate-950/80 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400">
          <span>Tip: Pinned notes stay at the top across all family phones.</span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white underline underline-offset-2"
          >
            Close Board [ESC]
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulletinBoardModal;
