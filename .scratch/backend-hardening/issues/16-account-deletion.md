# 16: Deleting an account removes everything personal, retryably

Status: done
Blocked by: 10 (Avatar replacement), 11 (Session revocation)
Source: [What deleting an account removes](../../backend-audit/issues/08-account-deletion-scope.md); glossary: **User**, **Place suggestion** in `CONTEXT.md`

## Problem

`deleteAccount` doesn't match what the frontend promises ("all your data, including reviews and ratings, will be permanently removed"), and a failure half-way can leave files or data behind with no way to finish the job.

## Current behaviour

- `deleteAccount` removes part of a User's data; Photos in ImageKit and the avatar are not reliably removed (the avatar delete is broken until ticket 10); Guest identities claimed by the User and Place suggestions' `userId` are left as they are.
- `deleteImageKitFolder` logs and returns `false` on failure, so callers can't abort on it.

## Expected behaviour

What is removed:
- the User's Interactions (Reviews, Ratings, Favorites, Visits), including each Review's Photos folder `3welle/review-images/<placeId>/<reviewId>`;
- the avatar in ImageKit (via ticket 10's helper; a Google avatar URL is skipped);
- Guest identities with `claimedBy` = this User;
- the User.

What stays: Place suggestions, any status, with `userId` `$unset` (never set to `null`); `placeSuggestionForReview` then reports `suggestedBy: "guest"`, acceptable.

Order and retry:
1. ImageKit first: avatar and every Photo folder. A **throwing** folder delete is introduced (a missing folder/file counts as success). Any failure fails the operation with nothing in the database touched.
2. Then the database: delete Interactions, unset `userId` on suggestions, delete claimed Guest identities, delete the User **last**. Every step idempotent; a retry after a crash finishes the job.
3. Clear the calling device's cookies and return success. Other devices fail the `sessionVersion` lookup (ticket 11) because the User is gone; no separate revocation.

Guarded by `requireUser`; errors per the error contract. A Photo upload racing the deletion is not handled specially. No re-authentication, no "account deleted" mail (out of scope). Average ratings change accordingly (computed on read).

## Acceptance criteria

Tests on `tests/support/mongod.ts` with ImageKit stubbed:
- [x] full removal: Interactions, Photo folders, avatar, claimed Guest identities and the User are gone; cookies cleared on the calling device;
- [x] the User's Place suggestions remain with no `userId` field;
- [x] a failing ImageKit call fails the operation and leaves the database untouched;
- [x] a retry after a mid-way database failure (e.g. stub the User delete to fail once) completes the deletion;
- [x] another device's token for the deleted User gets `user: null` (no crash);
- [x] the throwing folder delete treats a missing folder as success;
- [x] `tsc --noEmit` and `npm test` pass.

## Comments

2026-09-30 (implement): Done on `feat/account-deletion`.

- `src/utils/imagekit.ts`: `deleteImageKitFolder(path)` now throws (with `cause`) and returns `Promise<void>`; ImageKit's 404 for a missing folder (the SDK rejects with the response body, status on the non-enumerable `$ResponseMetadata`) counts as success. The old log-and-return-`false` behaviour is `tryDeleteImageKitFolder`, used by Publish, Reject and, until ticket 17, `deleteReview`. New `reviewPhotoFolder(placeId, reviewId)` replaces the inlined path.
- `deleteAccountResolver`: avatar (`avatarFilePath` + `deleteAvatar`, Google URL skipped), then the Photo folder of **every** Interaction of the User, not only those with `reviewImages > 0`, since an interrupted upload or delete can leave files behind a counter of 0. The cost is one ImageKit call per Favorite/Visit (rate-limited, 50 ms each). Then `Interaction.deleteMany`, `PlaceSuggestion.updateMany($unset userId)`, `GuestIdentity.deleteMany({ claimedBy })`, `User.deleteOne` last, then `clearAuthCookies`. An ImageKit failure is a plain `Error`, masked as `INTERNAL_SERVER_ERROR` by `formatError`.
- `CONTEXT.md` **User**: claimed Guest identities added to what deletion removes. `PlaceSuggestion.userId` doc comment fixed (it said "absent for a User's suggestion").
- Tests: `tests/accountDeletion.test.ts` (10), including a folder delete failing after the avatar is already gone (database untouched, retry finishes). `fakeResponse`/`fakeRequest` moved to `tests/support/fakeHttp.ts`, shared with `sessionRevocation.test.ts`.
- Code review, applied: "Interactions" in prose replaced with domain terms, the glossary gap, the avatar-then-folder failure test, the shared fake HTTP helpers, the log prefix restored. Not applied: sharing the fake ImageKit bucket across test files (each fake differs), a User → avatar-path helper, a type for the `(placeId, reviewId)` pair, moving the folder-delete tests out of this file.
- For ticket 17: `clearPhotosBehindFence` writes `reviewImages: 0` and the `$unset` **before** calling `deleteFolder`, so swapping in the throwing delete alone won't leave text and Photos untouched on failure; the fence needs restructuring. `deleteAllReviewImages` named in 17 no longer exists.
- `tsc --noEmit` clean, `npm test` 283/283. Once, `emailChangeCollisions` "the address taken between the check and the save" failed in a full run and passed 6/6 alone, with and without this branch: a flaky race test, not this change. No frontend change: `deleteAccount`'s shape is unchanged.
