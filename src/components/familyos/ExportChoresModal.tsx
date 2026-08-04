import React, { useMemo, useState } from 'react';
import { X, Download, Printer, CheckSquare, Square } from 'lucide-react';

interface Task {
  id: string;
  text: string;
  person: string;
  category: string;
  room?: string;
  completed: boolean;
  estimatedMinutes?: number;
  dueEstimate?: string;
}

interface Props {
  tasks: Task[];
  defaultTab: string;
  onClose: () => void;
}

const formatMinutes = (mins?: number): string => {
  if (!mins) return '';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

const csvEscape = (val: string): string => {
  if (/[",\n]/.test(val)) return `"${val.replace(/"/g, '""')}"`;
  return val;
};

const ExportChoresModal: React.FC<Props> = ({ tasks, defaultTab, onClose }) => {
  const [scope, setScope] = useState<'tab' | 'open' | 'all'>('tab');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const scoped = useMemo(() => {
    if (scope === 'all') return tasks;
    if (scope === 'open') return tasks.filter((t) => !t.completed);
    if (defaultTab === 'All') return tasks.filter((t) => !t.completed);
    if (defaultTab === 'Recurring') return tasks.filter((t) => !t.completed);
    if (defaultTab === 'Today') return tasks.filter((t) => !t.completed);
    return tasks.filter((t) => !t.completed && t.person === defaultTab);
  }, [tasks, scope, defaultTab]);

  useMemo(() => {
    setSelected(new Set(scoped.map((t) => t.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => (prev.size === scoped.length ? new Set() : new Set(scoped.map((t) => t.id))));
  };

  const rows = scoped.filter((t) => selected.has(t.id));

  const exportCSV = () => {
    const header = ['Done', 'Room', 'Task', 'Time Estimated', 'Who'];
    const lines = [header.join(',')];
    for (const t of rows) {
      lines.push(
        [
          t.completed ? 'Yes' : 'No',
          csvEscape(t.room || ''),
          csvEscape(t.text),
          csvEscape(formatMinutes(t.estimatedMinutes) || t.dueEstimate || ''),
          csvEscape(t.person),
        ].join(',')
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chore-list-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printPDF = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    const html = `<!doctype html>
<html><head><title>Chore List</title>
<style>
  body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .meta { font-size: 12px; color: #555; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 8px 10px; text-align: left; font-size: 13px; }
  th { background: #eee; }
  .check { width: 28px; text-align: center; }
  .box { display: inline-block; width: 16px; height: 16px; border: 1.5px solid #333; }
  @media print { body { padding: 0; } }
</style>
</head><body>
  <h1>Chore List</h1>
  <div class="meta">${new Date().toLocaleDateString()} · ${rows.length} task${rows.length === 1 ? '' : 's'}</div>
  <table>
    <thead><tr><th class="check">Done</th><th>Room</th><th>Task</th><th>Time Est.</th><th>Who</th></tr></thead>
    <tbody>
      ${rows
        .map(
          (t) => `<tr>
        <td class="check">${t.completed ? '&#9745;' : '<span class="box"></span>'}</td>
        <td>${t.room || ''}</td>
        <td>${t.text.replace(/</g, '&lt;')}</td>
        <td>${formatMinutes(t.estimatedMinutes) || t.dueEstimate || ''}</td>
        <td>${t.person}</td>
      </tr>`
        )
        .join('')}
    </tbody>
  </table>
</body></html>`;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h3 className="text-white font-semibold">Export Chore List</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2 flex-wrap">
          {(['tab', 'open', 'all'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`text-xs px-2.5 py-1.5 rounded-md border transition ${
                scope === s ? 'bg-orange-600 border-orange-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              {s === 'tab' ? `Current tab (${defaultTab})` : s === 'open' ? 'All open tasks' : 'All tasks incl. done'}
            </button>
          ))}
          <button onClick={toggleAll} className="ml-auto text-xs px-2.5 py-1.5 rounded-md border border-slate-700 bg-slate-800 text-slate-300 flex items-center gap-1.5">
            {selected.size === scoped.length ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
            {selected.size === scoped.length ? 'Deselect all' : 'Select all'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2">
          {scoped.length === 0 ? (
            <div className="text-center text-slate-500 text-sm py-8">No tasks in this scope.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs uppercase tracking-wide">
                  <th className="text-left py-2 w-8"></th>
                  <th className="text-left py-2 w-10">Done</th>
                  <th className="text-left py-2">Room</th>
                  <th className="text-left py-2">Task</th>
                  <th className="text-left py-2">Time Est.</th>
                  <th className="text-left py-2">Who</th>
                </tr>
              </thead>
              <tbody>
                {scoped.map((t) => (
                  <tr key={t.id} className="border-t border-slate-800">
                    <td className="py-2">
                      <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} className="w-4 h-4 accent-orange-600" />
                    </td>
                    <td className="py-2 text-slate-400">{t.completed ? '✓' : ''}</td>
                    <td className="py-2 text-teal-300">{t.room || '—'}</td>
                    <td className="py-2 text-white">{t.text}</td>
                    <td className="py-2 text-slate-300">{formatMinutes(t.estimatedMinutes) || t.dueEstimate || '—'}</td>
                    <td className="py-2 text-slate-300">{t.person}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-700 flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">{rows.length} of {scoped.length} selected</span>
          <div className="flex gap-2">
            <button
              onClick={exportCSV}
              disabled={rows.length === 0}
              className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white text-sm px-3 py-2 rounded-lg"
            >
              <Download className="w-4 h-4" /> CSV
            </button>
            <button
              onClick={printPDF}
              disabled={rows.length === 0}
              className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white text-sm px-3 py-2 rounded-lg"
            >
              <Printer className="w-4 h-4" /> Print / PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportChoresModal;
