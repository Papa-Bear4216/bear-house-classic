# Archive — reference only, not current

Documents here are historical design/planning artifacts, kept for reference.
They describe intent at the time they were written and may not reflect the
current implementation. Do not treat as up to date without checking the
actual code.

- `2026-07-22-native-push-notifications-design.md` / `-plan.md` — original
  design spec for native Android push notifications (FCM), written before
  implementation. The feature has since been built and merged to `master`
  (see `api/_notify.ts`, `api/register-push-token.ts`, `src/lib/push.ts`,
  `supabase/migrations/20260805000001_add_device_tokens.sql`). Kept here as
  the historical rationale for design decisions, not as a build guide.
