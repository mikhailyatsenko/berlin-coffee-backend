# 14: Abuse limits on sign-in and on mail to caller-supplied addresses

Status: ready-for-agent
Blocked by: 05 (Email normalization), 13 (Mail module)
Source: [Abuse limits on sign-in and email-sending endpoints](../../backend-audit/issues/06-abuse-limits-on-auth-and-email.md), refined by [Email module](../../backend-audit/issues/07-email-module-and-escaping.md)

## Problem

Password guessing on `signInWithEmail` is unlimited, and reset / resend / registration / email change can be used to flood any mailbox with our mail. Several answers also reveal whether an account exists.

## Current behaviour

- `utils/rateLimit.ts` has fixed-window in-memory buckets keyed by IP only; sign-in, reset, resend, register and email change use none of them for these purposes.
- `requestPasswordReset` and `resendConfirmationEmail` have no captcha (`registerUser` has reCAPTCHA v3).
- `resendConfirmationEmail` answers "does not exist" / "already confirmed"; sign-in for a Google-only account answers "associated with a Google account".

## Expected behaviour

- **Rate limit module** generalized from IP to an arbitrary key (`ip`, `email:<normalized>`); still in-memory, single process, counters reset on deploy.
- **`signInWithEmail`:** per IP 20 / 15 min and 100 / day (every attempt); per email 10 *failed* attempts / hour, checked before bcrypt, counted only on failure (`checkRateLimit` + `countRateLimit`). No captcha. The Google-only branch answers the generic "Invalid e-mail or password".
- **Recipient bucket in the mail module** (3 / hour, 10 / day per normalized address, shared across all mail types):
  - `sendEmailConfirmation` and `sendPasswordReset` always go through it; a new caller cannot bypass it.
  - `assertRecipientAllowed(email)` is exported; resolvers call it **before** writing state (creating the User, storing a token or `pendingEmail`).
  - Exhausted: `registerUser` and the email change in `updatePersonalData` throw `RATE_LIMITED`; `requestPasswordReset` and `resendConfirmationEmail` answer `success` silently without sending.
  - Admin mails and `sendSuggestionPublished` bypass it.
- **Per-IP bucket per operation** for reset, resend, register, email change: 5 / hour, 20 / day, throwing `RATE_LIMITED` (also on reset).
- **Captcha:** reCAPTCHA v3, fail-closed, on `requestPasswordReset` (action `request_password_reset`) and `resendConfirmationEmail` (action `resend_confirmation_email`), via an optional `captchaToken` argument verified from the start like `registerUser`. Backend and frontend deploy the same day (frontend ticket `04-recaptcha-on-reset-and-resend.md`).
- **Enumeration:** `resendConfirmationEmail` always returns `success`; it sends only when an unconfirmed User or a `pendingEmail` matches (ticket 15 refines which one). `registerUser` / `updatePersonalData` keep "already exists".
- Not limited: `resetPassword`, `validatePasswordResetToken`, `confirmEmail` (32-byte random tokens).

## Acceptance criteria

Tests with the transport fake and captcha verification stubbed:
- [ ] sign-in: the 21st attempt from one IP within 15 min → `RATE_LIMITED`; the 11th failure for one email within an hour → `RATE_LIMITED` without calling bcrypt; successes don't count toward the email bucket;
- [ ] a Google-only account signing in with a password gets "Invalid e-mail or password";
- [ ] the 4th mail to one address within an hour is not sent: reset and resend still answer `success`, register and email change throw `RATE_LIMITED`, and no User/token/`pendingEmail` was written by the refused call;
- [ ] mixed-case variants of one address share a bucket;
- [ ] per-IP: the 6th reset from one IP within an hour → `RATE_LIMITED`;
- [ ] reset and resend without or with a failing captcha → `CAPTCHA_FAILED`;
- [ ] resend for an unknown or already-confirmed address → `success`, no mail;
- [ ] `tsc --noEmit`, codegen drift check and `npm test` pass.
- [ ] Frontend follow-up exists: `../berlincoffeemap/.scratch/backend-hardening/issues/04-recaptcha-on-reset-and-resend.md`; deploy both the same day.
