# 02: Resolvers follow the error contract

Status: ready-for-agent
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

- [ ] No resolver rewraps a caught error, uses `extensions.error`, or returns `success: false` / `false` for a failure.
- [ ] `grep UNAUTHORIZED src` finds nothing; every `GraphQLError` has a code from the catalogue.
- [ ] Test: `setNewPassword` with a wrong old password → `BAD_USER_INPUT` "Old password is incorrect".
- [ ] Test: `updatePersonalData` with a taken email → the "already exists" message, not a generic one.
- [ ] Test: `place` with an unknown id → `NOT_FOUND`.
- [ ] Test: `signInWithEmail` with a wrong password → `BAD_USER_INPUT`.
- [ ] Test: `deleteReview` anonymous → `UNAUTHENTICATED`; on someone else's Review → `NOT_FOUND`.
- [ ] Test: `toggleCharacteristic` / `toggleFavorite` failures are thrown errors, not `false`.
- [ ] `tsc --noEmit` and `npm test` pass.
