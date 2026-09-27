-- 20260927000000_add_device_control_permission.sql
--
-- Per-member override for device control (locks, lights, HA services).
-- child/pet roles are denied by default; an admin/superadmin can flip this
-- true for a specific member to grant them the same device-control access
-- as an admin. admin/superadmin always have access regardless of this flag
-- (enforced in application code — see api/_db.ts's canControlDevices()).
alter table public.household_members
  add column can_control_devices boolean not null default false;
