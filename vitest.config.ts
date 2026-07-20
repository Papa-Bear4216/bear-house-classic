import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['api/**/*.test.ts', 'src/**/*.test.ts'],
    env: {
      // src/lib/sync.ts creates a Supabase client at module load time using
      // import.meta.env — these dummy values let it load under Vitest
      // without a real Supabase connection. Fine for unit tests that never
      // actually call the Supabase client.
      VITE_SUPABASE_URL: 'https://test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
});
