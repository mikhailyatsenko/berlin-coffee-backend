# 12: Google sign-in links to an existing account by verified email

Status: done
Blocked by: 03 (Config module), 04 (Typed resolvers), 05 (Email normalization)
Source: [Google sign-in for an email that already has an account](../../backend-audit/issues/05-google-login-existing-email.md)

## Problem

Google sign-in only finds a User by `googleId`. A person who registered with email and password and then clicks "Sign in with Google" hits the unique index on `email` (or gets a second account), and an unverified Google email is trusted as confirmed. An unconfirmed account registered with someone else's address would keep a password that starts working once Google proves the mailbox.

## Current behaviour

`loginWithGoogle` looks up by `googleId`, otherwise creates a User with `isEmailConfirmed: true` regardless of `email_verified`. `isFirstLogin` means "not found by `googleId`".

## Expected behaviour

`loginWithGoogle` resolves the User in this order (email normalized):
1. `email_verified !== true` → `BAD_USER_INPUT` "Please verify your email in your Google account first." No User created or linked.
2. User found by `googleId` → sign in, `isFirstLogin: false`.
3. User found by email:
   - with a different `googleId` → `BAD_USER_INPUT` "This email is linked to another Google account." No re-linking.
   - email **confirmed** → set `googleId`; keep `password` and `displayName`; take the Google avatar only if the User has none. Password sign-in keeps working. `isFirstLogin: false`.
   - email **not confirmed** → set `googleId`, clear `password`, the confirmation and reset tokens, set `isEmailConfirmed: true`, take `displayName` and avatar from Google. `isFirstLogin: true`.
4. No User → create one as today. `isFirstLogin: true`.

A User with only a `pendingEmail` equal to the Google address is not matched (step 4 applies; ticket 15 handles the collision on confirm). No notification email. No frontend change (the client already shows the message and handles `isFirstLogin`).

## Acceptance criteria

Tests on `tests/support/mongod.ts` with the Google token verification stubbed:
- [x] unverified Google email → `BAD_USER_INPUT`, no User written;
- [x] found by `googleId` → signed in, `isFirstLogin: false`;
- [x] email owned by a User with a different `googleId` → `BAD_USER_INPUT`, nothing changed;
- [x] confirmed email → linked, and `signInWithEmail` with the old password still works;
- [x] unconfirmed email → linked, the old password no longer signs in, `isFirstLogin: true`;
- [x] no User → created, `isFirstLogin: true`;
- [x] mixed-case Google email matches the stored lowercase User;
- [x] `tsc --noEmit` and `npm test` pass.

## Comments

2026-09-29 (implement): Done on `feat/google-sign-in-existing-email`.

- `loginWithGoogle` checks `email_verified` first (a payload with no email gets the same refusal), then looks up by `googleId`, then by normalized email. Both refusals are `BAD_USER_INPUT` with the messages from the ticket; no new error code.
- Linking a confirmed email sets only `googleId` and fills the avatar if empty. Taking over an unconfirmed one sets the Google profile and clears `password` plus the confirmation and reset tokens; `sessionVersion` is left alone, since an unconfirmed User cannot hold a Session.
- Tests: `tests/googleSignIn.test.ts` (10), including an unverified email not touching an existing User, the User's own avatar kept, and a User holding the address only as `pendingEmail` not matched. `tests/emailNormalization.test.ts`'s fake Google payload now carries `email_verified: true`.
