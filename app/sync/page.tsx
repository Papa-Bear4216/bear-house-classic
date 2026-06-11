'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { RefreshCw, Copy, Check, Upload, Download, Wifi, AlertCircle, CheckCircle2 } from 'lucide-react';
import { exportSyncPackage, importSyncPackage } from '@/lib/sync';

export default function SyncPage() {
  const [syncCode, setSyncCode] = useState('');
  const [importCode, setImportCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);
  const [tab, setTab] = useState<'export' | 'import'>('export');

  const generate = () => {
    setSyncCode(exportSyncPackage());
    setCopied(false);
  };

  useEffect(() => {
    generate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyCode = async () => {
    await navigator.clipboard.writeText(syncCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const doImport = () => {
    if (!importCode.trim()) return;
    const result = importSyncPackage(importCode);
    setImportResult(result);
    if (result.success) {
      setImportCode('');
      setTimeout(() => window.location.reload(), 1200);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-8">
      <div className="max-w-lg mx-auto space-y-6">
        <header>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-slate-900 flex items-center gap-2">
            <Wifi className="w-8 h-8 text-blue-600" />
            Family Sync
          </h1>
          <p className="text-slate-500 mt-2 text-sm">
            Share your family data with another device on the same network. One device exports, the other imports.
          </p>
        </header>

        {/* Tab switcher */}
        <div className="flex gap-2 bg-slate-200 p-1 rounded-xl">
          <button
            onClick={() => setTab('export')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${tab === 'export' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
          >
            <Upload className="w-4 h-4" /> Export (Share)
          </button>
          <button
            onClick={() => setTab('import')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${tab === 'import' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
          >
            <Download className="w-4 h-4" /> Import (Receive)
          </button>
        </div>

        {tab === 'export' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="font-semibold text-slate-900">Step 1: Copy your sync code</h2>
            <p className="text-sm text-slate-500">Tap &quot;Regenerate&quot; to get a fresh snapshot, then copy and send the code to the other device (via text, email, or paste it directly).</p>

            <textarea
              readOnly
              value={syncCode}
              className="w-full h-28 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl p-3 resize-none focus:outline-none text-slate-700 select-all"
              onClick={e => (e.target as HTMLTextAreaElement).select()}
            />

            <div className="flex gap-3">
              <button
                onClick={copyCode}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy Sync Code'}
              </button>
              <button
                onClick={generate}
                className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors"
                title="Regenerate"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {tab === 'import' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="font-semibold text-slate-900">Step 2: Paste sync code</h2>
            <p className="text-sm text-slate-500">Paste the sync code from the other device below. Your data will be merged — nothing is deleted.</p>

            <textarea
              value={importCode}
              onChange={e => { setImportCode(e.target.value); setImportResult(null); }}
              placeholder="Paste sync code here..."
              className="w-full h-28 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
            />

            {importResult && (
              <div className={`flex items-start gap-2 p-3 rounded-xl text-sm font-medium ${importResult.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                {importResult.success
                  ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                {importResult.message}
              </div>
            )}

            <button
              onClick={doImport}
              disabled={!importCode.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-semibold transition-colors"
            >
              <Download className="w-4 h-4" />
              Sync Now
            </button>
          </div>
        )}

        <div className="bg-slate-100 rounded-xl p-4 text-xs text-slate-500 space-y-1">
          <p className="font-semibold text-slate-700">How it works</p>
          <p>All data lives on your device. To sync with another family member&apos;s device, export your sync code and have them paste it on their device. Changes are merged, not overwritten.</p>
        </div>
      </div>
    </div>
  );
}
