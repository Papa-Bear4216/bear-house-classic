import React, { useState } from 'react';
import { 
  Zap, 
  Bot, 
  Camera, 
  LayoutDashboard, 
  CheckCircle2, 
  Shuffle, 
  Flame, 
  Sparkles, 
  Clock, 
  BatteryCharging, 
  ChevronRight, 
  Smartphone, 
  Monitor, 
  ScanLine, 
  Utensils, 
  CreditCard, 
  Trophy, 
  Send,
  Volume2,
  Check
} from 'lucide-react';
import { triggerConfetti } from '@/lib/confetti';

const CHORE_SAMPLES = [
  { title: 'Unload dishwasher & load breakfast mugs', room: 'Kitchen', time: '5m', points: 35 },
  { title: 'Take recycling bin down to curb', room: 'Garage', time: '3m', points: 25 },
  { title: 'Fold basket of living room throw blankets', room: 'Living Room', time: '4m', points: 30 },
  { title: 'Top up dog water bowl & give Bruno dinner', room: 'Mudroom', time: '2m', points: 20 },
];

export function AppMockupShowcase() {
  const [activeTab, setActiveTab] = useState<'focus' | 'dashboard' | 'hermes' | 'scanner'>('focus');
  const [deviceMode, setDeviceMode] = useState<'mobile' | 'desktop'>('mobile');
  const [choreIndex, setChoreIndex] = useState(0);
  const [completedCount, setCompletedCount] = useState(8);
  const [batteryMode, setBatteryMode] = useState<'high' | 'fried'>('high');
  const [scannerActionDone, setScannerActionDone] = useState(false);
  const [hermesActionDone, setHermesActionDone] = useState(false);

  const currentChore = CHORE_SAMPLES[choreIndex % CHORE_SAMPLES.length];

  const handleCompleteChore = (e: React.MouseEvent) => {
    triggerConfetti(e.clientX, e.clientY, 40);
    setCompletedCount(prev => prev + 1);
    setChoreIndex(prev => prev + 1);
  };

  const handleShuffle = () => {
    setChoreIndex(prev => prev + 1);
  };

  const handleScannerAdd = (e: React.MouseEvent) => {
    triggerConfetti(e.clientX, e.clientY, 45);
    setScannerActionDone(true);
    setTimeout(() => setScannerActionDone(false), 3000);
  };

  const handleHermesAction = (e: React.MouseEvent) => {
    triggerConfetti(e.clientX, e.clientY, 35);
    setHermesActionDone(true);
    setTimeout(() => setHermesActionDone(false), 3000);
  };

  return (
    <section className="relative px-4 py-16 max-w-6xl mx-auto z-10">
      {/* Section Header */}
      <div className="text-center max-w-2xl mx-auto mb-10">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs font-semibold text-amber-300 mb-3">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Real Interactive Renditions
        </div>
        <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight font-display">
          See FamilyOS in Action
        </h2>
        <p className="text-sm sm:text-base text-slate-300 mt-3 leading-relaxed">
          Interactive previews of the real application. Try tapping buttons, shuffling tasks, or triggering dopamine confetti!
        </p>
      </div>

      {/* Control Bar: Feature Tabs + Device Toggle */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8 bg-slate-900/60 backdrop-blur-xl border border-white/10 p-2.5 rounded-2xl shadow-xl">
        {/* Tab Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setActiveTab('focus')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition active:scale-95 ${
              activeTab === 'focus'
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-lg shadow-amber-500/25'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Zap className="w-4 h-4 fill-current" /> ADHD Focus Hero
          </button>
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition active:scale-95 ${
              activeTab === 'dashboard'
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-lg shadow-amber-500/25'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" /> Bento Dashboard
          </button>
          <button
            onClick={() => setActiveTab('hermes')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition active:scale-95 ${
              activeTab === 'hermes'
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-lg shadow-amber-500/25'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Bot className="w-4 h-4" /> Hermes Copilot
          </button>
          <button
            onClick={() => setActiveTab('scanner')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition active:scale-95 ${
              activeTab === 'scanner'
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-lg shadow-amber-500/25'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Camera className="w-4 h-4" /> Room Scanner
          </button>
        </div>

        {/* Device Switcher */}
        <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-white/10 self-end sm:self-auto">
          <button
            onClick={() => setDeviceMode('mobile')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              deviceMode === 'mobile'
                ? 'bg-white/15 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Mobile device view"
          >
            <Smartphone className="w-3.5 h-3.5" /> Mobile
          </button>
          <button
            onClick={() => setDeviceMode('desktop')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              deviceMode === 'desktop'
                ? 'bg-white/15 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Tablet / Desktop view"
          >
            <Monitor className="w-3.5 h-3.5" /> Desktop
          </button>
        </div>
      </div>

      {/* Realistic Device Mockup Frame */}
      <div className="relative mx-auto flex justify-center">
        {deviceMode === 'mobile' ? (
          /* Mobile Phone Mockup */
          <div className="w-[360px] sm:w-[390px] h-[780px] bg-[#090D16] rounded-[48px] p-3 shadow-2xl ring-1 ring-white/20 border-4 border-slate-800 relative overflow-hidden flex flex-col">
            {/* Dynamic Island / Speaker */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-5 bg-black rounded-full z-40 flex items-center justify-between px-3">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-700" />
              <div className="w-2 h-2 rounded-full bg-emerald-500/80 animate-pulse" />
            </div>

            {/* Simulated Phone Screen */}
            <div className="w-full h-full rounded-[38px] bg-[#070a12] border border-white/10 overflow-y-auto overflow-x-hidden flex flex-col relative text-slate-100 selection:bg-amber-500 pt-7 scrollbar-none">
              
              {/* Phone Header */}
              <div className="px-5 py-2.5 flex items-center justify-between border-b border-white/5 bg-slate-950/40 backdrop-blur-md sticky top-0 z-30">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-sm">
                    🐻
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">FamilyOS · HotMessExpress</span>
                    <span className="text-[10px] text-amber-400/80 font-mono">Dysfunction Junction 🚂</span>
                  </div>
                </div>

                {/* Brain Battery Switcher inside mockup */}
                <button
                  onClick={() => setBatteryMode(b => b === 'high' ? 'fried' : 'high')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition ${
                    batteryMode === 'high'
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-rose-500/20 border-rose-500/50 text-rose-300 animate-pulse'
                  }`}
                  title="Click to toggle mental bandwidth mode"
                >
                  <BatteryCharging className="w-3 h-3" />
                  <span>{batteryMode === 'high' ? 'High ⚡ 85%' : 'Fried 🤯 Hot Mess'}</span>
                </button>
              </div>

              {/* Render Selected Tab inside Phone */}
              <div className="flex-1 p-4 pb-20 space-y-4">
                {activeTab === 'focus' && (
                  <FocusMockupContent
                    currentChore={currentChore}
                    completedCount={completedCount}
                    onComplete={handleCompleteChore}
                    onShuffle={handleShuffle}
                  />
                )}
                {activeTab === 'dashboard' && (
                  <DashboardMockupContent 
                    completedCount={completedCount}
                  />
                )}
                {activeTab === 'hermes' && (
                  <HermesMockupContent
                    hermesActionDone={hermesActionDone}
                    onHermesAction={handleHermesAction}
                  />
                )}
                {activeTab === 'scanner' && (
                  <ScannerMockupContent
                    scannerActionDone={scannerActionDone}
                    onScannerAdd={handleScannerAdd}
                  />
                )}
              </div>

              {/* Realistic Floating Island Navigation Dock at Bottom of Phone */}
              <div className="absolute bottom-3 left-4 right-4 z-30">
                <div className="bg-slate-900/90 backdrop-blur-xl border border-white/15 rounded-2xl px-3 py-2 flex items-center justify-around shadow-2xl">
                  <button onClick={() => setActiveTab('dashboard')} className={`p-1.5 rounded-xl transition ${activeTab === 'dashboard' ? 'text-amber-400 bg-amber-500/15' : 'text-slate-400'}`}>
                    <LayoutDashboard className="w-4 h-4" />
                  </button>
                  <button onClick={() => setActiveTab('focus')} className={`p-1.5 rounded-xl transition ${activeTab === 'focus' ? 'text-amber-400 bg-amber-500/15' : 'text-slate-400'}`}>
                    <Zap className="w-4 h-4" />
                  </button>
                  <button onClick={() => setActiveTab('scanner')} className={`p-1.5 rounded-xl transition ${activeTab === 'scanner' ? 'text-amber-400 bg-amber-500/15' : 'text-slate-400'}`}>
                    <Camera className="w-4 h-4" />
                  </button>
                  <button onClick={() => setActiveTab('hermes')} className={`p-1.5 rounded-xl transition ${activeTab === 'hermes' ? 'text-amber-400 bg-amber-500/15' : 'text-slate-400'}`}>
                    <Bot className="w-4 h-4" />
                  </button>
                </div>
              </div>

            </div>
          </div>
        ) : (
          /* Tablet / Desktop Browser Mockup */
          <div className="w-full max-w-4xl h-[620px] bg-[#090D16] rounded-3xl p-3 shadow-2xl ring-1 ring-white/20 border border-slate-800 flex flex-col relative overflow-hidden">
            {/* Window Controls Header */}
            <div className="px-4 py-2.5 flex items-center justify-between border-b border-white/10 bg-slate-950/60 backdrop-blur-md rounded-t-2xl">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                <span className="text-xs font-mono text-slate-400 ml-2 hidden sm:inline">hotmessexpress.lol · a product of dysfunction junction 🚂</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBatteryMode(b => b === 'high' ? 'fried' : 'high')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition ${
                    batteryMode === 'high'
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-rose-500/20 border-rose-500/50 text-rose-300 animate-pulse'
                  }`}
                >
                  <BatteryCharging className="w-3.5 h-3.5" />
                  <span>{batteryMode === 'high' ? 'High ⚡ 85%' : 'Fried 🤯 Hot Mess'}</span>
                </button>
              </div>
            </div>

            {/* Desktop Screen Interior */}
            <div className="flex-1 bg-[#070a12] p-6 overflow-y-auto scrollbar-none rounded-b-2xl">
              {activeTab === 'focus' && (
                <div className="max-w-xl mx-auto">
                  <FocusMockupContent
                    currentChore={currentChore}
                    completedCount={completedCount}
                    onComplete={handleCompleteChore}
                    onShuffle={handleShuffle}
                  />
                </div>
              )}
              {activeTab === 'dashboard' && (
                <div className="max-w-3xl mx-auto">
                  <DashboardMockupContent 
                    completedCount={completedCount}
                  />
                </div>
              )}
              {activeTab === 'hermes' && (
                <div className="max-w-2xl mx-auto">
                  <HermesMockupContent
                    hermesActionDone={hermesActionDone}
                    onHermesAction={handleHermesAction}
                  />
                </div>
              )}
              {activeTab === 'scanner' && (
                <div className="max-w-2xl mx-auto">
                  <ScannerMockupContent
                    scannerActionDone={scannerActionDone}
                    onScannerAdd={handleScannerAdd}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* =========================================================================
   MOCKUP VIEW: ADHD Focus Hero ("ONE THING RIGHT NOW")
   ========================================================================= */
function FocusMockupContent({ 
  currentChore, 
  completedCount, 
  onComplete, 
  onShuffle 
}: { 
  currentChore: typeof CHORE_SAMPLES[0]; 
  completedCount: number; 
  onComplete: (e: React.MouseEvent) => void; 
  onShuffle: () => void; 
}) {
  const chaosPct = Math.min(100, Math.round((completedCount / (completedCount + 4)) * 100));

  return (
    <div className="space-y-4">
      {/* Chaos Meter */}
      <div className="bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-2xl p-3.5 shadow-lg">
        <div className="flex justify-between items-center text-xs mb-2">
          <span className="text-slate-300 font-semibold flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-amber-400" /> Chaos Tamer
          </span>
          <span className="text-emerald-400 font-bold tabular-nums">
            {chaosPct}% Tamed ({completedCount} done)
          </span>
        </div>
        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden p-0.5">
          <div 
            className="h-full bg-gradient-to-r from-amber-500 via-emerald-500 to-teal-400 rounded-full transition-all duration-500"
            style={{ width: `${chaosPct}%` }}
          />
        </div>
      </div>

      {/* ONE THING RIGHT NOW HERO */}
      <div className="bg-gradient-to-b from-amber-500/15 via-slate-900/90 to-slate-900/90 border border-amber-500/40 rounded-3xl p-5 shadow-2xl relative overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold uppercase tracking-wider border border-amber-500/30">
            <Zap className="w-3 h-3 fill-current" /> One Thing Right Now
          </span>
          <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
            +{currentChore.points} pts
          </span>
        </div>

        <h3 className="text-base sm:text-lg font-extrabold text-white leading-snug mb-1.5 font-display">
          {currentChore.title}
        </h3>

        <div className="flex items-center gap-3 text-xs text-slate-400 mb-5">
          <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-slate-400" /> ~{currentChore.time}</span>
          <span>·</span>
          <span>Room: {currentChore.room}</span>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={onComplete}
            className="col-span-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs py-3 rounded-xl transition shadow-lg shadow-emerald-500/25 active:scale-95 flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" /> Done! (+{currentChore.points} pts)
          </button>
          <button
            onClick={onShuffle}
            className="bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 font-semibold text-xs py-2.5 rounded-xl border border-white/10 transition active:scale-95 flex items-center justify-center gap-1.5"
          >
            <Shuffle className="w-3.5 h-3.5" /> Shuffle
          </button>
          <button
            className="bg-slate-800/80 hover:bg-slate-700/80 text-amber-400 font-semibold text-xs py-2.5 rounded-xl border border-white/10 transition active:scale-95 flex items-center justify-center gap-1.5"
          >
            <Clock className="w-3.5 h-3.5" /> 5m Timer
          </button>
        </div>
      </div>

      {/* Muted Queue Items to show single-task reduction */}
      <div className="space-y-2 pt-1">
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Upcoming Queue (Locked)</div>
        <div className="bg-slate-900/40 border border-white/5 rounded-xl px-3.5 py-2.5 flex items-center justify-between opacity-50">
          <span className="text-xs text-slate-400">Transfer wash to dryer</span>
          <span className="text-[10px] text-slate-500">Wait for turn</span>
        </div>
        <div className="bg-slate-900/40 border border-white/5 rounded-xl px-3.5 py-2.5 flex items-center justify-between opacity-30">
          <span className="text-xs text-slate-400">Clear dining table mail</span>
          <span className="text-[10px] text-slate-500">Wait for turn</span>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   MOCKUP VIEW: Bento Grid Dashboard
   ========================================================================= */
function DashboardMockupContent({ completedCount }: { completedCount: number }) {
  return (
    <div className="space-y-3.5">
      {/* User Welcome Row */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-400">Welcome back</div>
          <div className="text-base font-bold text-white flex items-center gap-1.5">
            Maya <span className="text-xs text-amber-400 font-normal">👑 Mama Bear</span>
          </div>
        </div>
        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-sm font-bold text-slate-950 shadow-md">
          M
        </div>
      </div>

      {/* Bento Grid Tiles */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Points & Streak Tile */}
        <div className="bg-slate-900/80 border border-amber-500/20 rounded-2xl p-3.5 shadow-md flex flex-col justify-between">
          <div className="flex items-center justify-between text-amber-400 text-xs font-semibold">
            <Trophy className="w-4 h-4" />
            <span>🔥 9d Streak</span>
          </div>
          <div className="mt-2">
            <div className="text-xl font-black text-white tabular-nums">1,485</div>
            <div className="text-[10px] text-slate-400 font-medium">Family Reward Points</div>
          </div>
        </div>

        {/* Today's Dinner Tile */}
        <div className="bg-slate-900/80 border border-emerald-500/20 rounded-2xl p-3.5 shadow-md flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-400 text-xs font-semibold">
            <Utensils className="w-4 h-4" />
            <span className="text-[10px] bg-emerald-500/10 px-1.5 py-0.5 rounded text-emerald-300">Tonight</span>
          </div>
          <div className="mt-2">
            <div className="text-xs font-bold text-white truncate">Crispy Salmon Rice</div>
            <div className="text-[10px] text-slate-400">25m prep · 4 servings</div>
          </div>
        </div>

        {/* Bill Alert Tile */}
        <div className="bg-slate-900/80 border border-rose-500/20 rounded-2xl p-3.5 shadow-md flex flex-col justify-between">
          <div className="flex items-center justify-between text-rose-400 text-xs font-semibold">
            <CreditCard className="w-4 h-4" />
            <span className="text-[10px] text-rose-300">Due in 2d</span>
          </div>
          <div className="mt-2">
            <div className="text-xs font-bold text-white truncate">Electric Utility</div>
            <div className="text-[10px] text-slate-400 font-bold">$84.20</div>
          </div>
        </div>

        {/* Household Mood Tile */}
        <div className="bg-slate-900/80 border border-indigo-500/20 rounded-2xl p-3.5 shadow-md flex flex-col justify-between">
          <div className="flex items-center justify-between text-indigo-400 text-xs font-semibold">
            <span>🌿 Harmony</span>
            <span className="text-xs">🧘</span>
          </div>
          <div className="mt-2">
            <div className="text-xs font-bold text-white">Calm & Focused</div>
            <div className="text-[10px] text-slate-400">3 check-ins today</div>
          </div>
        </div>
      </div>

      {/* Household Roster Status */}
      <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-3 space-y-2">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Live Household Status</div>
        <div className="flex items-center justify-between text-xs py-1">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-indigo-500/30 flex items-center justify-center text-xs">🧘</div>
            <span className="text-white font-medium">Maya</span>
          </div>
          <span className="text-emerald-400 text-[11px] bg-emerald-500/10 px-2 py-0.5 rounded-full">Focused (Dishwasher)</span>
        </div>
        <div className="flex items-center justify-between text-xs py-1">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-pink-500/30 flex items-center justify-center text-xs">🛠️</div>
            <span className="text-white font-medium">David</span>
          </div>
          <span className="text-amber-400 text-[11px] bg-amber-500/10 px-2 py-0.5 rounded-full">Grocery Store (4 items)</span>
        </div>
        <div className="flex items-center justify-between text-xs py-1">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-500/30 flex items-center justify-center text-xs">🚀</div>
            <span className="text-white font-medium">Leo</span>
          </div>
          <span className="text-sky-400 text-[11px] bg-sky-500/10 px-2 py-0.5 rounded-full">Math Done (+40 pts)</span>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   MOCKUP VIEW: Hermes AI Copilot
   ========================================================================= */
function HermesMockupContent({ 
  hermesActionDone, 
  onHermesAction 
}: { 
  hermesActionDone: boolean; 
  onHermesAction: (e: React.MouseEvent) => void; 
}) {
  return (
    <div className="space-y-3">
      {/* Hermes Status Bar */}
      <div className="flex items-center justify-between bg-slate-900/80 border border-amber-500/30 rounded-2xl px-3.5 py-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white">Hermes Copilot</div>
            <div className="text-[10px] text-slate-400 font-mono">step-3.7-flash (Free) · HA Active</div>
          </div>
        </div>
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
      </div>

      {/* Chat Messages */}
      <div className="space-y-2.5 text-xs">
        {/* User Message */}
        <div className="flex justify-end">
          <div className="bg-amber-500 text-slate-950 font-semibold px-3.5 py-2.5 rounded-2xl rounded-tr-sm max-w-[82%] shadow-md">
            Hey Hermes, dinner is cooked! What's left before our 8:00 family movie night?
          </div>
        </div>

        {/* Hermes Response */}
        <div className="flex justify-start">
          <div className="bg-slate-900/90 border border-white/15 text-slate-200 px-3.5 py-3 rounded-2xl rounded-tl-sm max-w-[90%] shadow-lg space-y-2">
            <p>Nice work, Chef! 🍳 Dinner recorded, and rice & garlic deducted from pantry stock.</p>
            <p className="font-semibold text-amber-300">Remaining before showtime:</p>
            <div className="bg-slate-950/60 p-2 rounded-xl border border-white/5 space-y-1">
              <div>1. Quick counter wipe (assigned to Leo, +25 pts)</div>
              <div>2. Start eco cycle on dishwasher</div>
            </div>
            <p className="text-slate-400">Ready to trigger movie mode on Home Assistant?</p>
          </div>
        </div>
      </div>

      {/* Action Pills */}
      <div className="space-y-1.5 pt-1">
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Suggested Actions</div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onHermesAction}
            className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 border border-amber-500/40 text-amber-300 text-xs px-3 py-1.5 rounded-xl transition active:scale-95"
          >
            {hermesActionDone ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Sparkles className="w-3.5 h-3.5" />}
            {hermesActionDone ? 'Movie Mode Enabled!' : '🎬 Dim Living Room to 25%'}
          </button>
          <button
            className="bg-slate-800/80 border border-white/10 text-slate-300 text-xs px-3 py-1.5 rounded-xl transition hover:bg-slate-700/80"
          >
            🛒 Add Microwave Popcorn
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   MOCKUP VIEW: AI Vision Chore Scanner (Gemini Nano)
   ========================================================================= */
function ScannerMockupContent({ 
  scannerActionDone, 
  onScannerAdd 
}: { 
  scannerActionDone: boolean; 
  onScannerAdd: (e: React.MouseEvent) => void; 
}) {
  return (
    <div className="space-y-3">
      {/* Simulated Camera Viewfinder */}
      <div className="w-full h-56 rounded-2xl bg-gradient-to-b from-slate-900 via-slate-950 to-black border border-white/15 relative overflow-hidden flex flex-col justify-between p-3 shadow-inner">
        {/* AR Scan Line */}
        <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-pulse top-1/2 -translate-y-1/2 opacity-70" />

        {/* Viewfinder Reticles */}
        <div className="flex justify-between items-center z-10">
          <span className="flex items-center gap-1.5 text-[10px] font-mono text-cyan-300 bg-cyan-500/20 border border-cyan-500/30 px-2 py-0.5 rounded-full">
            <ScanLine className="w-3 h-3 animate-spin" /> GEMINI VISION NANO
          </span>
          <span className="text-[10px] text-slate-400 font-mono">LIVING ROOM · 3 DETECTED</span>
        </div>

        {/* AR Bounding Box Overlays */}
        <div className="absolute top-12 left-6 border border-cyan-400/80 bg-cyan-400/10 rounded-lg p-1.5 text-[10px] text-cyan-200 shadow-md">
          ☕ 3 dirty coffee mugs (+15 pts)
        </div>
        <div className="absolute bottom-14 right-6 border border-amber-400/80 bg-amber-400/10 rounded-lg p-1.5 text-[10px] text-amber-200 shadow-md">
          🛋️ Couch pillows scattered (+10 pts)
        </div>

        {/* Viewfinder Bottom Status */}
        <div className="z-10 flex justify-between items-center text-[10px] text-slate-400 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/5">
          <span>Est. tidy time: 4 mins</span>
          <span className="text-emerald-400 font-bold">+25 pts total</span>
        </div>
      </div>

      {/* Detected Results Card */}
      <div className="bg-slate-900/80 border border-cyan-500/30 rounded-2xl p-3.5 space-y-3 shadow-lg">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-cyan-400" /> 2 Quick Wins Identified
          </span>
          <span className="text-[10px] text-slate-400">Auto-prioritized</span>
        </div>

        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between items-center bg-slate-950/60 p-2 rounded-xl border border-white/5">
            <span className="text-slate-300">Move mugs to kitchen sink</span>
            <span className="text-cyan-400 font-bold">+15 pts</span>
          </div>
          <div className="flex justify-between items-center bg-slate-950/60 p-2 rounded-xl border border-white/5">
            <span className="text-slate-300">Straighten couch pillows</span>
            <span className="text-cyan-400 font-bold">+10 pts</span>
          </div>
        </div>

        <button
          onClick={onScannerAdd}
          className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 font-black text-xs py-2.5 rounded-xl transition shadow-lg shadow-cyan-500/25 active:scale-95 flex items-center justify-center gap-1.5"
        >
          {scannerActionDone ? <Check className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
          {scannerActionDone ? 'Added to Household Chores!' : 'Add Both Chores to Queue (+25 pts)'}
        </button>
      </div>
    </div>
  );
}
