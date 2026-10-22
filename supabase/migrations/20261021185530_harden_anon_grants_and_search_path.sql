-- Defense in depth: RLS already denies anon, so revoking anon grants is behavior-neutral.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter function public.update_families_updated_at() set search_path = '';
revoke execute on function public.current_user_household_ids() from public, anon;
