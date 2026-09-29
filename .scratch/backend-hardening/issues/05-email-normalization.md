# 05: Emails are normalized on every write and lookup

Status: done
Blocked by: 04 (Typed resolvers)
Source: `map.md` Notes, "Email case"

## Problem

The same address in different case is treated as different accounts in some paths and the same account in others. A User who registered as `Anna@x.de` can't sign in as `anna@x.de`, while password reset finds them either way. Rate limits keyed by email (ticket 14) and the email collision rules (ticket 15) need one canonical form.

## Current behaviour

- `registerUser` and `signInWithEmail` keep the case as typed (`registerUserResolver.ts:39`); `requestPasswordReset` lowercases (`requestPasswordResetResolver.ts:14`).
- Resend, confirm, `updatePersonalData` (email change → `pendingEmail`) and Google sign-in each do their own thing.
- Production data (2026-09-27): all stored emails already lowercase, no case-duplicates, so **no migration**.

## Expected behaviour

- One `normalizeEmail` (trim + lowercase) used on every write and every lookup: register, sign-in, resend, confirm, reset request, email change (`pendingEmail`), Google sign-in.
- Optionally a Mongoose setter on `User.email` / `pendingEmail` as a safety net, but lookups still normalize their input explicitly.

## Acceptance criteria

- [x] Every resolver that reads or writes an email address goes through `normalizeEmail`.
- [x] Test: register as `" Anna@X.de "`, then sign in as `anna@x.de` → success; the stored email is `anna@x.de`.
- [x] Test: registering `anna@x.de` when `ANNA@x.de` exists → "already exists".
- [x] Test: resend, confirm and email change match regardless of case.
- [x] `tsc --noEmit` and `npm test` pass.

## Comments

**2026-09-29, implemented** (branch `feat/email-normalization`).

- `src/utils/normalizeEmail.ts`: `normalizeEmail` (trim + lowercase). Nine resolvers go through it: register, signInWithEmail, resendConfirmationEmail, confirmEmail, requestPasswordReset, updatePersonalData (`pendingEmail`), loginWithGoogle (the email written for a new User), and also resetPassword and validatePasswordResetToken, which had their own inline trim + lowercase. The address is normalized before `isEmail`, so `" Anna@X.de "` is valid. The confirmation link, the reset link and the recipient all use the normalized form.
- `User.email` / `pendingEmail` get a Mongoose `set` built on `normalizeEmail` (null passes through), as the safety net. There is one definition of the canonical form, not a second one via `lowercase` / `trim`. Mongoose also runs this setter on query filters, so some lookups are normalized twice. The resolvers still normalize explicitly, as the ticket asks: with the resolver changes reverted, 6 of the new tests fail despite the setter.
- `loginWithGoogle` still finds Users only by `googleId`. Matching a Google email to an existing User is ticket 12.
- `updatePersonalData`: an address made only of spaces is still rejected by `isEmail` ("Invalid email address") and isn't skipped silently. An empty string is still "no change", as before. Changing to your own address in a different case is also "no change": nothing is sent and `pendingEmail` stays null.
- The contact form and the Guest's email on a Place suggestion aren't a User's address, so they're out of scope and unchanged.
- Tests: `tests/emailNormalization.test.ts` uses a fake MailerSend, reCAPTCHA and Google OAuth client. It covers every test in the acceptance criteria, plus the reset request, Google sign-in, the model setter, a blank address and an email change that collides with another User's address in a different case. For "already exists", the existing User registered as `ANNA@x.de`. No stored address can be non-canonical, since production data is already lowercase. `tsc --noEmit` is clean and `npm test` passes 137/137.
- Code review (standards and spec) found nothing blocking. Applied: one setter instead of `lowercase` / `trim`, `rawEmail` instead of `typedEmail`, the blank-address fix, and `withCode` built on `clientCode`. Not applied: a branded `CanonicalEmail` type is too much for nine call sites.
- Nothing to hand off to the frontend: the schema is unchanged.
