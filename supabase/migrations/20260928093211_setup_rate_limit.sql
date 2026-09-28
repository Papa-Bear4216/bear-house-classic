-- Pre-household setup endpoints cannot use family_data-based throttling.
-- Keep one atomic counter per verified Supabase user, accessible only to the
-- server's service_role. No client role can inspect or mutate these rows.
create table public.setup_rate_limits (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0)
);

alter table public.setup_rate_limits enable row level security;
revoke all on table public.setup_rate_limits from public, anon, authenticated;
grant all on table public.setup_rate_limits to service_role;

create or replace function public.consume_setup_rate_limit(
  p_user_id uuid,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  allowed boolean;
begin
  if p_user_id is null or p_limit < 1 or p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception 'Invalid setup rate limit parameters';
  end if;

  insert into public.setup_rate_limits (auth_user_id, window_started_at, request_count)
  values (p_user_id, now(), 1)
  on conflict (auth_user_id) do update
  set window_started_at = case
        when public.setup_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= now()
          then now()
        else public.setup_rate_limits.window_started_at
      end,
      request_count = case
        when public.setup_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= now()
          then 1
        else public.setup_rate_limits.request_count + 1
      end
  returning request_count <= p_limit into allowed;

  return allowed;
end;
$$;

revoke execute on function public.consume_setup_rate_limit(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_setup_rate_limit(uuid, integer, integer) to service_role;
