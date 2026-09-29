# Email module, escaping, and the contact-form confirmation mail

Type: grilling
Status: resolved
Blocked by: none

## Question

How is outgoing email structured and made safe?

- `contactForm` and `reportInaccuracy` interpolate user input into HTML unescaped (`contactFormResolver.ts:45`, `reportInaccuracyResolver.ts:36`). The contact form also sends a "thank you" mail to any address the caller types, carrying the caller's `name`: a spam/phishing relay from `support@3welle.com`, gated only by reCAPTCHA. Keep that confirmation mail (escaped, plain name only), or drop it?
- MailerSend is constructed in 8 files. One mail module (send + templates + escaping) that tests can swap out: its interface, and whether a failed send throws or logs. Today this differs per resolver: registration logs, resend throws, contact throws a bare `Error`.
- Admin address hard-coded in `contactFormResolver/constants` (`ADMIN_EMAIL`): move to config (ties to the config ticket)?

## Answer

Resolved 2026-09-27 (grilling, all recommendations accepted).

**Contact-form "thank you" mail: dropped.** The frontend never promises it (`SuccessResultSendForm`: "Your message has been sent! We will review it shortly."), so no frontend change. `contactForm` keeps returning `name` (the success screen shows it). With it gone, no unauthenticated operation mails an arbitrary address without an account.

**One mail module, `src/mail/`:**
- One function per kind of mail, not a generic `sendMail` in resolvers: `sendEmailConfirmation(to, url)` (registration, resend and email change share it), `sendPasswordReset(to, url)`, `sendContactMessage({ name, email, message })`, `sendInaccuracyReport(...)`, `sendSuggestionToAdmin(...)`, `sendSuggestionPublished(...)`. Resolvers decide who gets which mail; the module owns templates, sender and admin address.
- One **transport** seam (the MailerSend client built from config) that tests swap for a recording fake, replacing today's spies on the `mailersend` prototype in `tests/placeSuggestions*.test.ts`.
- `FROM_EMAIL` / `FROM_NAME` stay constants inside the module; `contactFormResolver/constants` goes away.
- The per-recipient limit from [Abuse limits](06-abuse-limits-on-auth-and-email.md) lives here (see below).

**Escaping:** HTML bodies are built with a tagged `html\`…\`` template that escapes every interpolation by default; no hand-called `validator.escape`. Text parts are plain and unescaped. Subjects are fixed strings, never user input. URLs go through the same template (escaped `&` in `href` is correct).

**A failed send, by the mail's role:**
- The mail *is* the operation (`contactForm`, `reportInaccuracy`): the error propagates and the error contract masks it to `INTERNAL_SERVER_ERROR`, logged once in `formatError`. The bare `Error("Failed to send email")` goes.
- The mail is a side effect of saved state (registration, email change, password reset, both suggestion mails) **and resend**: logged, the operation succeeds. Resend belongs here because it always answers `success` (06); a send failure would reveal that the account exists.
- The module offers both forms: a throwing send and a best-effort (log-only) call.

**Config:** `ADMIN_EMAIL` becomes a required variable of the config module (ticket 03); the personal address leaves the code, tests set their own. The MailerSend key is read from config inside the transport; every `if (!process.env.MAILERSEND_API_KEY)` in resolvers goes.

**Contact message to the admin** carries `Reply-To` = the submitter's address.

**Limits on `contactForm` / `reportInaccuracy`:** per-IP only, 5 / hour and 20 / day per operation (same shape as 06), throwing `RATE_LIMITED`. No recipient bucket: the recipient is always the admin. The frontend already shows a generic "try again" screen on any error, so no handoff.

**Recipient limit inside the module** (refines 06):
- The mails to a caller-supplied address (`sendEmailConfirmation`, `sendPasswordReset`) always go through the per-recipient bucket (3 / hour, 10 / day); a new resolver cannot bypass it.
- The module also exposes `assertRecipientAllowed(email)`. Resolvers call it **before** writing state (creating the User, storing a token or `pendingEmail`), so an exhausted bucket never leaves an account whose mail was not sent.
- Exhausted bucket: registration and email change throw `RATE_LIMITED`; password reset **and resend** answer `success` silently without sending (06 had specified silence for reset only; resend is silent too, so the limit does not reveal accounts).
- Admin mails and `sendSuggestionPublished` (a User's confirmed address) bypass the recipient bucket.

**Slicing for the final ticketing:** one backend ticket "Mail module" (module + transport fake + escaping + dropping the thank-you mail + `ADMIN_EMAIL` in config + Reply-To + per-IP limits on contact/report + migrating all 8 senders), after the error-contract Foundation and the config module. The recipient bucket itself can land with the abuse-limits ticket if that goes first, or in the Mail module ticket; the final ticketing picks the order. No frontend handoff, no CONTEXT.md terms, no ADR (easy to reverse).
