# Bear House Family OS - APK Build & Sync Instructions

## Real-Time Syncing
Syncing has been built directly into the app using **Supabase Realtime**. Changes instantly propagate to all family members using the app!
For this to work, you must enable Realtime for your tables in the Supabase Dashboard:
1. Go to **Database** -> **Replication**
2. Enable replication for the following tables: `tasks`, `events`, `users`.

## Building the APK
To build the Android App (APK) for your Amazon Echo Show 15 and Android devices:

1. Click the **gear icon** in the top right of AI Studio -> **Download ZIP**.
2. Extract the ZIP on your local machine and open a terminal inside the folder.
3. Edit `next.config.ts` and change `output: 'standalone'` to `output: 'export'`.
4. Run the following commands:
   ```bash
   npm install
   npm run build
   npx cap add android
   npx cap sync android
   ```
5. Open the project in Android Studio:
   ```bash
   npx cap open android
   ```
6. Build your APK from Android Studio (Build -> Build Bundle(s) / APK(s) -> Build APK(s)).
