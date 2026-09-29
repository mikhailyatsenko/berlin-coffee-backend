# 05: Emails are normalized on every write and lookup

Status: ready-for-agent
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

- [ ] Every resolver that reads or writes an email address goes through `normalizeEmail`.
- [ ] Test: register as `" Anna@X.de "`, then sign in as `anna@x.de` → success; the stored email is `anna@x.de`.
- [ ] Test: registering `anna@x.de` when `ANNA@x.de` exists → "already exists".
- [ ] Test: resend, confirm and email change match regardless of case.
- [ ] `tsc --noEmit` and `npm test` pass.
