# Email change to an address someone else takes before it is confirmed

Type: grilling
Status: resolved
Blocked by: none

## Question

What happens when a User's unconfirmed email change (`pendingEmail`) points at an address that, before the link is clicked, another person takes through `registerUser` or Google sign-in, or that another User also has pending?

Today (`updatePersonalDataResolver.ts:50`, `confirmEmailResolver.ts:16`, `resendConfirmationEmailResolver.ts:17`):

- `pendingEmail` has no index and is not checked by `registerUser`, `loginWithGoogle` or another User's email change, so an address can be pending for several Users and owned by one more.
- `confirmEmail` looks the User up by `email` first, then by `pendingEmail`. Once someone owns the address, the pending User's link finds the owner instead, and fails as `EMAIL_ALREADY_CONFIRMED` or `INVALID_TOKEN`. The frontend (`useEmailConfirmation.ts`) shows "already confirmed" or the resend modal, both misleading. A race between the check and `save()` hits the unique index on `email` and becomes a 500.
- Resend matches `pendingEmail` too, so it can keep mailing a link that can no longer work.

Options: reserve pending addresses (block others from taking them), re-check on confirm and fail with a clear error, or both. Also: how confirm finds the User, what resend and Google do with a stale pending address, the error the client gets, and how this sits with [Google sign-in for an email that already has an account](05-google-login-existing-email.md), [Abuse limits](06-abuse-limits-on-auth-and-email.md) and [Email module](07-email-module-and-escaping.md).

## Answer

Resolved 2026-09-29 (grilling, all recommendations accepted).

**No reservation: the address goes to whoever first proves the mailbox**, by confirming a link or by Google sign-in with `email_verified`. A pending address blocks nobody. Reserving would let anyone put someone else's address into their own email change and lock the mailbox owner out of registering or Google sign-in: the squatter attack from [Google sign-in for an email that already has an account](05-google-login-existing-email.md), mirrored. Mail bombing through repeated email changes is covered by the recipient bucket from [Abuse limits](06-abuse-limits-on-auth-and-email.md) / [Email module](07-email-module-and-escaping.md).

**`confirmEmail` finds the User by the sha256 of the token** (`emailConfirmationToken`), not by email. The `email` argument must then equal that User's `email` (registration) or `pendingEmail` (email change), else `INVALID_TOKEN`. No token match → `INVALID_TOKEN`. No API change; no index needed (15 Users). Two Users pending the same address no longer interfere.

**Confirming an email change to X when X belongs to another User:**
- the owner is **confirmed** → new code `EMAIL_TAKEN` ("This email now belongs to another account") in the code catalogue from the error-contract Foundation. In the same write the User's `pendingEmail` and token are cleared; their current email stays.
- the owner is **not confirmed** → the confirming User wins: the unconfirmed account is deleted and the email change goes through. An unconfirmed account never had a Session (`signInWithEmail` refuses it, `registerUser` sets no cookies), so it owns nothing. Same reasoning as the unconfirmed branch of 05.
- a race (X taken between the check and the save) → the duplicate-key error on `email` is mapped to the same `EMAIL_TAKEN`, never a 500.

**`updatePersonalData`**: the "already exists" pre-check refuses only when X belongs to a *confirmed* User (the message stays, per 06).

**Google sign-in** for an address that is only someone's `pendingEmail`: 05 step 4, a new User; nothing is linked to the pending User. Their change then fails with `EMAIL_TAKEN` on confirm.

**`resendConfirmationEmail`** (always `success`, silent, per 06/07):
- a User owns X as `email` → only that User counts: unconfirmed gets the mail, confirmed gets nothing; other Users' pending changes to X are ignored;
- no owner → the User with X in `pendingEmail` whose change was requested last (latest `emailConfirmationTokenExpires`); the others get nothing, so one mailbox never gets N mails.
- Every send goes through the recipient bucket from 07.

**Frontend handoff:** a sixth ready-for-agent ticket, blocked by this backend ticket: in `useEmailConfirmation.ts`, `EMAIL_TAKEN` shows a toast "This email now belongs to another account" instead of the resend modal (the change is already cancelled; `checkAuth` refreshes the profile).

**Glossary:** one sentence added to **User** in `CONTEXT.md` (an unconfirmed email does not hold the address). No ADR: easy to reverse.

**Slicing for the final ticketing:** one backend ticket "Email change collisions", after the error-contract Foundation (`EMAIL_TAKEN`), the email normalization fix and the Google sign-in ticket (05), and alongside/after the abuse-limits ticket (resend rules). Test cases: confirm by token with two Users pending the same address; confirmed owner → `EMAIL_TAKEN` and pending cleared; unconfirmed owner deleted and change applied; duplicate-key race → `EMAIL_TAKEN`; `updatePersonalData` allowed over an unconfirmed owner, refused over a confirmed one; Google on a pending-only address creates a new User; resend picks the owner, else the latest pending User, and never reveals anything.
