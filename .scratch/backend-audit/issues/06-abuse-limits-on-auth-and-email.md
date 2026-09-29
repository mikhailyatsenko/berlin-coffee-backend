# Abuse limits on sign-in and email-sending endpoints

Type: grilling
Status: resolved
Blocked by: none

## Question

Which unauthenticated endpoints get rate limits or captcha, keyed on what, and what do they reveal?

- `signInWithEmail` has no limit, so passwords can be brute-forced.
- `requestPasswordReset` and `resendConfirmationEmail` send mail to any address with no limit and no captcha (mail bombing at our MailerSend cost). `resendConfirmationEmail` answers "User with this email does not exist", so it enumerates accounts, while `requestPasswordReset` deliberately does not. `registerUser` also says "User already exists".
- Limits are keyed by IP today (`utils/rateLimit.ts`), in memory. Is IP enough here, or per email too? Which limits, and should captcha be added to reset and resend (frontend change)?

## Answer

Resolved 2026-09-27 (grilling). Fixed-window, in-memory limits stay (`utils/rateLimit.ts`, single process; counters reset on deploy, accepted). The module is generalized from "IP" to an arbitrary key (`ip`, `email:<normalized address>`). Emails are normalized (trim + lowercase) before keying, per the already-decided email-case fix.

**Not limited:** `resetPassword`, `validatePasswordResetToken` and `confirmEmail`. Their tokens are 32 random bytes stored as sha256, so they cannot be brute-forced.

**`signInWithEmail`:**
- per IP: 20 / 15 min and 100 / day, every attempt counted;
- per email: 10 *failed* attempts / hour. It is checked before bcrypt, and only failures count (`checkRateLimit` + `countRateLimit`).
- No captcha. A per-email lockout of a victim for an hour is accepted, and Google sign-in still works for them.
- The Google-only branch ("associated with a Google account", answered without a password) becomes the generic "Invalid e-mail or password".

**Mail to a caller-supplied address:** reset, resend confirmation, registration confirmation, and the email-change confirmation from `updatePersonalData`.
- One shared bucket per recipient address: 3 / hour and 10 / day.
- Plus a per-IP bucket per operation: 5 / hour and 20 / day.
- `requestPasswordReset` stays silent: an exhausted recipient bucket answers `success` without sending, so the limit does not reveal that an account exists. The per-IP limit may throw `RATE_LIMITED`.
- The contact-form mail is not included (ticket 07).

**Captcha:** reCAPTCHA v3, fail-closed, on `requestPasswordReset` (action `request_password_reset`) and `resendConfirmationEmail` (action `resend_confirmation_email`). An optional `captchaToken` argument, verified from the start like `registerUser`. Backend and frontend deploy the same day; the few-minute gap is accepted, and there is no two-phase rollout.

**Account enumeration:**
- `resendConfirmationEmail` always returns `success`. It sends only when an unconfirmed User or a `pendingEmail` matches the address; "does not exist" and "already confirmed" go away.
- `registerUser` / `updatePersonalData` keep "already exists": a UX trade-off, now gated by captcha plus limits.

**Slicing:** one backend ticket (limits + captcha + enumeration, with tests per bucket), after the error-contract Foundation (`RATE_LIMITED` goes into the code catalogue) and the email-normalization fix.

**Frontend handoff:** one small ready-for-agent ticket:
- `executeRecaptcha` in the RequestPasswordReset and ResendConfirmEmail forms;
- the resend success toast becomes neutral ("If an account needs confirming, we've sent an email");
- `RATE_LIMITED` is shown on the sign-in, reset and resend forms.

_Refined by [Email module, escaping, and the contact-form confirmation mail](07-email-module-and-escaping.md): the recipient bucket lives in the mail module, is checked before state is written, and resend is silent on an exhausted bucket too._
