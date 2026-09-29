# 11: Sessions can be revoked

Status: ready-for-agent
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

- [ ] Test (`tests/support/mongod.ts`): after `setNewPassword`, an old refresh token and an old access token are rejected, while the cookies issued to the calling device work.
- [ ] Test: after `resetPassword`, every old token is rejected.
- [ ] Test: a token without the `sessionVersion` claim is rejected.
- [ ] Test: an anonymous request with no auth cookies gets no `Set-Cookie`; a request with an invalid token gets its cookies cleared.
- [ ] Test: a failing `lastActive` write doesn't fail the request; a second request within 60 s doesn't write.
- [ ] `tsc --noEmit` and `npm test` pass.
- [ ] Frontend follow-up exists: `../berlincoffeemap/.scratch/backend-hardening/issues/03-reset-auth-on-unauthenticated.md` (the backend doesn't depend on it).
