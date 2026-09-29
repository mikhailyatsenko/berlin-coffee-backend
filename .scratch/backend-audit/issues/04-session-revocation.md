# Revoking sessions

Type: grilling
Status: resolved
Blocked by: none

## Question

How does a User's session get revoked?

Today the refresh token (`utils/jwt.ts`) is a 7-day stateless JWT signed with the same `JWT_SECRET` as the access token. It is never rotated, and nothing invalidates it: logout only clears cookies, and changing the password, resetting it or confirming an email change leave every existing session alive. Options: a `tokenVersion` on `User` checked on refresh (cheap, revokes all sessions at once), or stored refresh tokens with rotation and reuse detection (per-device, more moving parts). Also decide which events revoke (logout of this device vs all, password change, password reset, account deletion) and whether access and refresh tokens get separate secrets. Related: the context builder calls `clearAuthCookies` on every anonymous request (`src/index.ts:123`), and `updateLastActive` writes on the request path.

## Answer

Resolved 2026-09-27 (grilling). Facts behind it: the context builder (`src/index.ts:110`) already loads the User by id on every request and silently issues a new access token from the refresh token; the frontend never calls the `refreshToken` mutation. The refresh token is never rotated, so a Session lasts exactly 7 days from sign-in. `logout` clears cookies with its own hard-coded options. The frontend doesn't react to `UNAUTHENTICATED`; `ResetPasswordPage` already calls `logout` before showing the form.

### The decision

1. **Mechanism: `sessionVersion: number` on `User`** (default 0), carried as a claim in both the access and the refresh token and compared with the loaded User in the context builder on every request. A mismatch means no User (`user: null`), so `requireUser` from the error contract throws `UNAUTHENTICATED` without knowing about revocation. Because the check runs on the access token too, revocation is immediate, not after 15 minutes. No stored refresh tokens, no rotation, no per-device revocation: 15 Users and no device-list UI; the accepted cost is that a refresh token stolen before a plain sign-out stays valid for up to 7 days unless the password is changed or reset.
2. **Events that revoke all Sessions** (increment `sessionVersion`):
   - `setNewPassword`: revokes all, then re-issues cookies with the new version for the calling device, so it stays signed in.
   - `resetPassword`: revokes all, issues nothing.
   - Not revoking: confirming an email change (proves ownership, not compromise); `logout` (this device only, clears cookies); account deletion needs nothing, the User lookup returns `null` (the rest is the account deletion ticket).
   - No "sign out everywhere" mutation: no UI for it, a new feature.
3. **One `JWT_SECRET`** for both tokens stays; the `type` claim, checked both ways, already prevents using one as the other.
4. **Session length stays fixed at 7 days** from sign-in (no sliding refresh): a UX question, not revocation, and easy to add later.
5. **Tokens without the version claim are rejected**: every User signs in once more after the deploy. No compatibility branch.
6. **Cookies are cleared only when a token came in and failed** (invalid, expired or revoked), not on every anonymous request; `logout` uses the shared `clearAuthCookies` instead of its own options.
7. **`updateLastActive`** becomes a conditional `updateOne` (`lastActive` older than 60 s) whose failure is logged and doesn't fail the request, replacing the awaited full `user.save()`.
8. The `refreshToken` mutation gets the check for free through the shared `refreshAccessToken`; it stays (removing it is cleanup).

`CONTEXT.md`: added **Session**. No ADR: `sessionVersion` is easy to replace with stored Sessions if per-device revocation is ever wanted.

### For the final ticketing (ticket 10)

- **One ticket "Session revocation"**, blocked by the error-contract Foundation (`requireUser`, error module): points 1–7, with tests on `tests/support/mongod.ts`: after `setNewPassword` an old refresh token is rejected while the calling device stays signed in; after `resetPassword` every old token is rejected; a token without the claim is rejected; an anonymous request gets no `Set-Cookie`; a failing `lastActive` write doesn't fail the request.
- **Frontend handoff:** a `ready-for-agent` ticket in `../berlincoffeemap/.scratch/`, low priority: on `UNAUTHENTICATED` in the Apollo error link, reset the auth store to signed-out (without calling `logout`). Already an issue when a Session expires after 7 days; revocation makes it more frequent. The backend doesn't depend on it.
