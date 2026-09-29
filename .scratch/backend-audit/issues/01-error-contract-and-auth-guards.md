# Error contract and auth guards for resolvers

Type: grilling
Status: resolved
Blocked by: none

## Question

What is the single contract for errors and authorization checks across resolvers (architecture item A1)?

- Which error codes and messages reach the client, and which are hidden behind a generic `INTERNAL_SERVER_ERROR`? Today `formatError` (`src/index.ts:68`) keeps only `code`, dropping `retryAfterSeconds`, `reason` and `requiresLogin`, while resolvers leak raw `error.message` in `extensions.error`.
- How do resolvers stop re-wrapping their own `GraphQLError`s? `setNewPassword` turns "Old password is incorrect" into "Error changing password", `updatePersonalData` hides "email taken", `place` turns its 404 into a 500, and `signInWithEmail` labels a wrong password `INTERNAL_SERVER_ERROR`.
- One `requireUser` guard, with one code (`UNAUTHENTICATED` vs `UNAUTHORIZED`), replacing the eight hand-written checks. Today these differ: `return {success:false}` in `deleteReview`, `return false` in `toggleFavorite`, and a Russian `throw new Error` in `deleteAccount`.
- Does the frontend depend on any current message text? It reads only `extensions.code` today (`../berlincoffeemap/src/shared/config/apolloClient.ts:39`), but UI messages may render `error.message`.

## Answer

Resolved 2026-09-27 (grilling). Facts behind it: the frontend branches only on `extensions.code` (`GUEST_IDENTITY_INVALID`, `EMAIL_ALREADY_CONFIRMED`, `TOKEN_EXPIRED`, `RATE_LIMITED`, `IMAGE_LIMIT_REACHED`, `UPLOAD_IN_PROGRESS`, `INVALID_REVIEW_LINK`, `DUPLICATE_GOOGLE_PLACE_ID`) and never reads `retryAfterSeconds`, `reason` or `requiresLogin`. But it renders `error.message` to the user in ~12 places (AuthModal, LoginPage, account settings forms, AvatarUpload, reset/resend toasts, ErrorPlace, ErrorLoadingPlaces), and `reviewErrors.ts:20` regex-parses the existing Place id out of the `DUPLICATE_GOOGLE_PLACE_ID` message. `context.user` is already the loaded User document (`src/index.ts:114`). `useDeleteReview` never looks at `success`: on `{success:false}` the response violates the non-null `DeleteReviewResult` fields (see ticket 02).

### The contract

1. **Two classes of error.** *Expected*: a `GraphQLError` thrown on purpose (plus Apollo's own validation/coercion errors). Its `message` (English, user-facing, the frontend shows it) and all its `extensions` except `stacktrace` reach the client unchanged. *Unexpected*: anything else (Mongo, ImageKit, bcrypt, MailerSend, missing env). `formatError` tells them apart by `unwrapResolverError(error) instanceof GraphQLError` (no code whitelist) and turns an unexpected one into `INTERNAL_SERVER_ERROR` / "Something went wrong. Please try again." with no other extensions. Masking is the same in dev and prod.
2. **`extensions.error` is banned** and removed from every resolver. That drops the leak of raw `error.message`.
3. **No catch-and-rewrap.** Resolvers drop their `try { … } catch { throw new GraphQLError("Error …") }` blocks entirely; `formatError` does the masking. `try/finally` stays only where cleanup is needed (upload leases, photo fence).
4. **Logging:** only unexpected errors, once, in `formatError`, with stack and operation path. Expected errors aren't logged. The per-resolver `console.error`s go with the rewraps.
5. **`requireUser(context): User`**, synchronous. It returns `context.user` or throws `UNAUTHENTICATED` / "Authentication required" (no `requiresLogin` flag). It replaces all eight hand-written checks, including `return {success:false}` in `deleteReview`, `return false` in `toggleFavorite` and the Russian `throw new Error` in `deleteAccount`. The redundant `User.findById(context.user.id)` → `NOT_FOUND` re-lookups are removed. Session revocation (ticket 04) plugs into this guard.
6. **Which operations are guarded:** an operation that means nothing without a User (`favoritePlaces`, `userReviewActivity`, every account mutation) goes through `requireUser`. A "who am I" query (`currentUser`) returns `null` for an anonymous caller. Public data (`place`, `placeReviews`, …) has no guard.
7. **Someone else's resource:** a `userId` argument that isn't the caller (`uploadAvatar`, `updatePersonalData`, `setNewPassword`) gets `FORBIDDEN`. Someone else's or a missing Review (`deleteReview`) gets `NOT_FOUND`, which doesn't reveal which ids exist. The `userId` arguments stay (removing them is cleanup).
8. **Failures are thrown, never returned.** No resolver returns `success: false` or `false` for a failure (`deleteReview`, `toggleFavorite`, `toggleCharacteristic`). The `success`/`message` schema fields stay.
9. **Code catalogue**, in one module with a typed code union and constructors (`notFound(msg)`, `badInput(msg)`, `forbidden(msg)`, …). Base codes: `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_USER_INPUT`, `INTERNAL_SERVER_ERROR`. Domain codes only where the client branches: `RATE_LIMITED`, `CAPTCHA_FAILED`, `GUEST_IDENTITY_INVALID`, `TOKEN_EXPIRED`, `INVALID_TOKEN`, `EMAIL_ALREADY_CONFIRMED`, `IMAGE_LIMIT_REACHED`, `UPLOAD_IN_PROGRESS`, `INVALID_REVIEW_LINK`, `DUPLICATE_GOOGLE_PLACE_ID`. Changes:
   - `UNAUTHORIZED` disappears. Wrong old password → `BAD_USER_INPUT`; "Invalid token or email" in password reset → `INVALID_TOKEN`.
   - `USER_NOT_FOUND` and `INVALID_EMAIL` in `confirmEmail` → `INVALID_TOKEN` (the same "broken link" to the user; doesn't reveal which emails are registered; the client doesn't read them).
   - Every bare `new GraphQLError("…")` without a code gets one (register, resend, `toggleFavorite` "Place not found", Google login, `setNewPassword` "Something wrong").
   - Specific bugs this fixes: `setNewPassword` returns "Old password is incorrect", `updatePersonalData` returns "email taken", `place` returns `NOT_FOUND` instead of a 500, `signInWithEmail` returns `BAD_USER_INPUT` for a wrong password.
10. **`DUPLICATE_GOOGLE_PLACE_ID` carries `extensions.existingPlaceId`**; the message text stays for backward compatibility.

No `CONTEXT.md` change (these are implementation terms, not domain terms). No ADR: easy to reverse, and the error module documents it.

### For the final ticketing (ticket 10)

- **Foundation ticket "Error contract":** the error module, the new `formatError` (masking, extension pass-through, logging) and `requireUser`, with tests: an unexpected error is masked, and `retryAfterSeconds`/`reason`/`existingPlaceId` reach the client. It lands before every other fix, and before "Typed resolvers" (ticket 02 asks for that order); `requireUser` takes the `Context` that ticket moves to `src/graphql/context.ts`, whichever lands first.
- **Sweep ticket "Resolvers follow the error contract"**, blocked by Foundation: points 3–10 across all resolvers, with a test per bug fixed (the four in point 9, plus `deleteReview` for anonymous and foreign callers). The other audit fixes depend on Foundation only, not on the Sweep.
- **Frontend handoff:** nothing on the client breaks; messages just get more accurate. The one frontend change is to read `extensions.existingPlaceId` instead of regex-parsing the message (`../berlincoffeemap/src/pages/SuggestionReviewPage/lib/reviewErrors.ts`). It's fully decided, so it becomes a `ready-for-agent` ticket in `../berlincoffeemap/.scratch/`, low priority.
