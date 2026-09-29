# 13: One mail module with escaped templates

Status: ready-for-agent
Blocked by: 01 (Error contract foundation), 03 (Config module), 04 (Typed resolvers)
Source: [Email module, escaping, and the contact-form confirmation mail](../../backend-audit/issues/07-email-module-and-escaping.md)

## Problem

Eight resolvers each build and send their own MailerSend mail. User input is interpolated into HTML by hand (escaping is easy to forget), the admin's personal address is in the code, a failed send is handled differently everywhere, and the contact form mails a "thank you" to any address a visitor types in, so anyone can make us send mail to a stranger.

## Current behaviour

- MailerSend is used directly in `updatePersonalData`, `registerUser`, `resendConfirmationEmail`, `requestPasswordReset`, `contactForm`, `reportInaccuracy`, `sendAdminSuggestionEmail`, `sendSuggestionPublishedEmail`; resolvers check `process.env.MAILERSEND_API_KEY` themselves.
- `contactForm` sends the admin message plus a confirmation mail to the submitter; it throws a bare `Error("Failed to send email")`.
- Sender constants live in `contactFormResolver/constants`; the admin address is hard-coded.
- Tests spy on the `mailersend` prototype (`tests/placeSuggestions*.test.ts`).
- `contactForm` / `reportInaccuracy` have captcha but no rate limit.

## Expected behaviour

- **`src/mail/`**, one function per mail: `sendEmailConfirmation(to, url)` (registration, resend, email change), `sendPasswordReset(to, url)`, `sendContactMessage({ name, email, message })`, `sendInaccuracyReport(...)`, `sendSuggestionToAdmin(...)`, `sendSuggestionPublished(...)`. The module owns templates, sender (`FROM_EMAIL`/`FROM_NAME` constants inside it) and the admin address. Resolvers only decide who gets which mail.
- **Transport seam:** the MailerSend client, built from config, behind a small interface that tests replace with a recording fake; the prototype spies in existing tests move to the fake.
- **Escaping:** HTML bodies use a tagged `html\`…\`` template that escapes every interpolation (URLs included); no hand-called `validator.escape`. Text parts are plain; subjects are fixed strings, never user input.
- **Failure by role:** the module offers a throwing send and a best-effort (log-only) send.
  - Throwing where the mail *is* the operation: `contactForm`, `reportInaccuracy` (the error contract masks it to `INTERNAL_SERVER_ERROR`).
  - Best-effort where the mail follows saved state: registration, email change, password reset, resend, both suggestion mails.
- The contact-form "thank you" mail is dropped; `contactForm` still returns `name`.
- The admin copy of a contact message has `Reply-To` = the submitter's address.
- `ADMIN_EMAIL` is a required config variable (config module from ticket 03); tests set their own.
- `contactForm` and `reportInaccuracy` get per-IP limits, 5/hour and 20/day per operation, throwing `RATE_LIMITED` (existing `utils/rateLimit.ts` buckets).
- The per-recipient bucket is **not** here: ticket 14 adds it inside this module.

## Acceptance criteria

- [ ] No resolver imports MailerSend or reads the MailerSend key; all 8 senders go through `src/mail/`.
- [ ] Test: a `<script>`/`"` in a name or message arrives escaped in the HTML body and unescaped in the text part.
- [ ] Test: `contactForm` sends exactly one mail (to the admin, `Reply-To` = submitter); a transport failure fails the operation with `INTERNAL_SERVER_ERROR`.
- [ ] Test: a transport failure on registration still creates the User and returns success (logged).
- [ ] Test: the 6th `contactForm` from one IP within an hour → `RATE_LIMITED`; same for `reportInaccuracy`.
- [ ] Existing Place suggestion tests use the transport fake and pass.
- [ ] `ADMIN_EMAIL` is required by config; the personal address is gone from the code.
- [ ] `tsc --noEmit` and `npm test` pass.
