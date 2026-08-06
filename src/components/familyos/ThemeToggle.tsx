import React from 'react';
import { Sun, Moon, Laptop } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';

// Personal preference, not household config — every member sees their own
// choice on their own device (theme is stored in localStorage per browser/
// app install, not synced via family_data).
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const options: { id: 'light' | 'dark' | 'system'; label: string; icon: typeof Sun }[] = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'system', label: 'Auto', icon: Laptop },
  ];

  return (
    <div className="rounded-xl border border-slate-700 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-900">
        <Sun className="w-4 h-4 text-honey-400" />
        <span className="font-semibold text-white text-sm">Appearance</span>
        <span className="ml-auto text-xs text-slate-500">this device</span>
      </div>
      <div className="px-4 py-3">
        <div className="grid grid-cols-3 gap-2">
          {options.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTheme(id)}
              className={`flex flex-col items-center gap-1.5 text-sm rounded-lg py-2.5 transition ${
                theme === id
                  ? 'bg-honey-600 text-white'
                  : 'bg-slate-950 border border-slate-700 text-slate-300 hover:border-slate-600'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-3">
          "Auto" follows your device's system setting and switches automatically.
        </p>
      </div>
    </div>
  );
}
