import React, { useState } from 'react';
import { Landmark, ExternalLink, ClipboardPaste, Check } from 'lucide-react';
import { parseSetupToken, SIMPLEFIN_CREATE_URL } from '@/lib/simplefinToken';

interface Props {
  connecting: boolean;
  /** Resolves once the server has accepted (or rejected) the token. */
  onConnect: (setupToken: string) => Promise<boolean>;
}

/** "Connect your bank" — a guided 3-step flow. SimpleFIN keeps the bank list
 * and the bank login on its own site, so steps 1–2 happen there and step 3
 * hands the resulting token back to the app. */
const ConnectBankGuide: React.FC<Props> = ({ connecting, onConnect }) => {
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setToken(text);
      setError('');
    } catch {
      setError('Couldn’t read the clipboard — paste the token into the box instead.');
    }
  };

  const submit = async () => {
    const parsed = parseSetupToken(token);
    if (!parsed) {
      setError('That doesn’t look like a SimpleFIN setup token. Copy the whole code from the SimpleFIN page and try again.');
      return;
    }
    setError('');
    const ok = await onConnect(parsed);
    if (ok) { setToken(''); setOpen(false); setOpened(false); }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center justify-center gap-2 w-full bg-honey-500 hover:bg-honey-400 text-white text-sm font-semibold px-4 py-3 rounded-xl focus-ring">
        <Landmark className="w-4 h-4" /> Connect your bank
      </button>
    );
  }

  const step = 'flex gap-3 items-start';
  const num = 'flex-shrink-0 w-6 h-6 rounded-full bg-honey-500/20 text-honey-400 text-xs font-bold flex items-center justify-center';

  return (
    <div className="space-y-3 bg-bark-800/50 border border-cream-400/10 rounded-xl p-3">
      <div className={step}>
        <span className={num}>1</span>
        <div className="space-y-1.5">
          <div className="text-white text-sm">Pick your bank</div>
          <p className="text-cream-400/60 text-xs">SimpleFIN is our secure, read-only bank connector. Choose your bank from their list and sign in to it there.</p>
          <a href={SIMPLEFIN_CREATE_URL} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(true)}
            className="inline-flex items-center gap-1.5 bg-bark-700 hover:bg-bark-600 border border-cream-400/10 text-white text-xs px-3 py-1.5 rounded-lg">
            Open SimpleFIN <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
      <div className={step}>
        <span className={num}>2</span>
        <div>
          <div className="text-white text-sm">Copy your setup token</div>
          <p className="text-cream-400/60 text-xs">When SimpleFIN shows a long code, copy all of it.</p>
        </div>
      </div>
      <div className={step}>
        <span className={num}>{opened ? <Check className="w-3 h-3" /> : '3'}</span>
        <div className="flex-1 space-y-1.5">
          <div className="text-white text-sm">Paste it here</div>
          <div className="flex gap-2">
            <input value={token} onChange={(e) => { setToken(e.target.value); setError(''); }} placeholder="Setup token"
              className="flex-1 min-w-0 bg-bark-800 border border-cream-400/10 rounded px-2 py-1.5 text-white text-xs outline-none" />
            <button onClick={pasteFromClipboard} title="Paste from clipboard"
              className="flex items-center gap-1 bg-bark-700 hover:bg-bark-600 border border-cream-400/10 text-white text-xs px-2.5 rounded-lg">
              <ClipboardPaste className="w-3.5 h-3.5" /> Paste
            </button>
          </div>
          {error && <div className="text-xs text-rose-300 bg-rose-950/40 rounded px-2 py-1.5">{error}</div>}
          <div className="flex gap-2 pt-1">
            <button onClick={submit} disabled={connecting || !token.trim()}
              className="bg-honey-500 hover:bg-honey-400 disabled:opacity-60 text-white text-xs px-3 py-2 rounded-lg focus-ring">
              {connecting ? 'Connecting…' : 'Connect'}
            </button>
            <button onClick={() => { setOpen(false); setError(''); }} className="text-cream-400/60 hover:text-white text-xs px-3 py-2">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConnectBankGuide;
