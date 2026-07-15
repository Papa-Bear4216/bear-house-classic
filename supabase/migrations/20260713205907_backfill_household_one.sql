-- Backfill: turn the existing hardcoded family into household #1.
-- auth_user_id is left null for every member here — Task 4 (Supabase Auth
-- rollout) links these rows to real auth.users rows once each person signs
-- in for the first time under the new system.
do $$
declare
  v_household_id uuid;
begin
  insert into public.households (name, subscription_status)
  values ('Hebert House', 'active')
  returning id into v_household_id;

  insert into public.household_members (household_id, name, email, role, color) values
    (v_household_id, 'Daddy', 'michael711hebert@gmail.com', 'superadmin', 'indigo'),
    (v_household_id, 'Mommy', 'hpfanatic009@gmail.com', 'admin', 'pink'),
    (v_household_id, 'Abriana', 'littlebear8998@gmail.com', 'child', 'purple'),
    (v_household_id, 'Julia', 'jchebert2010@gmail.com', 'child', 'blue'),
    (v_household_id, 'Lucy', null, 'pet', 'amber');

  update public.family_data set household_id = v_household_id where household_id is null;
end $$;
