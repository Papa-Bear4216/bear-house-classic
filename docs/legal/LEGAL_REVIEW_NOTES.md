# Legal review notes — read this first

**Status: DRAFTS. Not legal advice. Have a lawyer review before publishing anything.**
The drafts in this folder (`PRIVACY_POLICY_DRAFT.md`, `TERMS_OF_SERVICE_DRAFT.md`) are written from what the
code actually does as of 2026-09-29. Anything I could not confirm from the code is tagged `[VERIFY]`, and
business/legal choices are tagged `[DECIDE]`. Placeholders look like `[ENTITY NAME]`.

## 1. Where the CURRENT published policy does not match the code
The live policy is `public/privacy.html` (served at `/privacy`, per `vercel.json`) and
`src/pages/Privacy.tsx` (SPA route). Both need the same edits. A published policy that overstates is a
liability, and Google's reviewers compare the policy to the scopes and behavior.

| # | Live policy says | Reality in code | Fix |
|---|---|---|---|
| 1 | Household data lives in "dedicated PostgreSQL instances" | One shared multi-tenant Supabase project; households are separated by rules, not separate databases | Say "a multi-tenant database with per-household access rules" |
| 2 | "Each query is strictly isolated by your household ID" via row-level security | RLS protects direct browser reads. Server routes (`api/`) use the service key, which bypasses RLS, and enforce household scope in application code (see CLAUDE.md) | Describe both layers honestly |
| 3 | Data "purged within 30 days of deletion request" | There is no deletion endpoint or scheduled purge in `api/` | Either build it (see section 3) or change the promise to "on request" with a manual process you will actually follow |
| 4 | Calendar is read-only and "we do not modify or delete" | Calendar read/write is planned | Update when the write feature ships; request the matching scope |
| 5 | Gmail use is "read-only email metadata" | The scope is `gmail.readonly`, which can read message content | Say "message content, read-only". Google flags a mismatch between the text and the scope |
| 6 | Collects only account, household content, telemetry | Also collects children's profiles, medications and emotion logs, bank connections and transactions, presence/location, co-parenting address and phone, school data, and AI chat content | Add every category (drafted) |
| 7 | No mention of AI providers | Household context is sent to Anthropic (Claude) and Google (Gemini) for chat, briefings and image reading | Disclose and name the providers (drafted) |
| 8 | No list of service providers | Supabase, Vercel, Stripe, Anthropic, Google, SimpleFIN, Firebase Cloud Messaging, IFTTT (if enabled), National Weather Service | Add a sub-processor table (drafted) |

## 2. Decisions only you can make `[DECIDE]`
- Legal entity name, address, contact and privacy email, governing state, and dispute process.
- How you obtain **verifiable parental consent** for children under 13 (COPPA). Parent-created child profiles
  help, but the policy must describe the mechanism you actually use.
- Refund and cancellation policy for subscriptions.
- Whether Gmail read stays in the product (see section 4 — it triggers a paid annual security assessment).
- Retention periods for each data type.

## 3. Things the policy will promise that the product must actually do
Build these before you publish, or soften the promise:
1. **Delete my household / delete my account** (API + UI) covering `family_data`, members, memory, tokens, Stripe link.
2. **Export my data** (users in Texas and California can ask; do it once, not ad hoc).
3. **Revoke integrations** (Gmail disconnect exists; add the same for Classroom and Google Home unlink UI).
4. **Parent controls for a child**: view and delete a child's data.
5. **Audit of who can see what** for co-parenting: shared items visible to admins only, never to children.

## 4. Google review paths (separate processes)
**A. Google Home cloud-to-cloud (smart home).** Test mode works today with no review. For public release:
brand/asset review, privacy policy and terms URLs, a demo account with working devices for Google's testers,
and passing Google's automated test suite. Report State/Request Sync are not built yet.

**B. Google OAuth app verification (Gmail, Calendar, Classroom scopes).**
- Domain ownership of `hotmessexpress.lol` verified in Google Search Console.
- OAuth consent screen with the exact policy and terms URLs; scope justifications; a demo video per sensitive scope.
- `gmail.readonly` is a **restricted** scope. Apps that store or transmit that data on a server need an
  annual third-party security assessment (CASA). This is the expensive, slow item. Alternatives: drop Gmail,
  or use forwarded-email parsing instead of Gmail API access.
- Calendar and Classroom scopes are **sensitive** (verification, no CASA).
- The published policy must contain the Limited Use statement (the live one already does).

## 5. Other exposure to have the lawyer look at
- **Custody and co-parenting content.** The state-statute reference table is automatically compiled and unreviewed
  (confidence marked `unreviewed`). Showing legal citations to paying customers may look like legal advice
  (unauthorized practice of law). The in-app disclaimer helps but is not a substitute for review.
- **Health information** (medications, emotion logs) and **financial data** (bank sync): confirm which rules apply.
- **Children's data:** COPPA (under 13). Also Texas data-privacy law for minors `[VERIFY]`.
- **School records:** grade scans a parent uploads are the parent's own copy of records; confirm the school
  portals' terms before any automated retrieval (none is built).
- **Terms for a paid product:** subscription auto-renewal disclosures, limitation of liability, arbitration.
