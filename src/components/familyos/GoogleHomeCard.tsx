import React from 'react';
import { Home } from 'lucide-react';

/** How to link Google Assistant / Google Home. Linking itself happens inside
 * the Google Home app, which then sends the user through the consent screen
 * (src/pages/GoogleHomeLink.tsx). Unlinking is also done there. */
export const GoogleHomeCard: React.FC = () => (
  <div className="bg-slate-900 rounded-xl border border-slate-700 p-4 space-y-2">
    <div className="flex items-center gap-2 text-sm font-medium text-white">
      <Home className="w-4 h-4 text-amber-400" /> Google Home &amp; Assistant
    </div>
    <p className="text-xs text-slate-400">Control your smart-home devices by voice through Google Assistant. It uses the devices connected to Home Assistant.</p>
    <ol className="text-xs text-slate-300 list-decimal ml-4 space-y-0.5">
      <li>Open the Google Home app on your phone.</li>
      <li>Tap <b>+</b> &rarr; <b>Set up device</b> &rarr; <b>Works with Google</b>.</li>
      <li>Search for <b>FamilyOS</b> and sign in with your parent account.</li>
    </ol>
    <p className="text-[11px] text-slate-500">To unlink, remove FamilyOS from the Google Home app. Only parent (admin) accounts can link.</p>
  </div>
);
