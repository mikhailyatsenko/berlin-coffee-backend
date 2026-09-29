# Backend audit: from findings to implement-ready tickets

Label: wayfinder:map

## Destination

Every finding from the 2026-09-27 backend audit (listed under Notes) is either turned into a `ready-for-agent` ticket in `.scratch/backend-hardening/issues/`, shaped for `/mattpocock-skills:implement` (Problem / Current / Expected / Acceptance criteria, its own test included), or consciously ruled out of scope below. This map fixes nothing itself; it only settles the decisions the tickets need.

## Notes

- Domain: `CONTEXT.md` (glossary; Review/Favorite/Visit are all one `Interaction`). Every session working a grilling ticket calls the Skill tool for `grilling` and `domain-modeling`.
- Frontend: `../berlincoffeemap`. Where a decision changes an operation the client uses, the frontend part is handed off to its tracker (`CLAUDE.md`, section Frontend). API changes only where a fix needs them; cleanup for its own sake is out of scope.
- Order of the final tickets: data/security bugs → operations (deploy, index) → refactors; architecture foundations (error contract, resolver typing, config) land before the bug fixes that build on them. Every fix ships with its own test (auth has none today; `tests/support/mongod.ts` is the harness).
- Facts from production, read-only, 2026-09-27: 446 Places, 2381 interactions (2230 Google reviews), 15 Users, 7 Guest identities. All emails already lowercase, no case-duplicates, no out-of-range Ratings, so no data migration is needed. `interactions` has no `placeId` index: a `placeId` lookup is a COLLSCAN over all 2381 docs, run twice per Place on every map load.

### Findings already decided while charting (no decision ticket; go straight into the final ticketing)

- **Email case.** Normalize (trim + lowercase) on every write and lookup: register, sign-in, resend, confirm, update, Google. Today register/sign-in keep case while reset lowercases (`registerUserResolver.ts:39`, `requestPasswordResetResolver.ts:14`).
- **Rating range on update.** `addRating` updates via `findOneAndUpdate` without validators, and the schema is `Float!`: validate an integer 1–5 in the resolver (`addRatingResolver.ts:43`).
- **`/imagekit/auth` removed.** The endpoint is unused by the frontend and hands out unscoped upload signatures to any User (`src/index.ts:148`).
- **`Cache-Control: public` removed** from `/coffee`: it covers personalized and mutation responses (`src/index.ts:85`).
- **Place stats (A2).** One shared module for Average rating / counts used by `places`, `filteredPlaces`, `place`, `favoritePlaces`, `addRating`, `deleteReview`, plus an index `{placeId: 1}` on `interactions` (added through a migration script, since `autoIndex` is off in production). No denormalization.
- **Avatar.** `uploadAvatar` passes the full URL to `deleteAvatar`, which expects a path, so the old file is never found (`uploadAvatarResolver.ts:34`). The avatar URL never changes, so CDN caches it: version the file name or purge.
- **ImageKit throttling** duplicated four times in `utils/imagekit.ts`: use `awaitRateLimit` everywhere.
- **Dead code:** `utils/verifyToken.ts`, `createJWT`, `getUserFromToken`, `types/express.d.ts`, `env.cookieSettings`; the duplicate `express.json`/`urlencoded`; the 10 MB body limit, cut to what a 3 MB photo in base64 needs.
- **Find-then-create races** in `addRating`/`addTextReview`/`toggleCharacteristic`/`toggleFavorite`: a concurrent first write hits the unique index and becomes a 500. Use an upsert.
- **Length limits** for `reviewText`, `displayName` and the password (bcrypt ignores bytes past 72).
- **Input validation:** `addRating`/`addTextReview` never check that `placeId` is a valid, existing Place.
- **Frontend handoffs** (settled with the Guest delete ticket, one added by the email-change ticket): six, each fully decided, so each is a `ready-for-agent` ticket (not a `problem.md`) in `../berlincoffeemap/.scratch/backend-hardening/issues/`, written by the final ticketing task alongside the backend tickets: `existingPlaceId` on `DUPLICATE_GOOGLE_PLACE_ID` (error contract); stop the Vercel `dev` deploy (config); reset the auth store on `UNAUTHENTICATED` (session revocation); reCAPTCHA v3 on reset and resend (abuse limits); delete control on a Guest's own Review (Guest delete); `EMAIL_TAKEN` toast instead of the resend modal on confirm (email-change collisions). Each blocked by the backend ticket it follows.
- **Infrastructure clients (A5)** extracted into thin modules as a side effect of the tickets that touch them; not a ticket of their own.

## Decisions so far

<!-- one line per resolved ticket -->

- [Type resolvers with the generated GraphQL types](issues/02-type-resolvers-with-codegen.md): 41 tsc errors on the surface, 75 per axis; almost all mechanical (`_: never`, per-file contexts, wrong mappers, TS enums). Real bugs: the `deleteReview`/`toggleCharacteristic` error branches (→ error contract) and schema fields the resolvers never fill. Slicing: one mechanical "typed resolvers" ticket after the error contract, plus a small schema ticket.
- [Error contract and auth guards for resolvers](issues/01-error-contract-and-auth-guards.md): an authored `GraphQLError` passes through with its message and extensions; anything else is masked to `INTERNAL_SERVER_ERROR` and logged once in `formatError`. No catch-and-rewrap, no `extensions.error`, failures thrown and never returned. A sync `requireUser` throws `UNAUTHENTICATED`; `UNAUTHORIZED` is gone; one typed code catalogue. Sliced into a Foundation ticket (blocks every fix) and a resolver Sweep; the only frontend handoff is `existingPlaceId`.
- [Revoking sessions](issues/04-session-revocation.md): a `sessionVersion` on `User`, checked in both tokens on every request (instant, all-device revocation); bumped by password change (calling device re-issued) and reset; one secret, fixed 7 days, pre-deploy tokens rejected; cookies cleared only for a failed token, `lastActive` as a non-failing `updateOne`. One ticket after Foundation; frontend ticket: reset the auth store on `UNAUTHENTICATED`.
- [Single config module and a deploy gated on tests](issues/03-config-and-deploy-pipeline.md): one validated `config`, the only reader of `process.env`; `NODE_ENV` strictly `production|development|test`, production = `"production"`; domains derived from the mode; `dev.3welle.com` dropped (frontend: stop the Vercel `dev` deploy). Deploy reuses `ci.yml` as a gate; server installs into `releases/<sha>`, swaps a `current` symlink, HTTP health check with rollback. Three tickets.
- [Google sign-in for an email that already has an account](issues/05-google-login-existing-email.md): link automatically by verified email; `email_verified: false` refused; a different `googleId` on that email refused; linking to an unconfirmed account wipes its password (squatter protection). `isFirstLogin` = "this was a sign-up". One ticket, no frontend handoff.
- [Abuse limits on sign-in and email-sending endpoints](issues/06-abuse-limits-on-auth-and-email.md): in-memory limits keyed by IP plus normalized email; sign-in 20/15min per IP + 10 failures/hour per email, no captcha; one per-recipient mail bucket (3/h, 10/day) over reset/resend/register/email-change, silent on reset; reCAPTCHA v3 on reset and resend; resend and the Google-only sign-in branch stop revealing accounts, register keeps "already exists". One backend ticket after Foundation + email normalization; one small frontend ticket.
- [Email module, escaping, and the contact-form confirmation mail](issues/07-email-module-and-escaping.md): the contact-form "thank you" mail is dropped; one `src/mail/` module with a function per mail, an escaping `html` template and a swappable transport; a failed send throws only where the mail is the operation (contact, report), otherwise logged (resend included); `ADMIN_EMAIL` into config; Reply-To on contact mail; per-IP limits on contact/report; the recipient bucket lives in the module, checked before state is written, silent for reset and resend. One backend ticket, no frontend handoff.
- [What deleting an account removes](issues/08-account-deletion-scope.md): Reviews (with Photos), Favorites, avatar and claimed Guest identities deleted; Place suggestions stay with `userId` unset; no separate revocation (a missing User fails the `sessionVersion` check), cookies cleared on the calling device. One retryable operation: ImageKit first (failure aborts, DB untouched), User deleted last. One backend ticket after Foundation, session revocation and the avatar fix; no frontend handoff.
- [Can a Guest delete their own Review?](issues/09-guest-deletes-own-review.md): a gap, fixed. `deleteReview` resolves the owner through `resolveReviewActor` (headers only, no new arguments), all three options open to Guests, errors per the contract; the empty document after `deleteAll` stays; clearing Photos uses the throwing folder delete. One backend ticket after Foundation and account deletion; frontend ticket: show delete on a Guest's own Review.
- [Email change to an address someone else takes before it is confirmed](issues/11-pending-email-collisions.md): no reservation, the address goes to whoever first proves the mailbox; `confirmEmail` finds the User by token hash; a confirmed owner → `EMAIL_TAKEN` and the pending change is cleared, an unconfirmed owner is deleted; resend picks the owner, else the latest pending User. One backend ticket after Foundation, email normalization and 05; frontend ticket: `EMAIL_TAKEN` toast.
- [Write the implement-ready tickets](issues/10-write-implement-tickets.md): 23 backend tickets in `.scratch/backend-hardening/issues/` (foundations 01–04, bugs 05–17, operations 18–20, refactors 21–23; resolver fixes blocked by typed resolvers) and 6 frontend tickets in `../berlincoffeemap/.scratch/backend-hardening/issues/`. Small findings bundled when they touch the same code (input validation, HTTP surface, dead code), split when different in nature (`placeId` index vs Place stats module).

## Not yet specified

- Nothing: the grouping question was settled by [Write the implement-ready tickets](issues/10-write-implement-tickets.md).

## Out of scope

- Splitting `Interaction` into separate Review/Favorite documents (A6): a large data migration for moderate pain.
- Folder layout / renaming of resolvers (`logoutReslover` etc.): cosmetic, disappears with the error-contract refactor where files are touched anyway.
- Removing the rollout-compatibility leftovers (`guestId`/`guestSecret` arguments, optional `captchaToken`): cleanup for its own sake, not a fix.
- Re-authentication before deleting an account, and an "account deleted" mail (raised in [What deleting an account removes](issues/08-account-deletion-scope.md)): not an audit finding; a hijacked Session is already revocable by a password change, and a mail after the fact saves nothing.
