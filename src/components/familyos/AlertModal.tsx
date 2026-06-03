import React from 'react';
import { X, Sparkles } from 'lucide-react';

interface AlertModalProps {
  open: boolean;
  title: string;
  body: string;
  accent?: string;
  loading?: boolean;
  onClose: () => void;
}

const AlertModal: React.FC<AlertModalProps> = ({ open, title, body, accent = 'indigo', loading, onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in" onClick={onClose}>
      <div
        className={`bg-slate-800 border border-${accent}-500/40 rounded-2xl p-6 max-w-lg w-full shadow-2xl shadow-${accent}-500/20`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-${accent}-500/20`}>
              <Sparkles className={`w-5 h-5 text-${accent}-400`} />
            </div>
            <h3 className="text-xl font-bold text-white">{title}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="text-slate-200 whitespace-pre-wrap leading-relaxed text-sm max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-3 text-slate-400">
              <div className={`w-4 h-4 border-2 border-${accent}-400 border-t-transparent rounded-full animate-spin`} />
              Thinking...
            </div>
          ) : (
            body
          )}
        </div>
        <button
          onClick={onClose}
          className={`mt-5 w-full py-2.5 bg-${accent}-600 hover:bg-${accent}-500 text-white rounded-lg font-medium transition`}
        >
          Got it
        </button>
      </div>
    </div>
  );
};

export default AlertModal;
