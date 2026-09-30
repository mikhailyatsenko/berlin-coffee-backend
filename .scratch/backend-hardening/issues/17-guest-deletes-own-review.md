# 17: A Guest can delete their own Review

Status: done
Blocked by: 16 (Account deletion: the throwing folder delete)
Source: [Can a Guest delete their own Review?](../../backend-audit/issues/09-guest-deletes-own-review.md); glossary: **Guest identity**, **Review** in `CONTEXT.md`

## Problem

A Guest can write, rate and add Photos to a Review but can't remove any of it. That is a gap, not a decision: every other Review mutation resolves the caller through `resolveReviewActor`, `deleteReview` alone checks for a signed-in User.

## Current behaviour

- `deleteReview` requires `context.user` and matches `userId` only (`deleteReviewResolver.ts`; its comment says Guest Reviews stay "out of reach until claimed").
- When it clears Photos it uses `deleteAllReviewImages` / `deleteImageKitFolder`, which logs and returns `false` on failure, so the counter can be reset over files still in the folder.

## Expected behaviour

- `deleteReview` resolves the owner with `resolveReviewActor` (headers only, **no** new `guestId`/`guestSecret` arguments) and finds the Review by `actor.owner` (`userId` or `guestId`). All three options (`deleteReviewText`, `deleteRating`, `deleteAll`) work for Guests through the same code path.
- Errors per the contract: neither User nor Guest → `UNAUTHENTICATED`; invalid Guest credentials → `GUEST_IDENTITY_INVALID`; someone else's or a missing Review → `NOT_FOUND`. No abuse limit.
- The empty document after `deleteAll` stays, as for a User.
- Clearing Photos (User and Guest) uses the throwing folder delete from ticket 16: an ImageKit failure fails the delete and leaves text and Photo list untouched. Fence and lease logic stays.

## Acceptance criteria

Tests on `tests/support/mongod.ts` with ImageKit stubbed:
- [x] a Guest deletes the text, the Rating, and everything of their own Review;
- [x] a Guest can't delete another Guest's or a User's Review → `NOT_FOUND`;
- [x] no identity → `UNAUTHENTICATED`; invalid identity → `GUEST_IDENTITY_INVALID`;
- [x] a failing folder delete leaves the text and the Photos in place;
- [x] the existing `deleteReviewLeaseRace` test still passes;
- [x] `tsc --noEmit` and `npm test` pass.
- [x] Frontend follow-up exists: `../berlincoffeemap/.scratch/backend-hardening/issues/05-guest-deletes-own-review.md`.

## Comments

2026-09-30 (from ticket 16): The throwing `deleteImageKitFolder` is in `src/utils/imagekit.ts` (404 = success, else throws with `cause`); `deleteReview` still uses `tryDeleteImageKitFolder`. Swapping it in is not enough: `clearPhotosBehindFence` sets `reviewImages: 0` and `$unset`s the text **before** calling `deleteFolder`, so a failure would still lose them. The fence must take the lease first, delete the folder, and only then clear the counter and fields (or restore them on failure). `deleteAllReviewImages` mentioned above no longer exists.

2026-09-30 (implement): Done on `feat/guest-deletes-own-review`.

- `deleteReviewResolver`: `resolveReviewActor(user, guest, {})` (headers only; the empty args turn off the argument form, which `deleteReview` never had), then `Interaction.findOne({ _id, ...actor.owner })`; a miss is `NOT_FOUND`. No schema change.
- `clearPhotosBehindFence` reordered: take the fence (token + `$max until`) only, delete the folder with the throwing `deleteImageKitFolder`, then `$set reviewImages: 0` + `$unset` the fields, then the unchanged release. A failed folder delete throws (`INTERNAL_SERVER_ERROR` via `formatError`) and leaves text, Rating and counter as they were; the previous lease is handed back, so an upload fenced by it can still commit.
- From code review: the late clear matches on the fence token and throws when it is gone. Otherwise a folder delete slower than the fence (upload timeout + margin) let a new upload take the lease and commit `image_N+1`, which the clear then uncounted. A retry finishes the job (a missing folder counts as deleted). Not handled: the clear `updateOne` itself failing after the folder is gone (the counter then names deleted files until a retry), the same shape as the crash case in the doc comment.
- Tests: `tests/deleteReviewOwnership.test.ts` (8): Guest deletes text / Rating / all, the empty document stays, other people's Reviews → `NOT_FOUND` for all four User/Guest pairings, `UNAUTHENTICATED`, `GUEST_IDENTITY_INVALID`, failing folder delete for User and Guest then a retry. `tests/deleteReviewLeaseRace.test.ts` +2: the fence expiring during a slow folder delete, and an upload fenced by a failing delete still committing.
- Code review, not applied: a headers-only helper instead of `resolveReviewActor(..., {})` (goes away with the argument form anyway); sharing `withCode` and the fake ImageKit `deleteFolder` across test files in `tests/support/`.
- `tsc --noEmit` clean, `npm test` 293/293. Frontend: `../berlincoffeemap/.scratch/backend-hardening/issues/05-guest-deletes-own-review.md`, to be done in a separate frontend session.
