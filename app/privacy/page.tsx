'use client';

export default function PrivacyPage() {
  const lastUpdated = 'June 8, 2025';
  const contactEmail = 'michael711hebert@gmail.com';
  const appName = 'DysfunctionJunction';
  const domain = 'dysfunctionjunction.xyz';

  return (
    <main className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-10">
          <h1 className="font-display text-4xl font-black tracking-tighter text-slate-900 uppercase mb-2">
            Privacy Policy
          </h1>
          <p className="text-sm font-bold text-slate-500 bg-[#a7f3d0] inline-block px-3 py-1 border-2 border-slate-900 shadow-[2px_2px_0_#1e293b]">
            {appName} · Last updated {lastUpdated}
          </p>
        </div>

        <div className="space-y-8 text-slate-700 text-base leading-relaxed">
          <section>
            <h2 className="font-black text-xl text-slate-900 mb-2 uppercase tracking-tight">1. Overview</h2>
            <p>
              {appName} ("the App", "we", "us") is a private family productivity application. We are committed to protecting
              your privacy. This policy explains what information the App accesses, how it is used, and how it is protected.
            </p>
            <p className="mt-2">
              The App is intended for use by a single household. It is not a public commercial service and does not sell,
              share, or monetize any user data.
            </p>
          </section>

          <section>
            <h2 className="font-black text-xl text-slate-900 mb-2 uppercase tracking-tight">2. Information We Access</h2>

            <h3 className="font-bold text-slate-900 mb-1 mt-4">Google Account &amp; Calendar Data</h3>
            <p>
              The App uses Google Sign-In for authentication and, with your explicit permission via Google OAuth, accesses
              your Google Calendar events using the read-only scope{' '}
              <code className="bg-slate-100 px-1 rounded text-sm">https://www.googleapis.com/auth/calendar.readonly</code>.
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
              <li>We only <strong>read</strong> calendar events — we never create, modify, or delete your Google Calendar data.</li>
              <li>Calendar data is fetched directly in your browser and cached locally on your device using <code className="bg-slate-100 px-1 rounded">localStorage</code>.</li>
              <li>Calendar data is never transmitted to any server operated by us.</li>
              <li>Access tokens are stored locally and expire after one hour.</li>
            </ul>

            <h3 className="font-bold text-slate-900 mb-1 mt-4">Firestore Data</h3>
            <p>The App stores the following family data in Google Firebase Firestore, scoped to your family code:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
              <li>Family member names, roles, and point totals</li>
              <li>Tasks, chores, and completion status</li>
              <li>Family calendar events, meals, and shopping lists</li>
              <li>Family messages and announcements</li>
            </ul>

            <h3 className="font-bold text-slate-900 mb-1 mt-4">AI Features</h3>
            <p>
              When you use the Hermes AI assistant, your messages may be sent to Google&apos;s Gemini API. Please review{' '}
              <a href="https://policies.google.com/privacy" className="text-blue-600 underline" target="_blank" rel="noopener noreferrer">
                Google&apos;s Privacy Policy
              </a>{' '}
              for details. On-device processing is used when available.
            </p>
          </section>

          <section>
            <h2 className="font-black text-xl text-slate-900 mb-2 uppercase tracking-tight">3. How We Use Your Information</h2>
            <p>Information accessed or stored by the App is used exclusively to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
              <li>Authenticate family members via Google Sign-In</li>
              <li>Display your Google Calendar events in the family calendar view</li>
              <li>Track household tasks, chores, meals, and family member points</li>
              <li>Power the Hermes AI assistant for family scheduling and planning</li>
              <li>Enable family messaging within the household</li>
            </ul>
            <p className="mt-3">
              We do <strong>not</strong> use your data for advertising, analytics, profiling, or any commercial purpose.
            </p>
          </section>

          <section>
            <h2 className="font-black text-xl text-slate-900 mb-2 uppercase tracking-tight">4. Data Sharing</h2>
            <p>We do not sell, rent, or share your personal information with third parties, except:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
              <li><strong>Google Firebase:</strong> Used for authentication and Firestore database storage. Google&apos;s standard privacy policy applies.</li>
              <li><strong>Google Calendar API:</strong> OAuth token used to fetch your calendar events directly in your browser.</li>
              <li><strong>Google Gemini API:</strong> AI assistant queries. No calendar or personal data is sent unless you type it yourself.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-black text-xl text-slate-900 mb-2 uppercase tracking-tight">5. Data Retention &amp; Deletion</h2>
            <p>
              Firestore data is retained until deleted by an admin user. Google Calendar tokens expire automatically after one
              hour and can be revoked at any time by clicking &quot;Disconnect&quot; in the Calendar view or via{' '}
              <a href="https://myaccount.google.com/permissions" className="text-blue-600 underline" target="_blank" rel="noopener noreferrer">
                Google Account Permissions
              </a>.
            </p>
            <p className="mt-2">
              Local cache entries use the prefix <code className="bg-slate-100 px-1 rounded text-sm">bearhouse_</code> on <code className="bg-slate-100 px-1 rounded text-sm">{domain}</code> and can be cleared via browser developer tools.
            </p>
          </section>

          <section>
            <h2 className="font-black text-xl text-slate-900 mb-2 uppercase tracking-tight">6. Children&apos;s Privacy</h2>
            <p>
              This App is designed for family use and may be used by children under the supervision of a parent or guardian.
              All data is controlled by the parent or guardian who administers the App. We do not knowingly collect personal
              information from children independently.
            </p>
          </section>

          <section>
            <h2 className="font-black text-xl text-slate-900 mb-2 uppercase tracking-tight">7. Security</h2>
            <p>
              Data at rest in Firestore is protected by Google Firebase security rules scoped to authenticated family members.
              OAuth tokens are short-lived (1 hour) and stored in browser localStorage. We recommend using the App on trusted
              personal devices only.
            </p>
          </section>

          <section>
            <h2 className="font-black text-xl text-slate-900 mb-2 uppercase tracking-tight">8. Changes to This Policy</h2>
            <p>
              We may update this privacy policy from time to time. The &quot;last updated&quot; date at the top will reflect
              any changes. Continued use of the App constitutes acceptance of the revised policy.
            </p>
          </section>

          <section>
            <h2 className="font-black text-xl text-slate-900 mb-2 uppercase tracking-tight">9. Contact</h2>
            <p>If you have any questions about this privacy policy, please contact:</p>
            <div className="mt-3 p-4 bg-white border-2 border-slate-900 shadow-[4px_4px_0_#1e293b] rounded-2xl inline-block">
              <p className="font-black text-slate-900">{appName}</p>
              <a href={`mailto:${contactEmail}`} className="text-blue-600 font-bold underline">{contactEmail}</a>
            </div>
          </section>

          <section>
            <h2 className="font-black text-xl text-slate-900 mb-2 uppercase tracking-tight">10. Google API Disclosure</h2>
            <div className="bg-[#fef9c3] border-2 border-slate-900 shadow-[4px_4px_0_#1e293b] rounded-2xl p-4">
              <p className="text-sm font-bold">
                {appName}&apos;s use of information received from Google APIs will adhere to the{' '}
                <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-blue-600 underline" target="_blank" rel="noopener noreferrer">
                  Google API Services User Data Policy
                </a>
                , including the Limited Use requirements.
              </p>
            </div>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t-2 border-slate-200 text-center text-xs text-slate-400 font-medium">
          {appName} · Private family household application · {lastUpdated}
        </div>
      </div>
    </main>
  );
}
