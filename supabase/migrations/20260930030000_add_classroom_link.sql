-- Per-member Google Classroom link (a child's school account), mirroring the
-- Gmail server-side OAuth columns. Refresh token is encrypted by the API.
alter table public.household_members
  add column if not exists classroom_refresh_token_encrypted text,
  add column if not exists classroom_connected_email text,
  add column if not exists classroom_connected_at timestamptz;
