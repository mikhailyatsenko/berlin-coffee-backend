# Google sign-in for an email that already has an account

Type: grilling
Status: resolved
Blocked by: none

## Question

What happens when someone signs in with Google using an email that already belongs to a password User?

Today `loginWithGoogle` looks up by `googleId` only (`loginWithGoogleResolver.ts:53`), then creates a second `User` with the same email. The unique index rejects it, and the person sees "Error authenticating with Google". Options: link automatically when Google says `email_verified` (the common choice, trusting Google's verification), refuse with a clear "sign in with your password, then link Google" message, or link only if the existing account's email is confirmed. Also: the existing `isFirstLogin` semantics, and what happens to an unconfirmed password account with that email (someone may have registered it with another person's address).

## Answer

**Link by verified email.** `loginWithGoogle` resolves the User in this order (email normalized as everywhere else):

1. `email_verified` is not `true` in the Google payload → refuse with `BAD_USER_INPUT` ("verify your email in your Google account"). No User is created or linked. (Today such a User is created with `isEmailConfirmed: true`.)
2. User found by `googleId` → sign in, `isFirstLogin: false`.
3. User found by email:
   - has a different `googleId` → refuse with `BAD_USER_INPUT` ("this email is linked to another Google account"). No silent re-linking.
   - email **confirmed** → set `googleId`, keep `password` and `displayName`, take the Google avatar only if the User has none. Both ways of signing in keep working. `isFirstLogin: false`.
   - email **not confirmed** → the account may have been registered with someone else's address, so its password must not start working. Set `googleId`, clear `password` and the confirmation and reset tokens, set `isEmailConfirmed: true`, take `displayName` and avatar from Google. It could never sign in, so nothing of its own is lost. `isFirstLogin: true`.
4. No User → create one as today. `isFirstLogin: true`.

`isFirstLogin` now means "from the person's point of view this was a sign-up", not "not found by `googleId`".

Why auto-link instead of refusing: Google proves ownership of the mailbox at least as well as our confirmation link, and password reset already hands any User (Google-only included) to whoever holds the mailbox, so refusing adds friction without adding safety. No notification email: it would go to the same mailbox that just proved itself.

Not in this ticket: `pendingEmail` collisions (a User's unconfirmed email change to an address that another User takes meanwhile, via Google or `registerUser`); moved to the map's fog.

Frontend: no handoff needed. The client already shows the error message and treats `isFirstLogin: false` as a plain sign-in (`useWithGoogle.ts`).

Test cases for the final ticket: each branch above (unverified, by `googleId`, conflicting `googleId`, confirmed link keeps password sign-in working, unconfirmed link makes the old password fail, new User), plus mixed-case email matching.
