# Security Spec for FamilyOS

## 1. Data Invariants
- All users, tasks, and events belong to a single, shared family unit.
- Users are either `superadmin`, `admin`, or `child`.
- Admins/SuperAdmins can edit everything. Children can only edit their own tasks/events or non-protected fields.

## 2. Dirty Dozen Payloads (Security Test Cases)
1. `create` user with `role: 'superadmin'` as a new user. (Should Fail)
2. `update` task `status: 'done'` where `assigneeId` is NOT the current user and not admin. (Should Fail)
3. `update` task `pointsValue` to 999999 (Exceeds limit). (Should Fail)
4. `update` user `role` (to upgrade self to admin). (Should Fail)
5. `list` events *without* restricted query filters (if the rule requires restrictive reads).
6. `create` event with `startTime` string too long (exceeds 10 chars). (Should Fail)
7. `create` event with missing `title` field. (Should Fail)
8. `update` task with a "Ghost Field" `isPaid: true`. (Should Fail)
9. `create` event with ID > 128 chars. (Should Fail)
10. `get` PII (if user profile had PII, but here it's public).
11. `create` task with `pointsValue` < 0. (Should Fail)

## 3. Test Runner
Will be implemented in `firestore.rules.test.ts`.
