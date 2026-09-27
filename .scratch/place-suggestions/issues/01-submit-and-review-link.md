# 01: Submit a Place suggestion and get the admin a review link

**Status:** done

**What to build:** a User or Guest submits a Place suggestion (name and address required; description, Instagram and, for Guests, an email optional). The admin receives an email with a signed link to the frontend review page, and that link lets the frontend load the suggestion. Nothing is published yet.

**Blocked by:** None (can start immediately).

**Source:** frontend spec `../berlincoffeemap/.scratch/place-suggestions/spec.md` (sections "Backend", "Testing Decisions"), frontend ticket `../berlincoffeemap/.scratch/place-suggestions/issues/02-suggest-form.md` (it waits for this one). Admin authorization: frontend `docs/adr/0002-admin-acts-through-signed-links.md`. Guests: ADR 0001. Domain terms: `CONTEXT.md` (Place suggestion, Guest identity).

## Rules

- **Model `PlaceSuggestion`:**
  - name, address, description, Instagram, optional Guest email, status (`pending` | `published` | `rejected`), photo count (0 for now), published Place id, created and decided timestamps;
  - the suggester is exactly one of `userId` / `guestId`, absent rather than null, as on Interaction.
- **`submitPlaceSuggestion(input, guestId?, guestSecret?)`:**
  - resolves the actor the way Reviews do (User from the session, else a valid Guest identity, else the existing error);
  - validates lengths: name and address required, description ≤ 500, email only accepted from Guests and must look like an email;
  - saves as `pending` and returns the suggestion id;
  - does not copy a User's email.
- **Rate limit:** new bucket, 3 suggestions per day per IP, for Users and Guests alike.
- **Review token:**
  - HMAC-SHA256 of the suggestion id with a new env secret;
  - compared in constant time;
  - no expiry.
- **Admin email:**
  - through MailerSend, with the same sender and admin address as the Inaccuracy report;
  - carries the name, address, whether a User or Guest suggested it, and the link `<FRONTEND_DOMAIN>/suggestions/<id>/review?token=<token>`;
  - a failed send is logged but doesn't fail the submission, since the suggestion is already saved.
- **`placeSuggestionForReview(id, token)`:**
  - returns name, address, description, Instagram, suggester kind (`user` / `guest`), status, published Place id, photo paths (empty until ticket 03), and other `pending` suggestions with a similar name (id, name, address; case-insensitive substring either way is enough);
  - never returns the email;
  - a bad token or unknown id fails the same way.
- Schema change, then `npm run generate`.

## Tests

`tests/placeSuggestions.test.ts` against a throwaway mongod with a fake MailerSend (prior art: `tests/uploadReviewImage.test.ts`).

- [x] Submit as User and as Guest stores the suggestion with the right owner field; an invalid Guest identity is rejected
- [x] Required fields and lengths are enforced; a User's email is not stored
- [x] The 4th submission in a day from one IP gets `RATE_LIMITED`
- [x] The admin email is sent and its link's token opens `placeSuggestionForReview`
- [x] A wrong token or unknown id is rejected; the email is never in the response
- [x] Similar pending suggestions are listed, the suggestion itself and decided ones are not
- [x] `npm test`, `tsc` and `npm run generate` (no drift) green; the new env var documented where the others are

## Comments

- 2026-09-26: Implemented on `feat/place-suggestion-submit`, not merged yet.
- Schema: `submitPlaceSuggestion(input, guestId, guestSecret): ID!` returns the suggestion id; `placeSuggestionForReview(id, token): PlaceSuggestionForReview!`. Status and suggester are lowercase enums (`pending | published | rejected`, `user | guest`), like the existing `Characteristic` enum. `photos` is always `[]` until ticket 03.
- Guest identity comes from the `x-guest-id` / `x-guest-secret` headers (context) or, as for Reviews, from the `guestId` / `guestSecret` arguments.
- Lengths the spec left open, chosen here and written into the schema descriptions so the frontend can mirror them: name 200, address 300, instagram 200, email 254 (description 500 as specified). Validation errors are `BAD_USER_INPUT` with a message only: `formatError` in `index.ts` forwards just message and code, so a per-field code would be dropped anyway.
- A User's `email` sent with a suggestion is ignored (not rejected), so a form that started as a Guest and finished signed in still submits. Validation runs before the rate limit is charged: a form the person has to fix costs no quota.
- The review link is `env.frontendUrl` + `/suggestions/<id>/review?token=<hex HMAC-SHA256>` (`localhost:5173` in dev, `3welle.com` in prod), like the other emailed links, not a literal `FRONTEND_DOMAIN`.
- New env var `PLACE_SUGGESTION_REVIEW_SECRET`, required at boot (README, `tests/support/mongod.ts`). **Set it in the production `.env` before deploying**, and never rotate it casually: it invalidates every link already emailed. A value was appended to the local `.env`.
- Similar pending suggestions are compared in code (case-insensitive substring either way), capped at 10.
- Admin email HTML-escapes name and address. A failed send is logged and the submission still returns its id.
- Reusable for tickets 02-04: `requireSuggestionForReview(id, token)` in `src/utils/placeSuggestionToken.ts` is the one entry point for every admin operation.
- Tests: `tests/placeSuggestions.test.ts` (15 tests). `npm test` (62 pass), `tsc` and `npm run generate` (no drift) are green.
- Code review (Standards + Spec): fixed the CONTEXT.md glossary (Place suggestion entry, intro list), used `env.mailerSendApiKey`, dropped a redundant `status: "pending"`, documented the length caps in the schema. Left as is: the MailerSend send block still repeats the shape of the other resolvers (no shared mail helper exists yet).
- Frontend ticket 02 can run codegen against this schema.
