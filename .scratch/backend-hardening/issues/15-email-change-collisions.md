# 15: An email change to an address someone else takes first

Status: done
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
- [x] two Users pending the same address each confirm with their own token → the first wins, the second gets `EMAIL_TAKEN`;
- [x] confirmed owner → `EMAIL_TAKEN`, the confirming User's `pendingEmail` and token cleared, email unchanged;
- [x] unconfirmed owner → deleted, the change applied;
- [x] duplicate-key race (simulated) → `EMAIL_TAKEN`;
- [x] token of one User with another User's address → `INVALID_TOKEN`;
- [x] `updatePersonalData` allowed over an unconfirmed owner, refused over a confirmed one;
- [x] Google on a pending-only address creates a new User;
- [x] resend picks the owner, else the latest pending User, sends at most one mail, always answers `success`;
- [x] `tsc --noEmit` and `npm test` pass.
- [x] Frontend follow-up exists: `../berlincoffeemap/.scratch/backend-hardening/issues/06-email-taken-toast.md`.

## Comments

2026-09-30 (implement): Done on `feat/email-change-collisions`.

- `confirmEmail` finds the User by the token hash; the `email` argument must be their `pendingEmail` (change) or `email` (registration), else `INVALID_TOKEN`. New catalogue code `EMAIL_TAKEN`, noted on `confirmEmail` in `root.graphql`.
- A change to an address a confirmed User holds is cancelled with `EMAIL_TAKEN` even when the link has expired, since a fresh link could never win. An unconfirmed holder is deleted only after the expiry check, and only while still unconfirmed (`deleteOne({ isEmailConfirmed: false })`); if it confirmed in between, the change is cancelled with `EMAIL_TAKEN`. A duplicate key on `email` at the save is mapped the same way. A cancel writes straight to the stored User, not the in-memory copy.
- `updatePersonalData` refuses only a confirmed owner's address. `resendConfirmationEmail` keeps `recipientAllowed` first and always answers `success`; it mails the unconfirmed owner, nobody for a confirmed owner, otherwise the pending User with the latest `emailConfirmationTokenExpires`.
- Google on a pending-only address was already covered by `tests/googleSignIn.test.ts` (ticket 12). The frontend ticket `06-email-taken-toast.md` already existed.
- Behaviour change, per "No token match → INVALID_TOKEN": opening a registration link a second time now gets `INVALID_TOKEN`, not `EMAIL_ALREADY_CONFIRMED` (the token is cleared on confirmation), so the client opens the resend modal instead of the "already confirmed" toast. `EMAIL_ALREADY_CONFIRMED` stays in the resolver but is now practically unreachable. Worth adding to frontend ticket 06 or a follow-up.
- Accepted gap: if the unconfirmed holder is deleted and the save then fails for a reason other than a duplicate key, the holder is gone and the change is not applied.
- Tests: `tests/emailChangeCollisions.test.ts` (17).
