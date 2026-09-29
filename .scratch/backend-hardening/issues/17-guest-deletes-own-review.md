# 17: A Guest can delete their own Review

Status: ready-for-agent
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
- [ ] a Guest deletes the text, the Rating, and everything of their own Review;
- [ ] a Guest can't delete another Guest's or a User's Review → `NOT_FOUND`;
- [ ] no identity → `UNAUTHENTICATED`; invalid identity → `GUEST_IDENTITY_INVALID`;
- [ ] a failing folder delete leaves the text and the Photos in place;
- [ ] the existing `deleteReviewLeaseRace` test still passes;
- [ ] `tsc --noEmit` and `npm test` pass.
- [ ] Frontend follow-up exists: `../berlincoffeemap/.scratch/backend-hardening/issues/05-guest-deletes-own-review.md`.
