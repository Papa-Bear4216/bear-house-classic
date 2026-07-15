-- current_user_household_ids() is only meant to be used inside RLS
-- policies, not called directly via PostgREST's /rpc/ endpoint. Revoke
-- the default PUBLIC execute grant to reduce its exposed surface.
revoke execute on function public.current_user_household_ids() from public, anon, authenticated;
