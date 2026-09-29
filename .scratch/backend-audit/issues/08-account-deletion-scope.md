# What deleting an account removes

Type: grilling
Status: resolved
Blocked by: none

## Question

What exactly happens to a User's things when they delete their account?

Today `deleteAccount` deletes the User's Interactions and the User, nothing else. Left behind: the avatar and every Review's Photos in ImageKit, `GuestIdentity.claimedBy` pointing at a missing User, and Place suggestions with `userId`. Decide per item: delete or anonymize? For example, keep Reviews as anonymous the way an unclaimed Guest Review stays anonymous, or delete them together with their Photos. Also: does it revoke sessions (see the session revocation ticket), and is it a single operation that can be retried if ImageKit fails halfway? Glossary impact: CONTEXT.md says nothing about what outlives a User.

## Answer

Resolved 2026-09-27 (grilling). Deleting an account is one retryable operation that removes everything personal and keeps only the Place suggestions, unlinked.

Per item:

- **Reviews, Favorites, Visits** (the User's `Interaction`s): deleted, Photos included (ImageKit folder `3welle/review-images/<placeId>/<reviewId>` of each). No anonymous "orphan" Review: that would be a new state (neither `userId` nor `guestId`) and contradict the frontend's promise ("all your data, including reviews and ratings, will be permanently removed"). Average ratings change accordingly.
- **Avatar**: deleted from ImageKit. Depends on the avatar fix (`deleteAvatar` gets a path, not the URL; see map Notes).
- **Place suggestions** (`userId`): all stay, any status; `userId` is `$unset` (never set to null, per the model). The suggestion becomes anonymous: the admin can still publish it, nobody is notified. `placeSuggestionForReview` then reports `suggestedBy: "guest"` (it only tests `userId`); acceptable, no new value.
- **Guest identities** with `claimedBy` = this User: deleted. They are unusable anyway (`already_claimed`), and the frontend drops any credentials answered with `GUEST_IDENTITY_INVALID` and mints fresh ones, so no client change.
- **Sessions**: no separate revocation. With the session revocation ticket every request loads the User to check `sessionVersion`; a deleted User fails that check, so every other device gets `UNAUTHENTICATED` (and its frontend ticket resets the auth store). The resolver clears the auth cookies on the calling device.

Order and retry:

1. ImageKit first: the avatar and every Review Photo folder. Any failure fails the whole operation with nothing in the database touched; the User retries. Needs a throwing folder delete (today's `deleteImageKitFolder` logs and returns `false`); a missing file or folder counts as success, so a retry passes over what is already gone.
2. Then the database: delete Interactions, unset `userId` on suggestions, delete claimed Guest identities, delete the User **last**. Every step is idempotent, and the User row is the point of no return, so a crash at any step is finished by retrying.
3. Clear the calling device's cookies, return success. Errors follow the error contract (thrown, masked unless authored); `requireUser` guards it.

A Photo upload racing the deletion is not handled specially: its commit finds no Interaction.

Not done (see map Out of scope): re-authentication before deleting, and an "account deleted" mail. `src/mail/` and the recipient bucket are not touched.

Glossary: `CONTEXT.md` **User** now says what deleting the account removes; **Place suggestion** says it outlives its author.

Final ticketing: one backend ticket, after Foundation (error contract), session revocation and the avatar fix. Test on `tests/support/mongod.ts` with ImageKit stubbed: full removal, suggestions unlinked, Guest identity gone, a failing ImageKit call leaves the database untouched, and a retry after a mid-way failure completes. No frontend handoff: the operation keeps its shape and the UI text already matches.
