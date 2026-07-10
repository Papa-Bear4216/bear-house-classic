import React, { useState, useEffect } from 'react';
import {
  X, Key, Bell, Clock, Users, Trash2, Plus, Download, Eye, EyeOff,
  Plug, Copy, Check, MapPin, CreditCard, Webhook, Tag, Home, BookOpen,
  ShoppingCart, ExternalLink,
} from 'lucide-react';
import { KEYS, DEFAULT_SETTINGS, DEFAULT_PRESENCE_ZONES, loadJSON, saveJSON, uid } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';

interface Props { open: boolean; onClose: () => void; }

const BASE_URL = 'https://bearhouseos.vercel.app';

const NFC_TAG_DEFAULTS: Record<string, string> = {
  kitchen_sink: 'Wipe down kitchen sink and counter',
  trash_can: 'Take out trash',
  laundry: 'Move laundry to dryer / fold & put away',
  medicine: 'Give medicine to dog',
  front_door: 'Check front door is locked',
  dog_bowl: 'Refill dog water bowl',
  vacuum: 'Vacuum the living room',
  dishwasher: 'Empty the dishwasher',
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} className="ml-2 p-1 rounded text-slate-400 hover:text-white transition flex-shrink-0">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function CodeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between bg-slate-950 rounded px-3 py-2 gap-2">
      <span className="text-xs text-slate-400 flex-shrink-0 w-28">{label}</span>
      <span className="text-xs text-emerald-300 font-mono truncate flex-1">{value}</span>
      <CopyButton text={value} />
    </div>
  );
}

function EnvRow({ name, value, placeholder }: { name: string; value?: string; placeholder?: string }) {
  const val = value || `YOUR_${name}_HERE`;
  return (
    <div className="flex items-center gap-2 bg-slate-950 rounded px-3 py-2">
      <span className="text-xs text-amber-300 font-mono flex-shrink-0">{name}</span>
      <span className="text-xs text-slate-500 truncate flex-1">{placeholder || val}</span>
      <CopyButton text={`npx vercel env add ${name}`} />
    </div>
  );
}

type Tab = 'general' | 'integrations' | 'family';

const SettingsModal: React.FC<Props> = ({ open, onClose }) => {
  const { currentRole } = useAppContext();
  const isAdmin = currentRole === 'superadmin' || currentRole === 'admin';

  const [tab, setTab] = useState<Tab>('general');
  const [apiKey, setApiKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [cameraToken, setCameraToken] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showCameraToken, setShowCameraToken] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [zones, setZones] = useState<any[]>(DEFAULT_PRESENCE_ZONES);
  const [newZone, setNewZone] = useState({ name: '', startHour: 18, endHour: 21, days: '1,2,3,4,5' });

  // Integration settings
  const [homeLat, setHomeLat] = useState('');
  const [homeLon, setHomeLon] = useState('');
  const [nfcTags, setNfcTags] = useState<Record<string, string>>(NFC_TAG_DEFAULTS);
  const [newTagKey, setNewTagKey] = useState('');
  const [newTagVal, setNewTagVal] = useState('');
  const [expandedIntegration, setExpandedIntegration] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setApiKey(localStorage.getItem(KEYS.apiKey) || '');
      setGeminiKey(localStorage.getItem(KEYS.geminiApiKey) || '');
      setCameraToken(localStorage.getItem(KEYS.cameraToken) || '');
      setSettings(loadJSON(KEYS.settings, DEFAULT_SETTINGS));
      setZones(loadJSON(KEYS.presenceZones, DEFAULT_PRESENCE_ZONES));
      setHomeLat(localStorage.getItem('home_lat') || '30.45');
      setHomeLon(localStorage.getItem('home_lon') || '-91.15');
      setNfcTags(loadJSON('nfc_tag_map', NFC_TAG_DEFAULTS));
    }
  }, [open]);

  const saveAll = () => {
    if (isAdmin) {
      localStorage.setItem(KEYS.apiKey, apiKey);
      localStorage.setItem(KEYS.geminiApiKey, geminiKey);
      localStorage.setItem(KEYS.cameraToken, cameraToken);
      localStorage.setItem('home_lat', homeLat);
      localStorage.setItem('home_lon', homeLon);
      saveJSON('nfc_tag_map', nfcTags);
    }
    saveJSON(KEYS.settings, settings);
    saveJSON(KEYS.presenceZones, zones);
    onClose();
  };

  const addZone = () => {
    if (!newZone.name) return;
    const days = newZone.days.split(',').map((d) => parseInt(d.trim())).filter((d) => !isNaN(d));
    setZones([...zones, { id: uid(), ...newZone, days }]);
    setNewZone({ name: '', startHour: 18, endHour: 21, days: '1,2,3,4,5' });
  };

  const exportData = () => {
    const data: any = {};
    Object.values(KEYS).forEach((k) => { const v = localStorage.getItem(k); if (v) data[k] = JSON.parse(v); });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `familyos-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  const toggleIntegration = (key: string) =>
    setExpandedIntegration(expandedIntegration === key ? null : key);

  if (!open) return null;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'general', label: 'General' },
    ...(isAdmin ? [{ id: 'integrations' as Tab, label: 'Integrations' }] : []),
    { id: 'family', label: 'Family' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-2xl w-full mx-auto my-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700 sticky top-0 bg-slate-800 rounded-t-2xl z-10">
          <h2 className="text-2xl font-bold text-white">Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700 px-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition -mb-px ${
                tab === t.id
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-6">

          {/* ── GENERAL TAB ── */}
          {tab === 'general' && (
            <div className="space-y-4">

              {/* API Keys — admins only */}
              {isAdmin && (
                <div className="rounded-xl border border-slate-700 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 bg-slate-900">
                    <Key className="w-4 h-4 text-amber-400" />
                    <span className="font-semibold text-white text-sm">API Keys</span>
                    <span className="ml-auto text-xs text-slate-500">stored on this device only</span>
                  </div>
                  <div className="divide-y divide-slate-700/50">
                    <KeyRow label="Claude" placeholder="sk-ant-..." value={apiKey} onChange={setApiKey} show={showKey} onToggleShow={() => setShowKey(!showKey)} accentClass="focus:border-amber-500" />
                    <KeyRow label="Gemini" placeholder="AIza..." value={geminiKey} onChange={setGeminiKey} show={showGeminiKey} onToggleShow={() => setShowGeminiKey(!showGeminiKey)} accentClass="focus:border-emerald-500" note="camera scanner" />
                    <KeyRow label="Camera Access" placeholder="match CAMERA_ACCESS_TOKEN in Vercel" value={cameraToken} onChange={setCameraToken} show={showCameraToken} onToggleShow={() => setShowCameraToken(!showCameraToken)} accentClass="focus:border-orange-500" note="Home Assistant cameras" />
                  </div>
                </div>
              )}

              {/* AI toggle — big and obvious */}
              <label className={`flex items-center justify-between rounded-xl border px-5 py-4 cursor-pointer transition ${settings.aiEnabled ? 'border-indigo-500/50 bg-indigo-950/30' : 'border-slate-700 bg-slate-900'}`}>
                <div>
                  <div className="text-white font-medium">AI Features</div>
                  <div className="text-xs text-slate-400 mt-0.5">{settings.aiEnabled ? 'On — Claude is active' : 'Off — no AI calls'}</div>
                </div>
                <div className={`w-12 h-6 rounded-full relative transition-colors ${settings.aiEnabled ? 'bg-indigo-600' : 'bg-slate-700'}`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${settings.aiEnabled ? 'left-7' : 'left-1'}`} />
                  <input type="checkbox" checked={settings.aiEnabled} onChange={(e) => setSettings({ ...settings, aiEnabled: e.target.checked })} className="sr-only" />
                </div>
              </label>

              {/* Two simple numbers */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3">
                  <label className="text-xs text-slate-400 block mb-2">Overdue after (days)</label>
                  <input type="number" value={settings.overdueThreshold}
                    onChange={(e) => setSettings({ ...settings, overdueThreshold: parseInt(e.target.value) || 3 })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-lg font-bold text-center" />
                </div>
                <div className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3">
                  <label className="text-xs text-slate-400 block mb-2">Reminder before event (min)</label>
                  <input type="number" value={settings.preActivityReminder}
                    onChange={(e) => setSettings({ ...settings, preActivityReminder: parseInt(e.target.value) || 30 })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-lg font-bold text-center" />
                </div>
              </div>

              {/* Presence Zones — collapsible */}
              <details className="rounded-xl border border-slate-700 overflow-hidden group">
                <summary className="flex items-center gap-2 px-4 py-3 bg-slate-900 cursor-pointer list-none select-none">
                  <Clock className="w-4 h-4 text-orange-400" />
                  <span className="font-semibold text-white text-sm">Presence Zones</span>
                  <span className="ml-auto text-xs text-slate-500">{zones.length} configured</span>
                </summary>
                <div className="px-4 py-3 space-y-2">
                  {zones.map((z) => (
                    <div key={z.id} className="flex items-center justify-between bg-slate-900 rounded-lg px-3 py-2">
                      <div>
                        <div className="text-white text-sm">{z.name}</div>
                        <div className="text-xs text-slate-400">{z.startHour}:00–{z.endHour}:00 · Days {z.days.join(', ')}</div>
                      </div>
                      <button onClick={() => setZones(zones.filter((x) => x.id !== z.id))} className="text-rose-400 hover:text-rose-300 p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <div className="pt-1 space-y-2">
                    <input placeholder="Zone name" value={newZone.name}
                      onChange={(e) => setNewZone({ ...newZone, name: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" />
                    <div className="grid grid-cols-3 gap-2">
                      {(['startHour', 'endHour'] as const).map((f) => (
                        <input key={f} type="number" placeholder={f === 'startHour' ? 'Start hr' : 'End hr'}
                          value={newZone[f]}
                          onChange={(e) => setNewZone({ ...newZone, [f]: parseInt(e.target.value) || 0 })}
                          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" />
                      ))}
                      <input placeholder="Days (0-6)" value={newZone.days}
                        onChange={(e) => setNewZone({ ...newZone, days: e.target.value })}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" />
                    </div>
                    <button onClick={addZone} className="w-full bg-orange-600 hover:bg-orange-500 text-white rounded-lg py-2 text-sm flex items-center justify-center gap-2">
                      <Plus className="w-4 h-4" /> Add Zone
                    </button>
                  </div>
                </div>
              </details>

              <button onClick={exportData} className="w-full bg-slate-700 hover:bg-slate-600 text-white rounded-xl py-3 flex items-center justify-center gap-2 text-sm font-medium border border-slate-600">
                <Download className="w-4 h-4" /> Export All Data (JSON)
              </button>

            </div>
          )}

          {/* ── INTEGRATIONS TAB ── */}
          {tab === 'integrations' && isAdmin && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Server-side env vars are set via terminal (<code className="bg-slate-900 px-1 rounded">npx vercel env add NAME</code>) from your project folder.
                Client-side settings are saved here and used in-app.
              </p>

              {/* Weather */}
              <IntegrationCard
                icon={<MapPin className="w-4 h-4 text-sky-400" />}
                title="Weather"
                badge="Live"
                badgeColor="emerald"
                description="NWS forecast — no API key needed. Set your home coordinates."
                expanded={expandedIntegration === 'weather'}
                onToggle={() => toggleIntegration('weather')}
              >
                <p className="text-xs text-slate-400 mb-3">These are saved locally and sent to the weather endpoint as query params.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Latitude</label>
                    <input value={homeLat} onChange={(e) => setHomeLat(e.target.value)}
                      placeholder="30.45"
                      className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white text-sm font-mono" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Longitude</label>
                    <input value={homeLon} onChange={(e) => setHomeLon(e.target.value)}
                      placeholder="-91.15"
                      className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white text-sm font-mono" />
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">Default is Baton Rouge, LA. Find your coords at <a href="https://www.latlong.net" target="_blank" className="text-sky-400 underline">latlong.net</a>.</p>
              </IntegrationCard>

              {/* Plaid */}
              <IntegrationCard
                icon={<CreditCard className="w-4 h-4 text-violet-400" />}
                title="Plaid — Expense Tracking"
                badge="Needs Setup"
                badgeColor="amber"
                description="Sync real bank transactions. Requires free Plaid developer account."
                expanded={expandedIntegration === 'plaid'}
                onToggle={() => toggleIntegration('plaid')}
              >
                <div className="space-y-2">
                  <p className="text-xs text-slate-400">1. Create free account at <a href="https://dashboard.plaid.com/signup" target="_blank" className="text-violet-400 underline inline-flex items-center gap-1">dashboard.plaid.com <ExternalLink className="w-3 h-3" /></a></p>
                  <p className="text-xs text-slate-400">2. Go to Team Settings → Keys → copy Sandbox Client ID and Secret</p>
                  <p className="text-xs text-slate-400">3. Run these in your <code className="bg-slate-950 px-1 rounded">~/bear-house</code> folder:</p>
                  <div className="space-y-1">
                    <EnvRow name="PLAID_CLIENT_ID" placeholder="from Plaid dashboard → Keys" />
                    <EnvRow name="PLAID_SECRET" placeholder="Sandbox secret from Plaid dashboard" />
                    <EnvRow name="PLAID_ENV" placeholder="sandbox  (change to production later)" />
                  </div>
                  <p className="text-xs text-slate-400">4. Redeploy: <code className="bg-slate-950 px-1 rounded font-mono text-emerald-300">npx vercel --prod --yes</code></p>
                </div>
              </IntegrationCard>

              {/* Webhooks — HA, Secretary, NFC */}
              <IntegrationCard
                icon={<Webhook className="w-4 h-4 text-orange-400" />}
                title="Webhook Endpoints"
                badge="Live"
                badgeColor="emerald"
                description="URLs for Home Assistant, Tasker/NFC, and the Hermes secretary agent."
                expanded={expandedIntegration === 'webhooks'}
                onToggle={() => toggleIntegration('webhooks')}
              >
                <p className="text-xs text-slate-400 mb-3">All endpoints require <code className="bg-slate-950 px-1 rounded">x-webhook-token</code> header matching your <code className="bg-slate-950 px-1 rounded">WEBHOOK_TOKEN</code> Vercel env var.</p>
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-1">Endpoint URLs</p>
                  <CodeRow label="General webhook" value={`${BASE_URL}/api/webhook`} />
                  <CodeRow label="Home Assistant" value={`${BASE_URL}/api/ha-webhook`} />
                  <CodeRow label="Hermes secretary" value={`${BASE_URL}/api/secretary`} />
                  <CodeRow label="Calendar sync" value={`${BASE_URL}/api/calendar-sync`} />
                  <CodeRow label="Classroom sync" value={`${BASE_URL}/api/classroom`} />
                  <CodeRow label="Morning briefing" value={`${BASE_URL}/api/briefing`} />
                  <CodeRow label="Evening briefing" value={`${BASE_URL}/api/briefing?type=evening`} />
                  <CodeRow label="Walmart scan" value={`${BASE_URL}/api/walmart`} />
                  <CodeRow label="Weather" value={`${BASE_URL}/api/weather`} />
                </div>
                <div className="mt-3 space-y-1">
                  <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-1">Example cURL (tasks)</p>
                  <div className="bg-slate-950 rounded px-3 py-2 flex items-start gap-2">
                    <pre className="text-xs text-emerald-300 font-mono whitespace-pre-wrap flex-1">{`curl -X POST ${BASE_URL}/api/webhook \\
  -H "x-webhook-token: YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"task","text":"Buy milk","person":"Daddy"}'`}</pre>
                    <CopyButton text={`curl -X POST ${BASE_URL}/api/webhook -H "x-webhook-token: YOUR_TOKEN" -H "Content-Type: application/json" -d '{"type":"task","text":"Buy milk","person":"Daddy"}'`} />
                  </div>
                </div>
              </IntegrationCard>

              {/* NFC / Tasker */}
              <IntegrationCard
                icon={<Tag className="w-4 h-4 text-teal-400" />}
                title="NFC Tags / Tasker"
                badge="Live"
                badgeColor="emerald"
                description="Tap NFC tags to complete chores. Customize what each tag name maps to."
                expanded={expandedIntegration === 'nfc'}
                onToggle={() => toggleIntegration('nfc')}
              >
                <p className="text-xs text-slate-400 mb-3">
                  In Tasker, POST to <code className="bg-slate-950 px-1 rounded font-mono text-teal-300">/api/webhook</code> with <code className="bg-slate-950 px-1 rounded font-mono text-teal-300">{`{"type":"nfc","tagName":"kitchen_sink","person":"Daddy"}`}</code>
                </p>
                <div className="space-y-2 mb-3">
                  {Object.entries(nfcTags).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-2 bg-slate-950 rounded px-3 py-2">
                      <span className="text-xs text-teal-300 font-mono w-32 flex-shrink-0">{key}</span>
                      <input
                        value={val}
                        onChange={(e) => setNfcTags({ ...nfcTags, [key]: e.target.value })}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs"
                      />
                      <button onClick={() => {
                        const t = { ...nfcTags };
                        delete t[key];
                        setNfcTags(t);
                      }} className="text-rose-400 hover:text-rose-300 flex-shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={newTagKey} onChange={(e) => setNewTagKey(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                    placeholder="tag_name" className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-teal-300 font-mono text-xs w-36" />
                  <input value={newTagVal} onChange={(e) => setNewTagVal(e.target.value)}
                    placeholder="Task description"
                    className="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-white text-xs" />
                  <button onClick={() => {
                    if (!newTagKey || !newTagVal) return;
                    setNfcTags({ ...nfcTags, [newTagKey]: newTagVal });
                    setNewTagKey(''); setNewTagVal('');
                  }} className="bg-teal-700 hover:bg-teal-600 text-white rounded px-3 py-1.5 text-xs">
                    Add
                  </button>
                </div>
              </IntegrationCard>

              {/* Home Assistant */}
              <IntegrationCard
                icon={<Home className="w-4 h-4 text-rose-400" />}
                title="Home Assistant"
                badge="Live"
                badgeColor="emerald"
                description="POST automations directly from HA to create tasks and log presence."
                expanded={expandedIntegration === 'ha'}
                onToggle={() => toggleIntegration('ha')}
              >
                <div className="space-y-2">
                  <CodeRow label="Endpoint" value={`${BASE_URL}/api/ha-webhook`} />
                  <p className="text-xs text-slate-400 mt-2">Supported events:</p>
                  <div className="grid grid-cols-2 gap-1">
                    {['person_arrived', 'person_left', 'package_delivered', 'door_left_open', 'low_battery', 'motion_detected', 'wyze_alert', 'custom'].map((e) => (
                      <span key={e} className="text-xs bg-slate-950 text-rose-300 font-mono rounded px-2 py-1">{e}</span>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">In HA, use a REST command with <code className="bg-slate-950 px-1 rounded">x-webhook-token</code> set to your <code className="bg-slate-950 px-1 rounded">WEBHOOK_TOKEN</code> env var.</p>
                </div>
              </IntegrationCard>

              {/* Google Classroom */}
              <IntegrationCard
                icon={<BookOpen className="w-4 h-4 text-blue-400" />}
                title="Google Classroom"
                badge="Auto via OAuth"
                badgeColor="sky"
                description="Syncs assignments as tasks for Abriana & Julia. Works after Google sign-in."
                expanded={expandedIntegration === 'classroom'}
                onToggle={() => toggleIntegration('classroom')}
              >
                <p className="text-xs text-slate-400 mb-2">No separate setup needed — the Classroom API uses the same Google OAuth token as sign-in. Make sure the Google account you sign in with has access to the girls' Classroom.</p>
                <CodeRow label="Sync endpoint" value={`${BASE_URL}/api/classroom`} />
                <p className="text-xs text-slate-500 mt-2">POST with <code className="bg-slate-950 px-1 rounded font-mono">{"{ accessToken, person: \"Abriana\" }"}</code> to pull assignments.</p>
              </IntegrationCard>

              {/* Walmart */}
              <IntegrationCard
                icon={<ShoppingCart className="w-4 h-4 text-yellow-400" />}
                title="Walmart / Shopping Scanner"
                badge="Auto via OAuth"
                badgeColor="sky"
                description="Scans Gmail for Walmart order emails to suggest restocking items."
                expanded={expandedIntegration === 'walmart'}
                onToggle={() => toggleIntegration('walmart')}
              >
                <p className="text-xs text-slate-400 mb-2">Uses your Gmail access token from Google sign-in. No extra setup needed.</p>
                <CodeRow label="Scan endpoint" value={`${BASE_URL}/api/walmart`} />
                <p className="text-xs text-slate-400 mt-2">Voice assistant add-to-list also works:</p>
                <div className="bg-slate-950 rounded px-3 py-2 mt-1">
                  <pre className="text-xs text-emerald-300 font-mono whitespace-pre-wrap">{`{"action":"add","items":["milk","eggs"],"person":"Mommy"}`}</pre>
                </div>
              </IntegrationCard>

            </div>
          )}

          {/* ── FAMILY TAB ── */}
          {tab === 'family' && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-pink-400" />
                <h3 className="font-semibold text-white">Family Members</h3>
              </div>
              <div className="bg-slate-900 rounded-lg p-4 text-sm text-slate-300 space-y-2">
                {[
                  { name: 'Daddy', note: 'superadmin', color: 'text-indigo-400' },
                  { name: 'Mommy', note: 'admin', color: 'text-pink-400' },
                  { name: 'Abriana', note: 'child', color: 'text-purple-400' },
                  { name: 'Julia', note: 'child', color: 'text-blue-400' },
                  { name: 'Lucy', note: 'pet dog', color: 'text-amber-400' },
                ].map((m) => (
                  <div key={m.name} className="flex items-center justify-between">
                    <span className={`font-medium ${m.color}`}>{m.name}</span>
                    <span className="text-slate-500 text-xs">{m.note}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>

        <div className="p-6 border-t border-slate-700 sticky bottom-0 bg-slate-800 rounded-b-2xl">
          <button onClick={saveAll} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-3 font-semibold transition">
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── API Key row ── */
interface KeyRowProps {
  label: string; placeholder: string; value: string; onChange: (v: string) => void;
  show: boolean; onToggleShow: () => void; accentClass: string; note?: string;
}
function KeyRow({ label, placeholder, value, onChange, show, onToggleShow, accentClass, note }: KeyRowProps) {
  return (
    <div className="px-4 py-3">
      <label className="text-xs text-slate-400 block mb-1.5">
        {label}{note && <span className="text-emerald-400 ml-2">— {note}</span>}
      </label>
      <div className="relative">
        <input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 pr-10 text-white text-sm outline-none ${accentClass}`} />
        <button onClick={onToggleShow} className="absolute right-3 top-3 text-slate-400 hover:text-white">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

/* ── Reusable integration card ── */
interface CardProps {
  icon: React.ReactNode;
  title: string;
  badge: string;
  badgeColor: 'emerald' | 'amber' | 'sky' | 'rose';
  description: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const BADGE_COLORS: Record<string, string> = {
  emerald: 'bg-emerald-900/50 text-emerald-300',
  amber: 'bg-amber-900/50 text-amber-300',
  sky: 'bg-sky-900/50 text-sky-300',
  rose: 'bg-rose-900/50 text-rose-300',
};

function IntegrationCard({ icon, title, badge, badgeColor, description, expanded, onToggle, children }: CardProps) {
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-800/50 transition">
        <span className="flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-white">{title}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BADGE_COLORS[badgeColor]}`}>{badge}</span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5 truncate">{description}</p>
        </div>
        <Plug className={`w-4 h-4 flex-shrink-0 transition-transform ${expanded ? 'rotate-90 text-indigo-400' : 'text-slate-500'}`} />
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-700/50 pt-4">
          {children}
        </div>
      )}
    </div>
  );
}

export default SettingsModal;
