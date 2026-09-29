# 01: Error contract foundation: error module, `formatError`, `requireUser`

Status: ready-for-agent
Blocked by: None (can start immediately)
Source: [Error contract and auth guards](../../backend-audit/issues/01-error-contract-and-auth-guards.md), points 1, 4, 5, 9, 10

## Problem

Resolvers have no shared rule for which errors reach the client. `formatError` keeps only `extensions.code`, so `retryAfterSeconds`, `reason` and anything the frontend might need (e.g. the existing Place id on `DUPLICATE_GOOGLE_PLACE_ID`) never arrive, while unexpected errors (Mongo, ImageKit, bcrypt, MailerSend) go out with their raw message. Every resolver writes its own auth check with its own code.

## Current behaviour

- `formatError` in `src/index.ts` logs every error, then returns `message` + `code` only (`code` falls back to `INTERNAL_SERVER_ERROR`). It lives inside `bootstrapServer`, so it can't be tested without starting the server.
- No error module: codes are string literals across ~40 resolvers (`UNAUTHORIZED`, `UNAUTHENTICATED`, `USER_NOT_FOUND`, …).
- Eight hand-written "is someone signed in" checks, each different.

## Expected behaviour

- **One error module** with a typed code union and constructors (`notFound(msg)`, `badInput(msg)`, `forbidden(msg)`, `unauthenticated()`, …). Base codes: `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_USER_INPUT`, `INTERNAL_SERVER_ERROR`. Domain codes (the client branches on them): `RATE_LIMITED`, `CAPTCHA_FAILED`, `GUEST_IDENTITY_INVALID`, `TOKEN_EXPIRED`, `INVALID_TOKEN`, `EMAIL_ALREADY_CONFIRMED`, `IMAGE_LIMIT_REACHED`, `UPLOAD_IN_PROGRESS`, `INVALID_REVIEW_LINK`, `DUPLICATE_GOOGLE_PLACE_ID`. `UNAUTHORIZED` is not in the catalogue. (`EMAIL_TAKEN` is added by ticket 15.)
- **`formatError`**, extracted so it can be tested on its own:
  - *expected* error: `unwrapResolverError(error) instanceof GraphQLError` (authored errors plus Apollo's validation/coercion errors) → `message` and every extension except `stacktrace` pass through unchanged;
  - *unexpected* error (anything else) → `INTERNAL_SERVER_ERROR` / "Something went wrong. Please try again.", no other extensions; logged once here with stack and operation path;
  - expected errors are not logged; masking is the same in development and production.
- **`requireUser(context): User`**, synchronous: returns `context.user` or throws `UNAUTHENTICATED` / "Authentication required" (no `requiresLogin` flag). It takes the shared `Context` type (ticket 04 moves it to `src/graphql/context.ts`; whichever lands first creates it there).
- **`DUPLICATE_GOOGLE_PLACE_ID`** errors carry `extensions.existingPlaceId`; the message text stays as it is for older clients.
- This ticket only lays the foundation and wires it in; migrating resolvers is ticket 02. Existing resolvers keep working unchanged (a `GraphQLError` they throw now passes through with its extensions).

## Acceptance criteria

- [ ] An error module with the typed code catalogue and constructors exists; `UNAUTHORIZED` is not in it.
- [ ] The server uses the new `formatError`; it is importable without starting the server.
- [ ] `requireUser` exists and throws `UNAUTHENTICATED` for an anonymous context.
- [ ] `DUPLICATE_GOOGLE_PLACE_ID` carries `extensions.existingPlaceId`.
- [ ] Test: an unexpected error (e.g. a plain `Error` thrown from a resolver) reaches the client as `INTERNAL_SERVER_ERROR` with the generic message and no other extensions, and is logged once.
- [ ] Test: `retryAfterSeconds`, `reason` and `existingPlaceId` on an authored error reach the client; `stacktrace` never does.
- [ ] Test: `requireUser` returns the User when present and throws `UNAUTHENTICATED` otherwise.
- [ ] `tsc --noEmit` and `npm test` pass.
- [ ] Frontend follow-up exists: `../berlincoffeemap/.scratch/backend-hardening/issues/01-existing-place-id-from-extensions.md` (reads `existingPlaceId`; the message stays, so nothing breaks before it lands).
