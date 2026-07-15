-- family_data's primary key widens from (key) to (key, household_id) so
-- two households can't collide on the same key. Reconstructed from the
-- remote migration history (applied via MCP during Task 5, no local file
-- was written at the time) to keep the repo in sync with the live DB.
alter table public.family_data drop constraint if exists family_data_pkey;
alter table public.family_data add primary key (key, household_id);
