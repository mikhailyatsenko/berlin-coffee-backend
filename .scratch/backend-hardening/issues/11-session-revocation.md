# 11: Sessions can be revoked

Status: done
Blocked by: 01 (Error contract foundation), 03 (Config module), 04 (Typed resolvers)
Source: [Revoking sessions](../../backend-audit/issues/04-session-revocation.md); glossary: **Session** in `CONTEXT.md`

## Problem

Nothing ends a Session before its 7 days run out. Changing or resetting a password leaves every existing token valid, so a stolen token survives the very action a User takes to lock an attacker out. The context builder also clears cookies on every anonymous request and awaits a full `user.save()` on every signed-in one.

## Current behaviour

- Access (15 min) and refresh (7 days) tokens are stateless JWTs carrying `{ id, type }`, signed with `JWT_SECRET`; the context builder loads the User by id on every request and silently issues a new access token from the refresh token.
- `setNewPassword` / `resetPassword` don't touch existing Sessions.
- The context builder calls `clearAuthCookies` whenever there is no User, including requests that sent no token at all; `logout` clears cookies with its own options (ticket 03 moves it to shared settings).
- `updateLastActive` awaits `user.save()` on the request path.

## Expected behaviour

1. `User.sessionVersion: number` (default 0). Both tokens carry it as a claim; the context builder compares it with the loaded User on every request (access and refresh path). Mismatch → no User (`user: null`), so `requireUser` throws `UNAUTHENTICATED`. Revocation is immediate.
2. `setNewPassword` increments `sessionVersion` and re-issues both cookies with the new version for the calling device (it stays signed in). `resetPassword` increments it and issues nothing. Confirming an email change, `logout` and account deletion don't increment it.
3. One `JWT_SECRET` stays; the `type` claim is checked both ways. Session length stays 7 days from sign-in (no sliding refresh).
4. Tokens without the version claim are rejected (everyone signs in once after the deploy; no compatibility branch).
5. Cookies are cleared only when a token came in and failed (invalid, expired or revoked), not on every anonymous request; `logout` uses the shared `clearAuthCookies`.
6. `updateLastActive` is a conditional `updateOne` (only when `lastActive` is older than 60 s); its failure is logged and doesn't fail the request.
7. The `refreshToken` mutation gets the check through the shared `refreshAccessToken`.
8. The context builder is extracted from `src/index.ts` so it can be tested.

## Acceptance criteria

- [x] Test (`tests/support/mongod.ts`): after `setNewPassword`, an old refresh token and an old access token are rejected, while the cookies issued to the calling device work.
- [x] Test: after `resetPassword`, every old token is rejected.
- [x] Test: a token without the `sessionVersion` claim is rejected.
- [x] Test: an anonymous request with no auth cookies gets no `Set-Cookie`; a request with an invalid token gets its cookies cleared.
- [x] Test: a failing `lastActive` write doesn't fail the request; a second request within 60 s doesn't write.
- [x] `tsc --noEmit` and `npm test` pass.
- [x] Frontend follow-up exists: `../berlincoffeemap/.scratch/backend-hardening/issues/03-reset-auth-on-unauthenticated.md` (the backend doesn't depend on it).

## Comments

2026-09-29 (implement): Done on `feat/session-revocation`.
- `User.sessionVersion` (default 0) is signed into both tokens (`src/utils/jwt.ts`); `verifyTokenOfType` checks the `type` claim and rejects tokens without a numeric `sessionVersion`, and `userFromToken` (`src/utils/tokenUtils.ts`) compares it with the loaded User on both the access and refresh path, so the `refreshToken` mutation gets the check too.
- `setNewPassword` and `resetPassword` do `user.$inc("sessionVersion", 1)`; `setNewPassword` then re-issues both cookies. `setAuthCookies` now takes the User, not an id; `createJWT` is gone.
- The context builder moved from `src/app.ts` (not `src/index.ts`, it had moved already) to `src/graphql/buildContext.ts`; it clears cookies only when a token came in and failed.
- `updateLastActive` is a conditional `updateOne` that logs its failure. `loginWithGoogle` used it to save a new User, so it now does `user.save()` itself.
- Tests: `tests/sessionRevocation.test.ts` (13), including a User stored without `sessionVersion` (Mongoose fills in 0) and a parallel request that must not overwrite a newer `lastActive`.
- Known and accepted: two `setNewPassword` calls at the same moment can leave one device's new cookies a version behind, which signs that device out (safe, not a hole).
