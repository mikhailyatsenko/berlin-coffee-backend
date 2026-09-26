# `deleteReview` races an in-flight upload's lease

Status: ready-for-agent

## Problem

`deleteReviewResolver` clears Photos with a load-modify-`save()` and fires `deleteAllReviewImages` without awaiting it. It doesn't know about `photoUploadLease` at all. If an upload is mid-flight when a delete happens (or the reverse), the counter and the ImageKit folder can end up disagreeing:

- Delete's `interaction.reviewImages = 0; await interaction.save();` is a separate write from the upload resolver's atomic `updateOne`. Two `save()`s (delete racing another delete, or delete racing a stray non-atomic write) can lose an update.
- `deleteAllReviewImages(...)` isn't awaited, so the resolver returns (and the client moves on) before the ImageKit folder is actually gone. An upload that starts right after delete returns can take the lease, land at `image_1.jpg`, and get counted — and then the still-in-flight `deleteFolder` call wipes it out from under the just-saved photo.

## Current behaviour

`src/graphql/resolvers/deleteReviewResolver/deleteReviewResolver.ts`:
- `deleteReviewText` branch: `interaction.reviewText = undefined; deleteAllReviewImages(...); interaction.reviewImages = 0;` then `await interaction.save();` — the delete call isn't awaited, and it fires even when `reviewImages` was already `0` (empty folder, harmless but wasteful).
- `deleteAll` branch: same pattern, gated by `if (interaction.reviewImages && interaction.reviewImages > 0)`.
- Neither branch touches or checks `photoUploadLease`.

## Expected behaviour

- Clear `reviewImages` with an atomic `findOneAndUpdate` (matching the pattern already used in `uploadReviewImageResolver`), not `load → mutate → save()`, so it can't race a concurrent atomic write and lose it.
- `await deleteAllReviewImages(...)` before the resolver returns, so a client that gets the delete response knows the folder is actually gone (accepted cost: delete becomes as slow as an ImageKit call, matching the precedent already set on the upload path).
- Skip the ImageKit call entirely when there's nothing to delete (`reviewImages` was already 0) — already done for `deleteAll` via the `if`, missing for `deleteReviewText`.
- An upload whose lease was taken before the delete, and whose commit lands after: the existing commit guard (`reviewImages: previous`) already fails it once the counter has moved to 0, so no extra lease-awareness is needed here — confirm this with a test rather than adding new coordination.

## Acceptance criteria

- [ ] `deleteReviewText` and `deleteAll` both clear `reviewImages` via an atomic update, not `save()`.
- [ ] Both branches `await` `deleteAllReviewImages` before returning.
- [ ] `deleteReviewText` skips the ImageKit call when `reviewImages` is already 0.
- [ ] A regression test: an upload's lease is taken, then `deleteReview` runs to completion, then the upload's commit — the commit must fail (`INTERNAL_SERVER_ERROR` to the client) and the counter must stay at 0, no orphaned file.
