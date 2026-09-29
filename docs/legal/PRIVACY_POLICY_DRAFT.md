# Privacy Policy — DRAFT for legal review

> **DRAFT. Not legal advice. Not yet approved for publication.** Bracketed items are placeholders.
> `[VERIFY]` = confirm against the product before publishing. `[DECIDE]` = a business choice.
> See `LEGAL_REVIEW_NOTES.md` for what changed from the live policy and why.

**Effective date:** [DATE] · **Service:** FamilyOS ("HotMessExpress") · **Provider:** [ENTITY NAME], [ADDRESS]
("we", "us") · **Contact:** [PRIVACY EMAIL]

## 1. What FamilyOS is
FamilyOS is a household-management service: chores, pantry, schedules, family communication, bills, and tools for
families with one or two households (including separated parents sharing care of a child). This policy explains
what we collect, why, who sees it, and your choices. We do not sell personal information and we do not show
advertising.

## 2. Information we collect
**Account information.** Name, email address, and profile picture from your sign-in (Google or email), your role
(parent/admin, child, pet), and your household.

**Household content you add.** Tasks, routines, shopping and pantry lists, meal plans, appointments, notes,
messages between household members, "quality time" activities, and other items you enter.

**Children's information.** A parent or administrator creates a profile for each child (name, role, and the
information the parent enters). Children may use features such as chores, rewards, and games. See section 8.

**Health-related information.** Only if you enter it: medications and refill dates, emotion logs, and related
notes. This is sensitive; it is visible only to the household members your role settings allow `[VERIFY roles]`.

**Financial information.** Bills and expenses you enter. If you connect a bank through SimpleFIN Bridge, we
receive read-only account and transaction data for that member. We never receive your bank login and we do not
store payment-card numbers (payments are handled by Stripe).

**Location and presence.** If you enable presence features: whether household members are home, based on device
signals or NFC tags you set up, and a home location you provide for weather `[VERIFY exact signals]`.

**Co-parenting information.** Whether co-parenting mode is on, which household each parent belongs to, and each
household's address and phone number, which the other parent can see unless the household marks its address
**confidential** (then it is withheld from the other parent). Bills a parent chooses to share are visible to
adult (admin) members of the family only, never to children `[VERIFY when shipped]`.

**School information.** If a child or parent connects Google Classroom, assignment and course information from
that account. If a parent uploads a photo or screenshot of a grade report, we read the grades from the image.

**Smart-home information.** If you connect Home Assistant or link Google Home, we store the connection details you
provide and process device names and states so you can view and control devices `[VERIFY how HA tokens are stored]`.

**AI conversations.** What you type to the built-in assistant and the household context needed to answer (see
section 5).

**Technical data.** Device and browser type, app version, diagnostics and performance timings, push-notification
tokens, and IP address in server logs.

## 3. How we use information
To run the features you use; to keep the service secure and prevent abuse; to provide support; to bill your
subscription; to send notifications you enable; and to improve reliability. We do not use household content for
advertising and we do not sell it.

## 4. Google user data
If you connect a Google account we access only what you approve. **FamilyOS's use and transfer of information
received from Google APIs will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
including the Limited Use requirements.**

| Feature | Google scope | What we access | Why | Stored |
|---|---|---|---|---|
| Sign-in | `openid`, `email`, `profile` | Name, email, picture, Google ID | Sign you in; show your profile | While your account is active |
| Gmail scanning `[DECIDE whether shipped]` | `gmail.readonly` | Message content, read-only, of messages you enable us to scan | Find order confirmations and tracking/receipt details | Only the extracted details; not the full message |
| Calendar `[read/write when shipped]` | Calendar read (and write, if you enable adding events) | Event titles, times, locations; events you ask us to create | Show family appointments; add events you request | Cached for display; never sold |
| Google Classroom | Classroom read-only scopes `[LIST EXACT SCOPES]` | Courses and assignments for the connected account | Show school work for a child | Assignment details for that child |
| Google Home (smart home) | Account linking; no Google user data is read | We issue a token so Google can send us device commands | Voice control of your devices | Hashed token; you can unlink any time |

We do not use Google user data for advertising, do not sell it, do not use it to train general AI models, and do
not allow humans to read it except with your consent, for security or abuse investigation, or as required by law.
Gmail refresh tokens are encrypted at rest. You can revoke access anytime in Settings or at
https://myaccount.google.com/permissions.

## 5. AI features
The assistant, daily briefings, and image reading send your prompt and the household context needed to answer to
AI providers — Anthropic (Claude) and Google (Gemini) — acting as our service providers. `[VERIFY provider API
terms: no training on customer content by default]`. Parents may enter their own AI keys `[VERIFY]`. AI output can
be wrong; it is not medical, legal, financial, or custody advice.

## 6. Who we share information with
We do not sell personal information. We share it only with:
| Provider | Purpose |
|---|---|
| Supabase | Database, authentication |
| Vercel | Hosting and serverless functions |
| Stripe | Subscription billing and payments |
| Anthropic; Google (Gemini, text-to-speech) | AI features |
| SimpleFIN Bridge | Read-only bank connection, if you connect one |
| Google (Gmail, Calendar, Classroom, Google Home) | Only if you connect those features |
| Firebase Cloud Messaging | Push notifications |
| IFTTT | Only if you enable it `[VERIFY]` |
| U.S. National Weather Service | Weather from an approximate location |

Your Home Assistant, if you use one, is run by you. We also disclose information if required by law, to protect
safety or rights, or in a business transfer, with notice to you.

## 7. Households and co-parenting
Within a household, what a person sees depends on their role: children do not see bills, finances, or other
adult-only areas, and some data is private to the member who created it. Across two households in co-parenting
mode, only what this policy and the app's settings say is shared (for example each household's address and phone,
unless marked confidential, and bills a parent explicitly shares). **FamilyOS records are provided for
convenience; they are not legal advice and are not a substitute for a court order or legal counsel.**

## 8. Children's privacy
FamilyOS is designed to be set up and controlled by parents. We do not knowingly collect personal information
from a child under 13 without verifiable consent from a parent `[DECIDE the consent mechanism, e.g. parent
account creates the profile and consents]`. A parent can review, correct, or delete a child's information, or
refuse further collection, by contacting [PRIVACY EMAIL] `[BUILD in-app controls]`. We do not show advertising
to children and do not condition a child's use on sharing more information than needed.

## 9. Security
Data is encrypted in transit (HTTPS). Direct browser reads of household data are limited by database row-level
security so an account can read only its own household. Our server functions also enforce household and role checks
in code. Integration refresh tokens are encrypted at rest. No system is perfectly secure; tell us at [SECURITY
EMAIL] if you find a problem.

## 10. Retention and deletion
We keep information while your account is active. You can ask us to delete your household or account at [PRIVACY
EMAIL] `[BUILD self-serve deletion]`; we will delete or de-identify it within [30] days `[DECIDE/VERIFY —
promise only what you will actually do]`, except where we must keep records for legal, tax, or security reasons.
Backups roll off on their normal schedule.

## 11. Your choices and rights
You can access, correct, export, and delete your information, disconnect integrations, and turn off features.
Depending on where you live (for example California or Texas) you may have additional rights `[VERIFY]`. We will
not discriminate against you for using them. Contact [PRIVACY EMAIL]; we may need to verify who you are.

## 12. Changes; contact
We will post updates here and change the effective date; we will notify you of material changes in the app.
Questions: [PRIVACY EMAIL], [ENTITY NAME], [ADDRESS].
