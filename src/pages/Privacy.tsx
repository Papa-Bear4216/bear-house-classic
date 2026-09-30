import { useEffect } from 'react';

// The published privacy page is public/privacy.html (what Google, Play and search
// engines read). This route just forwards to it so there is only one copy to
// keep accurate.
export default function Privacy() {
  useEffect(() => {
    window.location.replace('/privacy.html');
  }, []);

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-300 flex items-center justify-center p-6 text-sm">
      Opening the privacy page&hellip; <a className="ml-1 text-amber-400 underline" href="/privacy.html">Tap here if it doesn&rsquo;t open.</a>
    </div>
  );
}
