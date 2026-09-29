# 15: An email change to an address someone else takes first

Status: ready-for-agent
Blocked by: 05 (Email normalization), 12 (Google sign-in), 14 (Abuse limits)
Source: [Email change to an address someone else takes before it is confirmed](../../backend-audit/issues/11-pending-email-collisions.md); glossary: **User** in `CONTEXT.md`

## Problem

A User's email change stays pending until they click the link. If meanwhile someone else registers or signs in with Google using that address, confirming the change collides on the unique `email` index (a 500), and two Users pending the same address interfere with each other because `confirmEmail` finds the User by address.

## Current behaviour

- `confirmEmail` looks the User up by email and then checks the token.
- `updatePersonalData` refuses an address that belongs to any User, confirmed or not.
- `resendConfirmationEmail` doesn't define which User gets the mail when several match.

## Expected behaviour

- No reservation: the address goes to whoever first proves the mailbox (confirm link or Google with `email_verified`).
- **`confirmEmail`** finds the User by the sha256 of the token (`emailConfirmationToken`). The `email` argument must equal that User's `email` (registration) or `pendingEmail` (email change), else `INVALID_TOKEN`. No token match → `INVALID_TOKEN`. No API change.
- **Confirming a change to X when X belongs to another User:**
  - owner **confirmed** → new catalogue code `EMAIL_TAKEN` "This email now belongs to another account"; in the same write the User's `pendingEmail` and token are cleared, their current email stays;
  - owner **not confirmed** → that account is deleted and the change goes through;
  - race (X taken between check and save) → the duplicate-key error on `email` is mapped to `EMAIL_TAKEN`, never a 500.
- **`updatePersonalData`** refuses X only when it belongs to a *confirmed* User (message unchanged).
- **Google sign-in** for an address that is only someone's `pendingEmail` creates a new User (ticket 12, step 4).
- **`resendConfirmationEmail`** (always `success`, silent): a User owning X as `email` → only that one counts (unconfirmed gets the mail, confirmed gets nothing); no owner → the User with X in `pendingEmail` with the latest `emailConfirmationTokenExpires`; others get nothing. Every send goes through the recipient bucket.

## Acceptance criteria

Tests on `tests/support/mongod.ts`:
- [ ] two Users pending the same address each confirm with their own token → the first wins, the second gets `EMAIL_TAKEN`;
- [ ] confirmed owner → `EMAIL_TAKEN`, the confirming User's `pendingEmail` and token cleared, email unchanged;
- [ ] unconfirmed owner → deleted, the change applied;
- [ ] duplicate-key race (simulated) → `EMAIL_TAKEN`;
- [ ] token of one User with another User's address → `INVALID_TOKEN`;
- [ ] `updatePersonalData` allowed over an unconfirmed owner, refused over a confirmed one;
- [ ] Google on a pending-only address creates a new User;
- [ ] resend picks the owner, else the latest pending User, sends at most one mail, always answers `success`;
- [ ] `tsc --noEmit` and `npm test` pass.
- [ ] Frontend follow-up exists: `../berlincoffeemap/.scratch/backend-hardening/issues/06-email-taken-toast.md`.
