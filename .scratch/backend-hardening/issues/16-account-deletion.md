# 16: Deleting an account removes everything personal, retryably

Status: ready-for-agent
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
- [ ] full removal: Interactions, Photo folders, avatar, claimed Guest identities and the User are gone; cookies cleared on the calling device;
- [ ] the User's Place suggestions remain with no `userId` field;
- [ ] a failing ImageKit call fails the operation and leaves the database untouched;
- [ ] a retry after a mid-way database failure (e.g. stub the User delete to fail once) completes the deletion;
- [ ] another device's token for the deleted User gets `user: null` (no crash);
- [ ] the throwing folder delete treats a missing folder as success;
- [ ] `tsc --noEmit` and `npm test` pass.
