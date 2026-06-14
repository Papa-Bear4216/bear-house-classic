import type {Metadata} from 'next';
import { Inter, Outfit } from 'next/font/google';
import './globals.css'; // Global styles
import { AppNavigation } from '@/components/AppNavigation';
import { FirebaseProvider } from '@/components/FirebaseProvider';
import { AuthGate } from '@/components/AuthGate';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from '@vercel/analytics/next';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'Bear House — Family OS',
  description: 'Bear House family dashboard. Calendar, tasks, meals, budget, and more.',
  verification: {
    google: ['rqdEeLLkxZkxAb74XlMFCeE5U3r2NOnSqM7EqlDs9x8', 'Vt_wzlUsTorUdKDbCyDcphS21pxARncO_ZnCKqJs1zM'],
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable} antialiased`}>
      <body suppressHydrationWarning className="bg-[#020817] text-white font-sans overflow-x-hidden">
        <FirebaseProvider>
          <AuthGate>
            <AppNavigation>
              {children}
            </AppNavigation>
          </AuthGate>
        </FirebaseProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
