# 02: Resolvers follow the error contract

Status: done
Blocked by: 01 (Error contract foundation)
Source: [Error contract and auth guards](../../backend-audit/issues/01-error-contract-and-auth-guards.md), points 2–3, 5–9; [Typed resolvers](../../backend-audit/issues/02-type-resolvers-with-codegen.md) (the `deleteReview` / `toggleCharacteristic` error branches)

## Problem

Resolvers catch their own `GraphQLError`s and rethrow a vaguer one, return failures instead of throwing them, and leak raw error messages in `extensions.error`. Users see wrong or useless messages, and some failures surface as "Cannot return null for non-nullable field".

## Current behaviour

- `setNewPassword` turns "Old password is incorrect" into "Error changing password"; `updatePersonalData` hides "email taken"; `place` turns its 404 into a 500; `signInWithEmail` labels a wrong password `INTERNAL_SERVER_ERROR`.
- `deleteReview` returns `{ success: false, message }` for an anonymous caller or someone else's/a missing Review, but `DeleteReviewResult` has neither field and its `reviewId`/`averageRating`/`ratingCount` are non-null, so the client gets a non-null violation. `toggleCharacteristic` returns `false` for a `SuccessResponse!`; `toggleFavorite` returns `false`; `deleteAccount` throws a Russian plain `Error`.
- Many resolvers wrap their body in `try { … } catch (e) { console.error(…); throw new GraphQLError("Error …", { extensions: { error: e.message } }) }`.
- Some `GraphQLError`s have no code (register, resend, `toggleFavorite` "Place not found", Google login, `setNewPassword` "Something wrong"). `UNAUTHORIZED` is used for wrong passwords and bad reset tokens; `confirmEmail` throws `USER_NOT_FOUND` / `INVALID_EMAIL`.

## Expected behaviour

- No catch-and-rewrap: the `try/catch` blocks that only rewrap or log go; `formatError` masks and logs. `try/finally` stays where it cleans up (upload leases, the photo fence).
- `extensions.error` appears nowhere.
- Every "must be signed in" check is `requireUser` (all eight, including `deleteReview`, `toggleFavorite`, `deleteAccount`); the redundant `User.findById(context.user.id)` → `NOT_FOUND` re-lookups go.
- Guarded: operations that mean nothing without a User (`favoritePlaces`, `userReviewActivity`, every account mutation). `currentUser` returns `null` for an anonymous caller. Public data (`place`, `placeReviews`, …) has no guard.
- A `userId` argument that isn't the caller (`uploadAvatar`, `updatePersonalData`, `setNewPassword`) → `FORBIDDEN`. Someone else's or a missing Review in `deleteReview` → `NOT_FOUND`. The `userId` arguments stay.
- Failures are thrown, never returned (`deleteReview`, `toggleFavorite`, `toggleCharacteristic`). The `success`/`message` schema fields stay.
- Codes: wrong old password → `BAD_USER_INPUT`; "Invalid token or email" in password reset → `INVALID_TOKEN`; `USER_NOT_FOUND` / `INVALID_EMAIL` in `confirmEmail` → `INVALID_TOKEN`; every code-less `GraphQLError` gets one; `UNAUTHORIZED` is gone from the codebase. Codes come from the error module's constructors.
- Messages stay English and user-facing (the frontend renders `error.message` in ~12 places).

## Acceptance criteria

- [x] No resolver rewraps a caught error, uses `extensions.error`, or returns `success: false` / `false` for a failure.
- [x] `grep UNAUTHORIZED src` finds nothing; every `GraphQLError` has a code from the catalogue.
- [x] Test: `setNewPassword` with a wrong old password → `BAD_USER_INPUT` "Old password is incorrect".
- [x] Test: `updatePersonalData` with a taken email → the "already exists" message, not a generic one.
- [x] Test: `place` with an unknown id → `NOT_FOUND`.
- [x] Test: `signInWithEmail` with a wrong password → `BAD_USER_INPUT`.
- [x] Test: `deleteReview` anonymous → `UNAUTHENTICATED`; on someone else's Review → `NOT_FOUND`.
- [x] Test: `toggleCharacteristic` / `toggleFavorite` failures are thrown errors, not `false`.
- [x] `tsc --noEmit` and `npm test` pass.

## Comments

**2026-09-29, implemented** (branch `feat/resolvers-follow-error-contract`).

- Every authored error is built by `src/graphql/errors.ts` (`appError` and the constructors), in the resolvers and in `utils/` (`guestAuth`, `reviewActor`, `rateLimit`, `verifyRecaptcha`, `placeSuggestionToken`). `new GraphQLError` appears only in `errors.ts`; `UNAUTHORIZED` and `extensions.error` are gone.
- `requireUser` guards the eight hand-written checks plus `favoritePlaces`, `userReviewActivity` and `claimGuestReviews`; the `User.findById` re-lookups are gone (`context.user` is saved directly). `userReviewActivity` now throws `UNAUTHENTICATED` for an anonymous caller instead of returning `[]`; the client only calls it from MyReviews. `reviewActor`'s "Authentication required" lost its `requiresLogin` flag (the client never read it).
- Catches that swallow on purpose stay: best-effort mail sends (`registerUser`, `updatePersonalData`, `requestPasswordReset`) and the old-avatar deletes. They neither rewrap nor fail the mutation. `uploadReviewImage` keeps its catch only to release the lease, then rethrows the original error.
- Decisions beyond the letter of the ticket:
  - `SUGGESTION_NOT_PENDING` (not in the catalogue, the client doesn't branch on it) → `FORBIDDEN`. Not `BAD_USER_INPUT`: the client's `getPhotoFailureReason` reads that as an unreadable file.
  - `GOOGLE_LOOKUP_FAILED` removed: a failed Google lookup is an unexpected error, masked and logged by `formatError`. The client only used the code in a test mock; the admin now sees the generic message.
  - Internal inconsistencies throw a plain `Error` (masked and logged), not an authored one: a missing `MAILERSEND_API_KEY` (it used to reach the client as an expected INTERNAL_SERVER_ERROR with that message), a User with neither password nor Google id in `setNewPassword` (the ticket's "Something wrong"), a photo uploaded but not counted. Rewraps like "Failed to upload photo" and publish's "Failed to copy … try Publish again" are gone.
  - `http: { status }` dropped from `place` / `filteredPlaces` errors (an unknown place was a 500 before; now a 200 with `NOT_FOUND`). The client doesn't read the status.
  - `confirmEmail`: an unknown email, a mismatched one and a wrong token all give `INVALID_TOKEN` "Invalid confirmation link". `resendConfirmationEmail`: unknown email → `NOT_FOUND`, already confirmed → `EMAIL_ALREADY_CONFIRMED`.
  - `utils/imagekit.ts` upload helpers no longer log before rethrowing; they pass the ImageKit error as `cause`, so `formatError` logs it once.
- Follow-up worth a look: `resendConfirmationEmail`'s "User with this email does not exist." still reveals which emails are registered (it did before too), which the `confirmEmail` decision avoids. Not in this ticket's scope.
- Tests: `tests/resolverErrors.test.ts` covers every test in the acceptance criteria (plus FORBIDDEN / UNAUTHENTICATED for `setNewPassword` and a database failure in `toggleFavorite` being thrown). `tests/support/clientCode.ts` runs a thrown error through the real `formatError`, so the older suggestion and lease-race tests now assert the code the client receives. `tsc --noEmit` is clean and `npm test` passes 115/115.
- Frontend: nothing to hand off. No code the client branches on changed meaning, and the messages it renders are now the authored ones.
